"""Rotas da parametrização do sistema."""

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from trigo_api.auth.dependencies import exigir
from trigo_api.config import Settings, obter_settings
from trigo_api.db import Parameter, obter_sessao
from trigo_api.parametros.service import ParametrosService
from trigo_api.schemas.auth import SessionUser
from trigo_api.schemas.parametros import (
    AtualizarCredencialInput,
    AtualizarParametroInput,
    Branding,
    ParametroPublico,
)
from trigo_api.security.cipher import SecretCipher

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/parameters", tags=["parametros"])


def obter_servico(
    sessao: Annotated[Session, Depends(obter_sessao)],
    settings: Annotated[Settings, Depends(obter_settings)],
) -> ParametrosService:
    return ParametrosService(sessao, SecretCipher.from_env(settings.parameter_encryption_key))


def _publico(linha: Parameter, cifra: SecretCipher) -> ParametroPublico:
    segredo = linha.value_type in ("SECRET", "CREDENTIAL")

    usuario: str | None = None
    if linha.value_type == "CREDENTIAL" and linha.value:
        try:
            usuario = json.loads(cifra.decrypt(linha.value)).get("usuario")
        except Exception:
            # Credencial ilegível não pode derrubar a listagem inteira: a tela
            # precisa mostrar as outras e apontar esta como sem usuário.
            logger.warning("Nao foi possivel ler o usuario da credencial %s", linha.key)

    return ParametroPublico(
        key=linha.key,
        label=linha.label,
        description=linha.description,
        group=linha.group_name,
        type=linha.value_type,
        # O valor do segredo NUNCA sai, nem mascarado.
        value=None if segredo else (linha.value if linha.value else linha.default_value),
        defaultValue=None if segredo else linha.default_value,
        isSecret=linha.is_secret,
        temValor=bool(linha.value),
        usuario=usuario,
        updatedBy=linha.updated_by,
        updatedAt=linha.updated_at,
    )


@router.get("/branding", response_model=Branding)
def branding(
    servico: Annotated[ParametrosService, Depends(obter_servico)],
) -> Branding:
    """Identidade do portal, SEM autenticacao.

    A tela de login precisa do nome e da mensagem antes de existir sessão. Só
    estes campos saem sem sessão, e a lista está fixa no código — parâmetro
    novo não vira público por descuido.
    """
    return Branding(
        portalName=servico.texto("PORTAL_NOME", "Portal Trigo"),
        loginMessage=servico.texto("PORTAL_MENSAGEM_LOGIN", ""),
        supportEmail=servico.texto("PORTAL_EMAIL_SUPORTE", "") or None,
    )


@router.get("", response_model=list[ParametroPublico])
def listar(
    servico: Annotated[ParametrosService, Depends(obter_servico)],
    settings: Annotated[Settings, Depends(obter_settings)],
    _: Annotated[SessionUser, Depends(exigir("settings:read"))],
) -> list[ParametroPublico]:
    cifra = SecretCipher.from_env(settings.parameter_encryption_key)
    return [_publico(linha, cifra) for linha in servico.listar()]


@router.patch("/{chave}", response_model=ParametroPublico)
def atualizar(
    chave: str,
    dados: AtualizarParametroInput,
    servico: Annotated[ParametrosService, Depends(obter_servico)],
    settings: Annotated[Settings, Depends(obter_settings)],
    usuario: Annotated[SessionUser, Depends(exigir("settings:write"))],
) -> ParametroPublico:
    linha = servico.atualizar(chave, dados.value, usuario.email)
    return _publico(linha, SecretCipher.from_env(settings.parameter_encryption_key))


@router.patch("/{chave}/credential", response_model=ParametroPublico)
def atualizar_credencial(
    chave: str,
    dados: AtualizarCredencialInput,
    servico: Annotated[ParametrosService, Depends(obter_servico)],
    settings: Annotated[Settings, Depends(obter_settings)],
    usuario: Annotated[SessionUser, Depends(exigir("settings:write"))],
) -> ParametroPublico:
    linha = servico.atualizar_credencial(chave, dados.usuario, dados.senha, usuario.email)
    return _publico(linha, SecretCipher.from_env(settings.parameter_encryption_key))


@router.post("/{chave}/reset", response_model=ParametroPublico)
def restaurar(
    chave: str,
    servico: Annotated[ParametrosService, Depends(obter_servico)],
    settings: Annotated[Settings, Depends(obter_settings)],
    usuario: Annotated[SessionUser, Depends(exigir("settings:write"))],
) -> ParametroPublico:
    linha = servico.restaurar(chave, usuario.email)
    return _publico(linha, SecretCipher.from_env(settings.parameter_encryption_key))
