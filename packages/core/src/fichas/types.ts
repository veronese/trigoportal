/**
 * Dominio das Fichas Tecnicas.
 *
 * A nomenclatura e a do escopo e a de quem usa a ficha — etapa, perda,
 * rendimento, batida, embalagem. Traduzir para ingles aqui criaria um segundo
 * vocabulario para a mesma coisa, e a conversa com P&D acontece nesses termos.
 */

/** Marca ou loja. O primeiro nivel das pastas. */
export interface Restaurante {
  id: string
  nome: string
  /** Cor aplicada ao cabecalho do PDF, para identificar a marca. */
  cor: string
}

export type TipoFicha = 'custo' | 'processo'

/**
 * Situacao da versao.
 *
 * Uma versao `vigente` nao e editada: alteracao gera versao nova. E o que
 * garante que a versao antiga continue respondendo "como a ficha era".
 */
export type StatusVersao = 'rascunho' | 'em_aprovacao' | 'vigente' | 'obsoleta'

/** Areas que assinam. A Ficha de Processo passa por elas nesta ordem. */
export type AreaAprovadora = 'pd' | 'qualidade' | 'fabrica' | 'producao'

export const SEQUENCIA_APROVACAO_PROCESSO: readonly AreaAprovadora[] = [
  'pd',
  'qualidade',
  'fabrica',
  'producao',
]

/** A Ficha de Custo tem uma assinatura so. */
export const SEQUENCIA_APROVACAO_CUSTO: readonly AreaAprovadora[] = ['pd']

export type StatusEtapaAprovacao = 'pendente' | 'aprovado' | 'ajuste_solicitado'

export interface EtapaAprovacao {
  area: AreaAprovadora
  status: StatusEtapaAprovacao
  /** Quem decidiu. Nulo enquanto pendente. */
  decidiuPor: string | null
  decididoEm: string | null
  /** Obrigatorio quando o status e ajuste_solicitado. */
  justificativa: string | null
}

// ---------------------------------------------------------------- composicao

export type TipoEtapa = 'receita' | 'subreceita' | 'montagem' | 'processo' | 'embalagem'

/**
 * Como a quantidade do item e obtida.
 *
 * `fixa` .................. valor digitado
 * `multiplo_lote` ......... base x numero de batidas
 * `saida_etapa` ........... o rendimento de outra etapa entra como insumo
 * `coef_rend` ............. base + coeficiente x rendimento final (embalagens)
 * `coef_linha` ............ base + coeficiente x quantidade de outro item
 *
 * Os dois ultimos existem porque embalagem depende do que saiu, nao do que
 * entrou: quantas caixas, quantas etiquetas por caixa, quanto filme por quilo.
 */
export type ModoQuantidade =
  | 'fixa'
  | 'multiplo_lote'
  | 'saida_etapa'
  | 'coef_rend'
  | 'coef_linha'

export interface ItemEtapa {
  id: string
  /** Codigo do insumo no Protheus, quando ja relacionado. */
  codigo: string
  descricao: string
  /** Insumo de receita e sempre KG. Embalagem tem unidade livre. */
  unidade: string
  modo: ModoQuantidade
  /** Quantidade literal. Usada por `fixa`, e resultado dos outros modos. */
  qtd?: number
  /** Custo unitario, vindo do Protheus. */
  preco: number
  /** `multiplo_lote`, `coef_rend`, `coef_linha`: parcela constante. */
  base?: number
  /** `coef_rend` e `coef_linha`: multiplicador. */
  coef?: number
  /** `saida_etapa`: id da etapa. `coef_linha`: id do item de referencia. */
  ref?: string
  /** `multiplo_lote`: numero de batidas, quando difere da media da etapa. */
  lote?: number
}

export type ModoRendimento = 'fator' | 'perdas'

export interface Rendimento {
  modo: ModoRendimento
  /** `fator`: multiplicador sobre o total insumido. */
  fator?: number
}

export interface Perda {
  nome: string
  valorKg: number
  /**
   * Perda de uma batida so, diluida na media de batidas da etapa.
   *
   * Perda de fundo de caldeira acontece uma vez por producao, nao a cada
   * batida: rateada divide pela media de batidas.
   */
  rateada: boolean
}

export interface EtapaFicha {
  id: string
  nome: string
  tipo: TipoEtapa
  ordem: number
  /** Quando true, a soma dos percentuais dos itens e validada contra 100%. */
  usaPercentual: boolean
  itens: ItemEtapa[]
  perdas: Perda[]
  rendimento: Rendimento
  /** Media de batidas por producao. Divisor das perdas rateadas. */
  mediaBatidas: number
}

// ------------------------------------------------------------------ resultado

export interface ItemCalculado extends ItemEtapa {
  /** Quantidade resolvida, seja qual for o modo. */
  qtdResolvida: number
  valor: number
  /** Participacao na quantidade total da etapa. */
  pct: number
}

export interface PerdaCalculada extends Perda {
  /** Participacao da perda sobre o total insumido na etapa. */
  pct: number
}

export interface EtapaCalculada {
  id: string
  nome: string
  tipo: TipoEtapa
  itens: ItemCalculado[]
  /** Soma das quantidades, em kg. */
  total: number
  /** Soma de quantidade x preco dos itens. */
  custo: number
  perdas: PerdaCalculada[]
  rendimento: number
  custoKg: number
  usaPercentual: boolean
}

export interface EmbalagemCalculada {
  id: string
  nome: string
  itens: ItemCalculado[]
  custo: number
}

export type NivelValidacao = 'erro' | 'aviso'

export interface Validacao {
  nivel: NivelValidacao
  mensagem: string
}

export interface ResultadoCalculo {
  etapas: EtapaCalculada[]
  embalagens: EmbalagemCalculada[]
  custoEmbalagens: number
  /** Custo da etapa final somado ao das embalagens. */
  custoBatida: number
  rendimentoFinal: number
  custoKg: number
  custoUnidade: number
  /** Quantas unidades saem de uma batida. */
  unidadesPorBatida: number
  precoVenda: number | null
  /** Custo por quilo dividido pelo preco de venda. */
  cmv: number | null
  margemReais: number | null
  margemPct: number | null
  validacoes: Validacao[]
}

/** O que o calculo precisa saber da versao, alem das etapas. */
export interface EntradaCalculo {
  etapas: EtapaFicha[]
  /** Peso da unidade acabada, em kg. */
  pesoUnitario: number
  precoVenda?: number | null
}
