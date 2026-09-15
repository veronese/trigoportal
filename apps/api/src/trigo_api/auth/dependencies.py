"""Dependências de sessão.

O equivalente ao guard global do backend anterior: aqui a proteção é explícita
por rota. Rota sem ``Depends(usuario_atual)`` é rota pública — e isso fica
visível na assinatura, em vez de depender de um decorador de exceção.
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Cookie, Depends, Header
from sqlalchemy.orm import Session

from trigo_api.auth.service import AuthService
from trigo_api.config import Settings, obter_settings
from trigo_api.db import obter_sessao
from trigo_api.errors import ApiError
from trigo_api.permissoes import ROTULOS, pode
from trigo_api.schemas.auth import SessionUser
from trigo_api.security import jwt as token_jwt

#: Nome do cookie de sessão. O mesmo do backend anterior: o front já o envia.
SESSION_COOKIE = "tp_session"


def obter_servico(
    sessao: Annotated[Session, Depends(obter_sessao)],
    settings: Annotated[Settings, Depends(obter_settings)],
) -> AuthService:
    return AuthService(sessao, settings)


def _token_da_requisicao(cookie: str | None, authorization: str | None) -> str:
    """Cookie no navegador, Bearer no aplicativo.

    O web usa cookie httpOnly, que o JavaScript não lê — é o que protege contra
    roubo de sessão por XSS. O app móvel não tem cookie e manda Bearer. Os dois
    caminhos precisam existir desde já para o contrato não mudar depois.
    """
    if cookie:
        return cookie
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    raise ApiError(401, "Sessao nao encontrada")


def usuario_atual(
    servico: Annotated[AuthService, Depends(obter_servico)],
    settings: Annotated[Settings, Depends(obter_settings)],
    tp_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> SessionUser:
    token = _token_da_requisicao(tp_session, authorization)

    try:
        payload = token_jwt.ler(token, settings.jwt_secret)
    except token_jwt.TokenInvalidoError as erro:
        raise ApiError(401, "Sessao invalida ou expirada") from erro

    return servico.carregar_da_sessao(payload["sub"], payload["tv"])


def usuario_com_senha_definida(
    usuario: Annotated[SessionUser, Depends(usuario_atual)],
) -> SessionUser:
    """Trava de troca obrigatória.

    Separada de ``usuario_atual`` porque duas rotas precisam funcionar COM a
    trava ativa: ``/auth/me``, para o front saber que tem de levar à tela de
    troca, e a própria troca de senha, que é a saída dela.
    """
    if usuario.must_change_password:
        raise ApiError(
            403,
            "Troca de senha obrigatoria antes de usar o portal.",
            code="PASSWORD_CHANGE_REQUIRED",
        )
    return usuario


def exigir(permissao: str) -> Callable[[SessionUser], SessionUser]:
    """Dependência que exige uma permissão.

    Usada como ``Depends(exigir("settings:write"))`` na rota. A permissão fica
    na assinatura, ao lado do que a rota faz — e não num decorador distante que
    se esquece de aplicar.
    """

    def verificar(
        usuario: Annotated[SessionUser, Depends(usuario_com_senha_definida)],
    ) -> SessionUser:
        if not pode(usuario.role, permissao):
            raise ApiError(
                403,
                f"Seu perfil nao tem a permissao necessaria ({ROTULOS.get(permissao, permissao)}).",
            )
        return usuario

    return verificar
