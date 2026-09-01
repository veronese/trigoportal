import type {
  Aprovacao,
  EtapaFicha,
  FaseFicha,
  ResultadoCalculo,
  StatusVersao,
} from './types'

/** Uma pasta da navegacao: marca, ou linha dentro da marca. */
export interface PastaFichas {
  id: string
  nome: string
  /** Quantas fichas existem abaixo dela. Pasta vazia nao aparece. */
  fichas: number
  /** Cor da marca, quando a pasta e uma marca. */
  cor?: string
}

/** Linha da lista de fichas dentro de uma pasta. */
export interface FichaResumo {
  id: string
  codigo: string
  nome: string
  restaurante: string
  linha: string
  /** Fase mais avancada que a ficha alcancou. */
  faseAtual: FaseFicha
  /** Versao vigente da fase mais avancada, quando existe. */
  versaoAtual: number | null
  status: StatusVersao | null
  atualizadoEm: string
}

export interface FichaListaResponse {
  data: FichaResumo[]
  total: number
}

/** Uma fase da ficha, com suas versoes. */
export interface FaseResumo {
  id: string
  fase: FaseFicha
  quantidadeAlvoKg: number | null
  linhaProducao: string | null
  /** Versao que originou esta fase. Nula na bancada. */
  origem: { faseOrigem: FaseFicha; versaoFormula: number } | null
  versoes: VersaoResumo[]
}

export interface VersaoResumo {
  id: string
  versaoFormula: number
  revisaoDocumental: string | null
  revisaoProtheus: string | null
  nome: string | null
  motivo: string | null
  status: StatusVersao
  criadoPor: string
  congeladoEm: string | null
  criadoEm: string
  /** KPIs congelados. Nulos enquanto rascunho. */
  custoKg: number | null
  rendimentoKg: number | null
}

/** A ficha inteira: cabecalho, trilha de fases e a versao aberta. */
export interface FichaDetalhe {
  id: string
  codigo: string
  nome: string
  restaurante: { id: string; nome: string; cor: string }
  linha: { id: string; nome: string }
  categoria: string | null
  fases: FaseResumo[]
  atualizadoEm: string
}

/** Uma versao aberta para leitura ou edicao, com o calculo ja resolvido. */
export interface VersaoDetalhe {
  id: string
  fase: FaseFicha
  fichaId: string
  fichaCodigo: string
  fichaNome: string
  versaoFormula: number
  revisaoDocumental: string | null
  revisaoProtheus: string | null
  nome: string | null
  motivo: string | null
  status: StatusVersao
  /** Versao congelada e somente leitura. */
  somenteLeitura: boolean
  quantidadeFinalKg: number | null
  pesoUnitario: number | null
  precoVenda: number | null
  criadoPor: string
  congeladoEm: string | null
  etapas: EtapaFicha[]
  aprovacoes: Aprovacao[]
  /**
   * Resultado do calculo.
   *
   * Em rascunho vem recalculado agora, com os precos de hoje. Em versao
   * congelada vem dos KPIs gravados — e por isso que atualizar o custo de um
   * insumo nao mexe no que a versao antiga responde.
   */
  calculo: ResultadoCalculo
  /** true quando os numeros sao os congelados, e nao um recalculo. */
  calculoCongelado: boolean
}

/** O que impede promover, com o caminho para resolver. */
export interface AvaliacaoPromocao {
  destino: FaseFicha | null
  permitido: boolean
  impedimentos: { motivo: string; comoResolver: string }[]
  /** Sugestao vinda da capacidade da linha, quando o destino e producao. */
  quantidadeSugeridaKg: number | null
}
