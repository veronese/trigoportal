"""Contratos do cadastro de produtos."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PublicProduct(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    #: EMPORI — coluna do PORTAL, não do Protheus. Empresa de ORIGEM do registro
    #: no cadastro unificado: '02' para SB1020, '09' para SB1090.
    empori: str
    #: Tabela física de origem. O fato bruto por trás do EMPORI.
    source_table: str = Field(alias="sourceTable")
    code: str
    description: str
    type: str | None
    unit: str | None
    group: str | None
    default_warehouse: str | None = Field(alias="defaultWarehouse")
    #: B1_POSIPI — classificação fiscal.
    ncm: str | None
    #: B1_MODELO — modelo fiscal do documento.
    fiscal_model: str | None = Field(alias="fiscalModel")
    is_blocked: bool = Field(alias="isBlocked")
    is_active: bool = Field(alias="isActive")
    cost_center: str | None = Field(alias="costCenter")
    expense_account: str | None = Field(alias="expenseAccount")
    asset_account: str | None = Field(alias="assetAccount")
    revenue_account: str | None = Field(alias="revenueAccount")
    sale_price: float | None = Field(alias="salePrice")
    synced_at: datetime = Field(alias="syncedAt")


class ProductListResponse(BaseModel):
    data: list[PublicProduct]
    total: int


class ProductSyncCompanyResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    empresa: str
    filial: str
    empori: str
    source_table: str = Field(alias="sourceTable")
    paginas: int
    lidos: int
    gravados: int
    #: Registros da origem que colidiram no espelho. A chave é (EMPORI, código
    #: aparado), e a origem pode ter dois registros que só diferem por
    #: enchimento invisível.
    duplicados: int = 0
    #: Preenchido quando a empresa falhou; as outras seguem mesmo assim.
    erro: str | None = None


class ProductSyncResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    empresas: list[ProductSyncCompanyResult]
    lidos: int
    gravados: int
    duracao_ms: int = Field(alias="duracaoMs")
