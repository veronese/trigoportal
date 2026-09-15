"""Leitura e escrita dos parâmetros do sistema.

O catálogo continua sendo a fonte de verdade do que existe; esta camada lê o
que está gravado e aplica o padrão quando o valor não foi customizado.

SOBRE O SEGREDO: o valor cifrado NUNCA sai daqui. ``listar`` devolve o usuário
de uma credencial, porque isso ajuda na conferência, e nunca a senha — nem
mascarada, para não sugerir que existe um jeito de lê-la pela API.
"""

import json
import logging
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from trigo_api.db import Parameter
from trigo_api.errors import ApiError
from trigo_api.security.cipher import SecretCipher

logger = logging.getLogger(__name__)

TipoParametro = Literal["STRING", "NUMBER", "BOOLEAN", "SECRET", "CREDENTIAL"]

#: Textos que contam como verdadeiro. O backend anterior gravava 'true'.
_VERDADEIROS = {"true", "1", "sim", "yes", "on"}


class Credencial:
    __slots__ = ("usuario", "senha")

    def __init__(self, usuario: str, senha: str) -> None:
        self.usuario = usuario
        self.senha = senha


class ParametrosService:
    def __init__(self, sessao: Session, cifra: SecretCipher) -> None:
        self._sessao = sessao
        self._cifra = cifra

    # ------------------------------------------------------------- leitura

    def _bruto(self, chave: str) -> str | None:
        linha = self._sessao.get(Parameter, chave)
        if linha is None:
            return None
        # Valor vazio conta como "não customizado" e cai no padrão — é o que o
        # backend anterior fazia, e mudar isso zeraria configuração existente.
        if linha.value is not None and linha.value != "":
            return linha.value
        return linha.default_value

    def texto(self, chave: str, padrao: str = "") -> str:
        valor = self._bruto(chave)
        return valor if valor is not None else padrao

    def numero(self, chave: str, padrao: int) -> int:
        valor = self._bruto(chave)
        if valor is None:
            return padrao
        try:
            return int(float(valor))
        except ValueError:
            logger.warning(
                "Parametro %s nao e numero (%r). Usando o padrao %s.", chave, valor, padrao
            )
            return padrao

    def logico(self, chave: str, padrao: bool) -> bool:
        valor = self._bruto(chave)
        if valor is None:
            return padrao
        return valor.strip().lower() in _VERDADEIROS

    def segredo(self, chave: str) -> str | None:
        """Valor decifrado. Uso EXCLUSIVO de serviço interno."""
        linha = self._sessao.get(Parameter, chave)
        if linha is None or not linha.value:
            return None
        return self._cifra.decrypt(linha.value)

    def credencial(self, chave: str) -> Credencial | None:
        """Par usuário/senha decifrado. Uso EXCLUSIVO de serviço interno."""
        linha = self._sessao.get(Parameter, chave)
        if linha is None or not linha.value:
            return None

        try:
            corpo = json.loads(self._cifra.decrypt(linha.value))
        except Exception:
            logger.exception("Falha ao ler a credencial %s", chave)
            return None

        usuario = corpo.get("usuario")
        senha = corpo.get("senha")
        if not isinstance(usuario, str) or not isinstance(senha, str):
            return None
        return Credencial(usuario, senha)

    # ------------------------------------------------------------- escrita

    def listar(self) -> list[Parameter]:
        return list(
            self._sessao.scalars(
                select(Parameter).order_by(Parameter.group_name, Parameter.key)
            )
        )

    def _exigir(self, chave: str) -> Parameter:
        linha = self._sessao.get(Parameter, chave)
        if linha is None:
            raise ApiError(404, f"Parametro {chave} nao existe no catalogo.")
        return linha

    def atualizar(self, chave: str, valor: str, autor: str) -> Parameter:
        linha = self._exigir(chave)

        if linha.value_type == "CREDENTIAL":
            raise ApiError(
                400, f"O parametro {chave} guarda usuario e senha: use a rota /credencial."
            )

        limpo = valor if linha.value_type == "SECRET" else valor.strip()
        self._validar(linha.value_type, limpo, chave)

        linha.value = self._cifra.encrypt(limpo) if linha.value_type == "SECRET" else limpo
        linha.updated_by = autor
        linha.updated_at = datetime.now(UTC)
        self._sessao.commit()

        # O valor NUNCA vai para o log, nem o de parâmetro comum: a linha de log
        # é o lugar mais fácil de vazar segredo por engano.
        logger.info("Parametro %s atualizado por %s", chave, autor)
        return linha

    def atualizar_credencial(
        self, chave: str, usuario: str, senha: str, autor: str
    ) -> Parameter:
        linha = self._exigir(chave)
        if linha.value_type != "CREDENTIAL":
            raise ApiError(400, f"O parametro {chave} nao guarda credencial.")
        if not self._cifra.is_enabled:
            raise ApiError(
                503,
                "PARAMETER_ENCRYPTION_KEY nao configurada: credencial nao pode ser "
                "gravada em texto claro.",
            )

        linha.value = self._cifra.encrypt(
            json.dumps({"usuario": usuario, "senha": senha}, ensure_ascii=False)
        )
        linha.updated_by = autor
        linha.updated_at = datetime.now(UTC)
        self._sessao.commit()

        # Registra o usuário, que ajuda na auditoria, e nunca a senha.
        logger.info("Credencial %s atualizada por %s (usuario: %s)", chave, autor, usuario)
        return linha

    def restaurar(self, chave: str, autor: str) -> Parameter:
        linha = self._exigir(chave)
        linha.value = None
        linha.updated_by = autor
        linha.updated_at = datetime.now(UTC)
        self._sessao.commit()
        logger.info("Parametro %s restaurado ao padrao por %s", chave, autor)
        return linha

    @staticmethod
    def _validar(tipo: str, valor: str, chave: str) -> None:
        if tipo == "NUMBER":
            try:
                float(valor)
            except ValueError:
                raise ApiError(
                    400, f"O parametro {chave} espera um numero. Recebi {valor!r}."
                ) from None
        elif tipo == "BOOLEAN" and valor.strip().lower() not in _VERDADEIROS | {
            "false",
            "0",
            "nao",
            "no",
            "off",
        }:
            raise ApiError(400, f"O parametro {chave} espera verdadeiro ou falso.")
