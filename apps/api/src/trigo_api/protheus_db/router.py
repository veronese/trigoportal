"""Rotas do conector com o banco do Protheus e do console de consulta."""

from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.orm import Session

from trigo_api.auth.dependencies import exigir
from trigo_api.config import Settings, obter_settings
from trigo_api.db import obter_sessao
from trigo_api.parametros.service import ParametrosService
from trigo_api.protheus_db.service import ProtheusDbService
from trigo_api.schemas.auth import SessionUser
from trigo_api.schemas.protheus_db import (
    ColunaBanco,
    ConsultaSqlInput,
    ConsultaSqlResult,
    ProtheusDbConfig,
    TabelaBanco,
)
from trigo_api.security.cipher import SecretCipher

router = APIRouter(prefix="/protheus-db", tags=["protheus-db"])


def obter_servico(
    sessao: Annotated[Session, Depends(obter_sessao)],
    settings: Annotated[Settings, Depends(obter_settings)],
) -> ProtheusDbService:
    cifra = SecretCipher.from_env(settings.parameter_encryption_key)
    return ProtheusDbService(ParametrosService(sessao, cifra))


@router.get("/config", response_model=ProtheusDbConfig)
def config(
    servico: Annotated[ProtheusDbService, Depends(obter_servico)],
    _: Annotated[SessionUser, Depends(exigir("settings:read"))],
) -> ProtheusDbConfig:
    """O que está configurado. Nunca devolve a senha, só se ela existe."""
    c = servico.config()
    return ProtheusDbConfig(
        host=c.host,
        porta=c.porta,
        banco=c.banco,
        usuario=c.usuario,
        senhaConfigurada=c.senha_configurada,
        criptografia=c.criptografia,
        certificadoConfiavel=c.certificado_confiavel,
        timeoutSegundos=c.timeout_segundos,
        configurado=c.configurado,
        pendencias=c.pendencias,
    )


@router.get("/tabelas", response_model=list[TabelaBanco])
def tabelas(
    servico: Annotated[ProtheusDbService, Depends(obter_servico)],
    _: Annotated[SessionUser, Depends(exigir("protheusdb:consultar"))],
    busca: Annotated[str | None, Query()] = None,
) -> list[TabelaBanco]:
    return [TabelaBanco(**linha) for linha in servico.listar_tabelas(busca)]


@router.get("/tabelas/{nome}/colunas", response_model=list[ColunaBanco])
def colunas(
    nome: str,
    servico: Annotated[ProtheusDbService, Depends(obter_servico)],
    _: Annotated[SessionUser, Depends(exigir("protheusdb:consultar"))],
) -> list[ColunaBanco]:
    return [ColunaBanco(**linha) for linha in servico.descrever_tabela(nome)]


@router.post("/consultar", response_model=ConsultaSqlResult)
def consultar(
    dados: Annotated[ConsultaSqlInput, Body()],
    servico: Annotated[ProtheusDbService, Depends(obter_servico)],
    usuario: Annotated[SessionUser, Depends(exigir("protheusdb:consultar"))],
) -> ConsultaSqlResult:
    """Executa a consulta escrita no console.

    POST e não GET, apesar de ser leitura: o SQL vai no corpo. Em query string
    ele apareceria no log do servidor e no histórico do navegador, e consulta
    ao ERP pode conter código de cliente, valor e nome.
    """
    return ConsultaSqlResult(**servico.consultar(dados.sql, dados.limite, usuario.email))
