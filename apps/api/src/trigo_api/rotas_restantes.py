"""Rotas menores: Protheus REST, teste do banco, status do banco do portal e
diagnóstico.

Ficam juntas porque cada uma é um punhado de linhas e todas são de leitura para
a tela do Configurador. Quando alguma crescer — o diagnóstico é a candidata —
ela ganha módulo próprio.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from trigo_api.auth.dependencies import exigir
from trigo_api.config import Settings, obter_settings
from trigo_api.db import engine, obter_sessao
from trigo_api.diagnostico.service import DiagnosticoService
from trigo_api.parametros.service import ParametrosService
from trigo_api.protheus.service import ProtheusService
from trigo_api.schemas.auth import SessionUser
from trigo_api.schemas.diagnostico import (
    CaminhoDiagnostico,
    DatabaseStatus,
    DiagnosticoResponse,
    ItemDiagnostico,
    PacoteDiagnostico,
)
from trigo_api.schemas.protheus import ProtheusStatus, ProtheusTestResult
from trigo_api.security.cipher import SecretCipher

protheus_router = APIRouter(prefix="/protheus", tags=["protheus"])
database_router = APIRouter(prefix="/database", tags=["banco"])
diagnostico_router = APIRouter(prefix="/diagnostics", tags=["diagnostico"])


def _parametros(sessao: Session, settings: Settings) -> ParametrosService:
    return ParametrosService(
        sessao, SecretCipher.from_env(settings.parameter_encryption_key)
    )


# ------------------------------------------------------------- Protheus REST


@protheus_router.get("/status", response_model=ProtheusStatus)
def protheus_status(
    sessao: Annotated[Session, Depends(obter_sessao)],
    settings: Annotated[Settings, Depends(obter_settings)],
    _: Annotated[SessionUser, Depends(exigir("settings:read"))],
) -> ProtheusStatus:
    s = ProtheusService(_parametros(sessao, settings)).status()
    return ProtheusStatus(
        configurado=s.configurado,
        baseUrl=s.base_url,
        usuario=s.usuario,
        timeoutSegundos=s.timeout_segundos,
        senhaConfigurada=s.senha_configurada,
    )


@protheus_router.post("/test-connection", response_model=ProtheusTestResult)
def protheus_testar(
    sessao: Annotated[Session, Depends(obter_sessao)],
    settings: Annotated[Settings, Depends(obter_settings)],
    _: Annotated[SessionUser, Depends(exigir("settings:write"))],
) -> ProtheusTestResult:
    """Exige escrita porque consome uma sessão/licença no ERP a cada chamada."""
    r = ProtheusService(_parametros(sessao, settings)).testar()
    return ProtheusTestResult(
        ok=r.ok,
        detalhe=r.detalhe,
        tokenValidoPorSegundos=r.token_valido_por_segundos,
        duracaoMs=r.duracao_ms,
    )


# ------------------------------------------------------- Banco do portal


@database_router.get("/status", response_model=DatabaseStatus)
def database_status(
    _: Annotated[SessionUser, Depends(exigir("settings:read"))],
    settings: Annotated[Settings, Depends(obter_settings)],
) -> DatabaseStatus:
    """Diagnóstico da conexão do PORTAL, em leitura.

    A conexão é definida no ambiente, não pela tela — por isso não existe rota
    de escrita aqui. A senha nunca aparece, nem mascarada.
    """
    from time import perf_counter

    dialeto = engine.dialect.name
    url = engine.url
    inicio = perf_counter()
    conectado = False
    versao: str | None = None
    erro: str | None = None

    try:
        with engine.connect() as con:
            consulta = "SELECT sqlite_version()" if dialeto == "sqlite" else "SELECT @@VERSION"
            versao = str(con.execute(text(consulta)).scalar_one()).splitlines()[0]
            conectado = True
    except Exception as e:  # noqa: BLE001 - o diagnostico reporta, nao quebra
        erro = str(e).splitlines()[0]

    return DatabaseStatus(
        provider=dialeto,
        servidor=url.host or "(arquivo local)",
        porta=url.port,
        banco=url.database or "",
        usuario=url.username or "",
        criptografado=bool(url.query.get("encrypt")),
        conectado=conectado,
        latenciaMs=int((perf_counter() - inicio) * 1000) if conectado else None,
        versaoServidor=versao,
        detalheErro=erro,
    )


# --------------------------------------------------------------- Diagnóstico


@diagnostico_router.get("", response_model=DiagnosticoResponse)
def diagnostico(
    settings: Annotated[Settings, Depends(obter_settings)],
    _: Annotated[SessionUser, Depends(exigir("settings:read"))],
) -> DiagnosticoResponse:
    d = DiagnosticoService(settings).gerar()
    # `model_validate` sobre o dataclass em vez de dicionario montado a mao: o
    # mypy confere os campos, e campo novo no servico chega a resposta sem
    # precisar de uma segunda lista para manter em dia.
    return DiagnosticoResponse(
        geradoEm=d.gerado_em,
        runtime=[ItemDiagnostico.model_validate(i, from_attributes=True) for i in d.runtime],
        caminhos=[
            CaminhoDiagnostico.model_validate(c, from_attributes=True) for c in d.caminhos
        ],
        pacotes=[PacoteDiagnostico.model_validate(p, from_attributes=True) for p in d.pacotes],
        banco=[ItemDiagnostico.model_validate(i, from_attributes=True) for i in d.banco],
        alertas=d.alertas,
    )


__all__ = ["database_router", "diagnostico_router", "protheus_router"]
