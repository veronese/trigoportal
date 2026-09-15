"""Rotas do cadastro de produtos."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from trigo_api.auth.dependencies import exigir
from trigo_api.config import Settings, obter_settings
from trigo_api.db import Product, obter_sessao
from trigo_api.errors import ApiError
from trigo_api.parametros.service import ParametrosService
from trigo_api.produtos.service import ProdutosService
from trigo_api.protheus_db.service import ProtheusDbService
from trigo_api.schemas.auth import SessionUser
from trigo_api.schemas.produtos import (
    ProductListResponse,
    ProductSyncCompanyResult,
    ProductSyncResult,
    PublicProduct,
)
from trigo_api.security.cipher import SecretCipher

router = APIRouter(prefix="/products", tags=["produtos"])


def obter_servico(
    sessao: Annotated[Session, Depends(obter_sessao)],
    settings: Annotated[Settings, Depends(obter_settings)],
) -> ProdutosService:
    cifra = SecretCipher.from_env(settings.parameter_encryption_key)
    parametros = ParametrosService(sessao, cifra)
    return ProdutosService(sessao, ProtheusDbService(parametros))


def _publico(p: Product) -> PublicProduct:
    return PublicProduct(
        id=p.id,
        empori=p.empori,
        sourceTable=p.source_table,
        code=p.code,
        description=p.description,
        type=p.type,
        unit=p.unit,
        group=p.group_code,
        defaultWarehouse=p.default_warehouse,
        ncm=p.ncm,
        fiscalModel=p.fiscal_model,
        isBlocked=p.is_blocked,
        isActive=p.is_active,
        costCenter=p.cost_center,
        expenseAccount=p.expense_account,
        assetAccount=p.asset_account,
        revenueAccount=p.revenue_account,
        salePrice=float(p.sale_price) if p.sale_price is not None else None,
        syncedAt=p.synced_at,
    )


@router.get("", response_model=ProductListResponse)
def listar(
    servico: Annotated[ProdutosService, Depends(obter_servico)],
    _: Annotated[SessionUser, Depends(exigir("products:read"))],
    search: Annotated[str | None, Query()] = None,
    empori: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    pageSize: Annotated[int, Query(ge=1, le=200)] = 50,  # noqa: N803 - nome do contrato
) -> ProductListResponse:
    linhas, total = servico.listar(search, empori, page, pageSize)
    return ProductListResponse(data=[_publico(p) for p in linhas], total=total)


@router.post("/sync", response_model=ProductSyncResult, status_code=status.HTTP_200_OK)
def sincronizar(
    servico: Annotated[ProdutosService, Depends(obter_servico)],
    sessao: Annotated[Session, Depends(obter_sessao)],
    settings: Annotated[Settings, Depends(obter_settings)],
    _: Annotated[SessionUser, Depends(exigir("products:sync"))],
    empresa: Annotated[str | None, Query()] = None,
) -> ProductSyncResult:
    """Dispara a carga a partir do banco do Protheus.

    200 e não 202: a carga roda no próprio request e o relatório por empresa
    volta na resposta. Quando o volume exigir execução em segundo plano, isto
    vira um job e a rota passa a devolver 202 com um id de acompanhamento.
    """
    cifra = SecretCipher.from_env(settings.parameter_encryption_key)
    parametros = ParametrosService(sessao, cifra)

    if empresa:
        empresas = [empresa.strip()]
    else:
        bruto = parametros.texto("PRODUTOS_EMPRESAS", "02,09")
        empresas = [e.strip() for e in bruto.split(",") if e.strip()]

    resultado = servico.carregar_do_banco(
        empresas, parametros.numero("PRODUTOS_PAGINA_TAMANHO", 2000)
    )
    return ProductSyncResult(
        empresas=[
            ProductSyncCompanyResult(
                empresa=e.empresa,
                # A filial não participa: a leitura é da tabela física e a SB1 é
                # compartilhada. Vazia para não sugerir um tenant que não existe.
                filial="",
                empori=e.empori,
                sourceTable=e.source_table,
                paginas=e.paginas,
                lidos=e.lidos,
                gravados=e.gravados,
                duplicados=e.duplicados,
                erro=e.erro,
            )
            for e in resultado.empresas
        ],
        lidos=resultado.lidos,
        gravados=resultado.gravados,
        duracaoMs=resultado.duracao_ms,
    )


@router.get("/{produto_id}", response_model=PublicProduct)
def obter(
    produto_id: str,
    servico: Annotated[ProdutosService, Depends(obter_servico)],
    _: Annotated[SessionUser, Depends(exigir("products:read"))],
) -> PublicProduct:
    """Rota com parâmetro vem DEPOIS de ``/sync``.

    Registrada antes, ``sync`` seria lido como id de produto e a carga viraria
    um 404 sem explicação.
    """
    produto = servico.obter(produto_id)
    if produto is None:
        raise ApiError(404, "Produto nao encontrado")
    return _publico(produto)
