"""Regras de autenticação.

Porta do backend anterior, com o MESMO comportamento observável: mensagem
genérica quando a credencial falha, contabilidade de tentativas, bloqueio
temporário e trava de troca de senha. Onde a regra mudar em relação ao que
existia, o comentário diz por quê.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from trigo_api.config import Settings
from trigo_api.db import Parameter, User
from trigo_api.errors import ApiError
from trigo_api.schemas.auth import LoginInput, SessionUser
from trigo_api.security import jwt as token_jwt
from trigo_api.security.password import verify_password

logger = logging.getLogger(__name__)

PAPEIS_VALIDOS = ("ADMIN", "MANAGER", "USER")


def _agora() -> datetime:
    return datetime.now(UTC)


class AuthService:
    def __init__(self, sessao: Session, settings: Settings) -> None:
        self._sessao = sessao
        self._settings = settings

    # ---------------------------------------------------------------- publico

    def login(self, dados: LoginInput) -> tuple[SessionUser, str, int]:
        email = dados.email.strip().lower()

        # Busca antes de autenticar para poder contabilizar tentativa e checar
        # bloqueio. Continua sem revelar se o e-mail existe.
        usuario = self._sessao.scalar(select(User).where(User.email == email))
        if usuario is not None:
            self._exigir_nao_bloqueado(usuario)

        if usuario is None or not verify_password(dados.password, usuario.password_hash):
            if usuario is not None:
                self._registrar_falha(usuario)
            # Mensagem genérica de propósito: não revela se o e-mail existe.
            raise ApiError(401, "E-mail ou senha invalidos")

        if not usuario.is_active:
            raise ApiError(401, "Usuario inativo. Procure o administrador.")
        if usuario.role not in PAPEIS_VALIDOS:
            raise ApiError(401, "Papel de acesso invalido")

        self._exigir_senha_provisoria_no_prazo(usuario)

        # Login bem-sucedido zera a contabilidade.
        usuario.last_login_at = _agora()
        usuario.failed_login_attempts = 0
        usuario.locked_until = None
        self._sessao.commit()

        logger.info("Login de %s", usuario.email)
        return self._emitir(usuario)

    def carregar_da_sessao(self, sub: str, tv: int) -> SessionUser:
        """Usuário do token, recusando sessão revogada ou conta desativada."""
        usuario = self._sessao.get(User, sub)
        if usuario is None or not usuario.is_active:
            raise ApiError(401, "Sessao invalida")

        # tokenVersion diferente = a sessão foi revogada (troca de senha,
        # desativação). É o que dispensa manter lista negra de token.
        if usuario.token_version != tv:
            raise ApiError(401, "Sessao expirada. Entre de novo.")

        return self._para_sessao(usuario)

    # --------------------------------------------------------------- privado

    def _emitir(self, usuario: User) -> tuple[SessionUser, str, int]:
        if not self._settings.jwt_secret:
            raise ApiError(500, "JWT_SECRET nao configurado no servidor.")

        segundos = self._settings.sessao_segundos
        token = token_jwt.emitir(
            token_jwt.PayloadSessao(
                sub=usuario.id,
                email=usuario.email,
                role=usuario.role,
                tv=usuario.token_version,
            ),
            self._settings.jwt_secret,
            segundos,
        )
        return self._para_sessao(usuario), token, segundos

    @staticmethod
    def _para_sessao(usuario: User) -> SessionUser:
        return SessionUser(
            id=usuario.id,
            name=usuario.name,
            email=usuario.email,
            role=usuario.role,
            mustChangePassword=usuario.must_change_password,
        )

    def _parametro_int(self, chave: str, padrao: int) -> int:
        linha = self._sessao.get(Parameter, chave)
        bruto = (linha.value if linha and linha.value else None) or (
            linha.default_value if linha else None
        )
        try:
            return int(str(bruto)) if bruto is not None else padrao
        except ValueError:
            return padrao

    def _exigir_nao_bloqueado(self, usuario: User) -> None:
        travado_ate = usuario.locked_until
        if travado_ate is None or travado_ate <= _agora():
            return

        faltam = max(1, int((travado_ate - _agora()).total_seconds() // 60) + 1)
        raise ApiError(
            401,
            f"Conta bloqueada por tentativas de acesso. Tente de novo em {faltam} minuto(s).",
        )

    def _registrar_falha(self, usuario: User) -> None:
        maximo = self._parametro_int("LOGIN_TENTATIVAS_MAX", 5)
        minutos = self._parametro_int("LOGIN_BLOQUEIO_MINUTOS", 15)

        usuario.failed_login_attempts += 1
        if usuario.failed_login_attempts >= maximo:
            usuario.locked_until = _agora() + timedelta(minutes=minutos)
            usuario.failed_login_attempts = 0
            logger.warning(
                "Conta %s bloqueada por %s minutos apos %s tentativas.",
                usuario.email,
                minutos,
                maximo,
            )
        self._sessao.commit()

    def _exigir_senha_provisoria_no_prazo(self, usuario: User) -> None:
        """Senha provisória tem validade. Vencida, não vira acesso permanente."""
        if not usuario.must_change_password:
            return

        emitida_em = usuario.provisional_password_at
        if emitida_em is None:
            return

        horas = self._parametro_int("SENHA_PROVISORIA_VALIDADE_HORAS", 48)
        if (_agora() - emitida_em).total_seconds() > horas * 3600:
            raise ApiError(
                401,
                "A senha provisoria expirou. Peca uma nova ao administrador.",
            )
