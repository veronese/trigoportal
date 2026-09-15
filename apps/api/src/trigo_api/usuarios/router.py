"""Rotas do cadastro de usuários.

Os verbos e caminhos são os que o ``apps/web`` já chama. Onde eu tinha
inventado um verbo diferente, foi corrigido: trocar o backend mudando o
contrato quebraria a tela, e substituição não é redesenho.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from trigo_api.auth.dependencies import exigir
from trigo_api.config import Settings, obter_settings
from trigo_api.db import User, obter_sessao
from trigo_api.parametros.service import ParametrosService
from trigo_api.schemas.auth import SessionUser
from trigo_api.schemas.usuarios import (
    CriarUsuarioInput,
    PublicUser,
    RedefinirSenhaInput,
    UserListResponse,
    atualizar_usuario_input,
)
from trigo_api.security.cipher import SecretCipher
from trigo_api.usuarios.service import UsuariosService

router = APIRouter(prefix="/users", tags=["usuarios"])


def obter_servico(
    sessao: Annotated[Session, Depends(obter_sessao)],
    settings: Annotated[Settings, Depends(obter_settings)],
) -> UsuariosService:
    cifra = SecretCipher.from_env(settings.parameter_encryption_key)
    return UsuariosService(sessao, ParametrosService(sessao, cifra))


def _publico(usuario: User, servico: UsuariosService) -> PublicUser:
    return PublicUser(
        id=usuario.id,
        name=usuario.name,
        email=usuario.email,
        role=usuario.role,
        isActive=usuario.is_active,
        provider=usuario.provider,
        mustChangePassword=usuario.must_change_password,
        failedLoginAttempts=usuario.failed_login_attempts,
        lockedUntil=usuario.locked_until,
        provisionalPasswordExpiresAt=servico.prazo_da_provisoria(usuario),
        lastLoginAt=usuario.last_login_at,
        passwordChangedAt=usuario.password_changed_at,
        createdAt=usuario.created_at,
    )


@router.get("", response_model=UserListResponse)
def listar(
    servico: Annotated[UsuariosService, Depends(obter_servico)],
    _: Annotated[SessionUser, Depends(exigir("users:read"))],
    search: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    pageSize: Annotated[int, Query(ge=1, le=200)] = 50,  # noqa: N803 - nome do contrato
) -> UserListResponse:
    linhas, total = servico.listar(search, page, pageSize)
    return UserListResponse(data=[_publico(u, servico) for u in linhas], total=total)


@router.get("/{usuario_id}", response_model=PublicUser)
def obter(
    usuario_id: str,
    servico: Annotated[UsuariosService, Depends(obter_servico)],
    _: Annotated[SessionUser, Depends(exigir("users:read"))],
) -> PublicUser:
    return _publico(servico.obter(usuario_id), servico)


@router.post("", response_model=PublicUser, status_code=status.HTTP_201_CREATED)
def criar(
    dados: CriarUsuarioInput,
    servico: Annotated[UsuariosService, Depends(obter_servico)],
    autor: Annotated[SessionUser, Depends(exigir("users:write"))],
) -> PublicUser:
    usuario = servico.criar(
        dados.name, dados.email, dados.password, dados.role, autor.email
    )
    return _publico(usuario, servico)


@router.patch("/{usuario_id}", response_model=PublicUser)
def atualizar(
    usuario_id: str,
    dados: Annotated[dict[str, object], Depends(atualizar_usuario_input)],
    servico: Annotated[UsuariosService, Depends(obter_servico)],
    autor: Annotated[SessionUser, Depends(exigir("users:write"))],
) -> PublicUser:
    usuario = servico.atualizar(
        usuario_id,
        autor.email,
        nome=dados.get("name"),  # type: ignore[arg-type]
        papel=dados.get("role"),  # type: ignore[arg-type]
        ativo=dados.get("isActive"),  # type: ignore[arg-type]
    )
    return _publico(usuario, servico)


@router.post("/{usuario_id}/reset-password", response_model=PublicUser)
def redefinir_senha(
    usuario_id: str,
    dados: RedefinirSenhaInput,
    servico: Annotated[UsuariosService, Depends(obter_servico)],
    autor: Annotated[SessionUser, Depends(exigir("users:write"))],
) -> PublicUser:
    usuario = servico.redefinir_senha(usuario_id, dados.new_password, autor.email)
    return _publico(usuario, servico)


@router.post("/{usuario_id}/deactivate", response_model=PublicUser)
def desativar(
    usuario_id: str,
    servico: Annotated[UsuariosService, Depends(obter_servico)],
    autor: Annotated[SessionUser, Depends(exigir("users:write"))],
) -> PublicUser:
    return _publico(servico.desativar(usuario_id, autor.email), servico)


@router.post("/{usuario_id}/unlock", response_model=PublicUser)
def desbloquear(
    usuario_id: str,
    servico: Annotated[UsuariosService, Depends(obter_servico)],
    autor: Annotated[SessionUser, Depends(exigir("users:write"))],
) -> PublicUser:
    return _publico(servico.desbloquear(usuario_id, autor.email), servico)


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover(
    usuario_id: str,
    servico: Annotated[UsuariosService, Depends(obter_servico)],
    autor: Annotated[SessionUser, Depends(exigir("users:delete"))],
) -> Response:
    servico.remover(usuario_id, autor.email)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
