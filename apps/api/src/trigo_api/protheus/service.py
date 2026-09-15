"""Conexão com o REST do Protheus (OAuth2).

Existe ao lado do conector de banco, e não no lugar dele. O REST respeita o
ambiente do appserver — é por ele que passam inclusão e alteração, com
ExecAuto — enquanto o banco alcança empresa que não tem ambiente preparado.
Cada um faz o que o outro não faz.
"""

import logging
from dataclasses import dataclass
from time import perf_counter
from urllib.parse import urlencode

import httpx

from trigo_api.errors import ApiError
from trigo_api.parametros.service import ParametrosService

logger = logging.getLogger(__name__)


@dataclass
class StatusProtheus:
    configurado: bool
    base_url: str
    usuario: str
    timeout_segundos: int
    senha_configurada: bool


@dataclass
class ResultadoTeste:
    ok: bool
    detalhe: str
    token_valido_por_segundos: int | None
    duracao_ms: int


class ProtheusService:
    def __init__(self, parametros: ParametrosService) -> None:
        self._p = parametros

    def status(self) -> StatusProtheus:
        """O que está configurado hoje. Nunca devolve a senha, só se ela existe."""
        base_url = self._p.texto("PROTHEUS_REST_URL").strip().rstrip("/")
        credencial = self._p.credencial("PROTHEUS_CREDENCIAL")

        return StatusProtheus(
            configurado=bool(base_url and credencial and credencial.senha),
            base_url=base_url,
            usuario=credencial.usuario if credencial else "",
            timeout_segundos=self._p.numero("PROTHEUS_TIMEOUT_SEGUNDOS", 30),
            senha_configurada=bool(credencial and credencial.senha),
        )

    def testar(self) -> ResultadoTeste:
        """Exercita a credencial de verdade contra o appserver.

        Consome uma sessão/licença no Protheus a cada chamada — por isso a rota
        exige permissão de escrita, e não é uma leitura que qualquer perfil
        dispara.
        """
        inicio = perf_counter()
        s = self.status()

        if not s.configurado:
            falta = []
            if not s.base_url:
                falta.append("a URL do REST")
            if not s.senha_configurada:
                falta.append("a credencial")
            return ResultadoTeste(
                ok=False,
                detalhe=(
                    "A conexao com o Protheus nao esta configurada: falta "
                    + " e ".join(falta)
                    + ". Configure em Configurador > Parametros."
                ),
                token_valido_por_segundos=None,
                duracao_ms=self._ms(inicio),
            )

        credencial = self._p.credencial("PROTHEUS_CREDENCIAL")
        if credencial is None:
            raise ApiError(503, "Nao foi possivel ler a credencial do Protheus.")

        # O grant vai na QUERY porque é assim que o mod_rest do Protheus espera;
        # em corpo form-urlencoded ele responde 400. Não é preferência.
        parametros = urlencode(
            {
                "grant_type": "password",
                "username": credencial.usuario,
                "password": credencial.senha,
            }
        )
        url = f"{s.base_url}/api/oauth2/v1/token?{parametros}"

        try:
            with httpx.Client(timeout=s.timeout_segundos) as cliente:
                resposta = cliente.post(url)
        except httpx.TimeoutException:
            return ResultadoTeste(
                ok=False,
                detalhe=(
                    f"O Protheus nao respondeu em {s.timeout_segundos}s. Confira se o "
                    "appserver esta no ar e se este servidor o alcanca."
                ),
                token_valido_por_segundos=None,
                duracao_ms=self._ms(inicio),
            )
        except httpx.HTTPError as erro:
            return ResultadoTeste(
                ok=False,
                detalhe=f"Falha ao falar com o Protheus: {erro}",
                token_valido_por_segundos=None,
                duracao_ms=self._ms(inicio),
            )

        if resposta.status_code == 401:
            return ResultadoTeste(
                ok=False,
                detalhe=(
                    "O Protheus recusou a credencial. Confira usuario e senha em "
                    "Configurador > Parametros."
                ),
                token_valido_por_segundos=None,
                duracao_ms=self._ms(inicio),
            )

        if resposta.status_code >= 400:
            return ResultadoTeste(
                ok=False,
                detalhe=f"O Protheus respondeu {resposta.status_code}: {self._resumo(resposta)}",
                token_valido_por_segundos=None,
                duracao_ms=self._ms(inicio),
            )

        try:
            corpo = resposta.json()
        except ValueError:
            return ResultadoTeste(
                ok=False,
                detalhe="O Protheus respondeu algo que nao e JSON na rota de token.",
                token_valido_por_segundos=None,
                duracao_ms=self._ms(inicio),
            )

        if not corpo.get("access_token"):
            return ResultadoTeste(
                ok=False,
                detalhe="O Protheus respondeu sem access_token.",
                token_valido_por_segundos=None,
                duracao_ms=self._ms(inicio),
            )

        logger.info("Autenticado no Protheus como %s", credencial.usuario)
        return ResultadoTeste(
            ok=True,
            detalhe="Autenticacao aceita pelo Protheus.",
            token_valido_por_segundos=int(corpo.get("expires_in") or 0) or None,
            duracao_ms=self._ms(inicio),
        )

    @staticmethod
    def _ms(inicio: float) -> int:
        return int((perf_counter() - inicio) * 1000)

    @staticmethod
    def _resumo(resposta: httpx.Response) -> str:
        """Primeira linha útil do corpo do erro, sem despejar HTML inteiro."""
        texto = resposta.text.strip()
        if texto.startswith("<"):
            return "(resposta em HTML, provavelmente rota inexistente)"
        return texto.splitlines()[0][:200] if texto else "(sem corpo)"
