/** Produto no cadastro unificado do portal. */
export interface PublicProduct {
  id: string
  /**
   * EMPORI — coluna do PORTAL, nao do Protheus. Empresa de ORIGEM do registro
   * no cadastro unificado: '02' para SB1020, '09' para SB1090.
   */
  empori: string
  /** Tabela fisica de origem (SB1020, SB1090). O fato bruto por tras do EMPORI. */
  sourceTable: string
  code: string
  description: string
  type: string | null
  unit: string | null
  group: string | null
  defaultWarehouse: string | null
  /** B1_POSIPI — classificacao fiscal. */
  ncm: string | null
  /** B1_MODELO — modelo fiscal do documento. */
  fiscalModel: string | null
  isBlocked: boolean
  isActive: boolean
  /** B1_XCTACUS — centro de custo. */
  costCenter: string | null
  /** B1_XCTADES — conta de despesa. */
  expenseAccount: string | null
  /** B1_XCONTA — conta do ativo. */
  assetAccount: string | null
  /** B1_CONTA — conta de receita. */
  revenueAccount: string | null
  /** Sempre null hoje: o zWsProdutos nao devolve B1_PRV1. */
  salePrice: number | null
  syncedAt: string
}

export interface ProductListResponse {
  data: PublicProduct[]
  total: number
}

/** Resultado da carga a partir do endpoint zWsProdutos do Protheus. */
export interface ProductSyncResult {
  /** Uma entrada por empresa lida. */
  empresas: ProductSyncCompanyResult[]
  lidos: number
  gravados: number
  /** Quanto tempo a carga inteira levou. */
  duracaoMs: number
}

export interface ProductSyncCompanyResult {
  empresa: string
  filial: string
  empori: string
  sourceTable: string
  paginas: number
  lidos: number
  gravados: number
  /** Preenchido quando a empresa falhou; as outras seguem mesmo assim. */
  erro?: string
}
