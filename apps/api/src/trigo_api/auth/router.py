"""Rotas de autenticação."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from trigo_api.auth.dependencies import SESSION_COOKIE, obter_servico, usuario_atual
from trigo_api.auth.service import AuthService
from trigo_api.config import Settings, obter_settings
from trigo_api.schemas.auth import LoginInput, SessionResponse, SessionUser

router = APIRouter(prefix="/auth", tags=["auth"])


def _gravar_cookie(
    resposta: Response, token: str, segundos: int, settings: Settings
) -> None:
    resposta.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        # 'lax' funciona porque o Next faz proxy da API na mesma origem. Em
        # domínio diferente, o caminho é o Bearer, que já é aceito.
        samesite="lax",
        secure=settings.producao,
        path="/",
        max_age=segundos,
    )


@router.post("/login", response_model=SessionResponse, status_code=status.HTTP_200_OK)
def login(
    dados: LoginInput,
    resposta: Response,
    servico: Annotated[AuthService, Depends(obter_servico)],
    settings: Annotated[Settings, Depends(obter_settings)],
) -> SessionResponse:
    usuario, token, segundos = servico.login(dados)
    _gravar_cookie(resposta, token, segundos, settings)
    return SessionResponse(user=usuario)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(resposta: Response) -> None:
    """Público de propósito: precisa limpar o cookie mesmo com sessão expirada."""
    resposta.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=SessionResponse)
def me(usuario: Annotated[SessionUser, Depends(usuario_atual)]) -> SessionResponse:
    """Fora da trava de troca: o front precisa ler ``mustChangePassword``."""
    return SessionResponse(user=usuario)
