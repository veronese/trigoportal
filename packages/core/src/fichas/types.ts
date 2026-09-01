/**
 * Dominio das Fichas Tecnicas de P&D.
 *
 * A nomenclatura e a do escopo e a de quem usa a ficha — fase, etapa, batida,
 * perda, rendimento, embalagem. Traduzir para ingles criaria um segundo
 * vocabulario para a mesma coisa, e a conversa com P&D acontece nesses termos.
 */

// ------------------------------------------------------------------ estrutura

/** Marca ou loja. Primeiro nivel das pastas. */
export interface Restaurante {
  id: string
  nome: string
  /** Cor aplicada ao cabecalho do PDF, para identificar a marca. */
  cor: string
}

/**
 * As tres fases do desenvolvimento, em ordem obrigatoria.
 *
 * Bancada e o inicio na cozinha experimental; batida teste e a linha industrial
 * em escala reduzida; producao e a receita oficial na capacidade da linha.
 */
export type FaseFicha = 'bancada' | 'batida_teste' | 'ft_producao'

export const ORDEM_DAS_FASES: readonly FaseFicha[] = ['bancada', 'batida_teste', 'ft_producao']

export const ROTULO_FASE: Record<FaseFicha, string> = {
  bancada: 'Teste de Bancada',
  batida_teste: 'Batida Teste',
  ft_producao: 'FT Produção',
}

/**
 * A fase seguinte, ou null quando ja e a ultima.
 *
 * Usada para bloquear o pulo de bancada direto para producao — regra que vive
 * aqui, e nao no botao da tela: regra em botao desabilitado e regra que a API
 * nao tem.
 */
export function proximaFase(fase: FaseFicha): FaseFicha | null {
  const i = ORDEM_DAS_FASES.indexOf(fase)
  return i >= 0 && i < ORDEM_DAS_FASES.length - 1 ? ORDEM_DAS_FASES[i + 1]! : null
}

/**
 * Situacao da versao.
 *
 * `vigente` nao e editada: alteracao gera versao nova. E o que garante que a
 * versao antiga continue respondendo "como a ficha era naquele momento".
 */
export type StatusVersao = 'rascunho' | 'em_aprovacao' | 'vigente' | 'obsoleta'

/**
 * As TRES numerações, que nunca se equivalem automaticamente.
 *
 * Provado pela ficha de referencia: a de custo e FTC-P&D-088 revisao 000, e a
 * de processo do mesmo produto e FTP-PRD-245 revisao 3. Documentos e revisoes
 * independentes, no mesmo produto.
 */
export interface NumeracaoVersao {
  /** Contador interno do P&D. Incrementa a cada GERAR VERSAO. */
  versaoFormula: number
  /** Numeracao do documento, no formato da area ("000", "003"). */
  revisaoDocumental: string | null
  /** O que o Protheus devolveu ao gravar a estrutura. Nunca inventado. */
  revisaoProtheus: string | null
}

// ------------------------------------------------------------------ aprovacao

/** Areas que assinam. A sequencia depende do que esta sendo aprovado. */
export type AreaAprovadora = 'pd' | 'qualidade' | 'fabrica' | 'producao'

/** Fluxo inicial do prompt: P&D -> Qualidade -> Producao. */
export const SEQUENCIA_APROVACAO: readonly AreaAprovadora[] = ['pd', 'qualidade', 'producao']

export type StatusAprovacao = 'pendente' | 'aprovado' | 'reprovado'

export interface Aprovacao {
  area: AreaAprovadora
  ordem: number
  status: StatusAprovacao
  decididoPor: string | null
  decididoEm: string | null
  /** Obrigatoria quando reprovado: a ficha volta para edicao com o motivo. */
  comentario: string | null
}

// ---------------------------------------------------------------- composicao

export type TipoEtapa =
  | 'receita'
  | 'subreceita'
  | 'pre_mistura'
  | 'kit'
  | 'processo'
  | 'montagem'
  | 'embalagem'

/**
 * Como a quantidade do item e obtida.
 *
 * `fixa` ............ valor digitado, NAO acompanha redimensionamento
 * `proporcional` .... acompanha o redimensionamento da formulacao
 * `multiplo_lote` ... base x numero de batidas
 * `saida_etapa` ..... o rendimento de outra etapa entra como insumo
 * `coef_rend` ....... base + coeficiente x rendimento final (embalagem)
 * `coef_linha` ...... base + coeficiente x quantidade de outro item (embalagem)
 *
 * A distincao entre `fixa` e `proporcional` e o que impede escalar a etiqueta
 * junto com a farinha ao mudar a batida de 5 para 590 kg.
 */
export type ModoQuantidade =
  | 'fixa'
  | 'proporcional'
  | 'multiplo_lote'
  | 'saida_etapa'
  | 'coef_rend'
  | 'coef_linha'

/** Modos que o redimensionamento multiplica pelo fator de escala. */
export const MODOS_ESCALAVEIS: readonly ModoQuantidade[] = ['proporcional']

export interface ItemEtapa {
  id: string
  /** Codigo do insumo. Copiado, nao referenciado: a versao antiga tem que ficar legivel. */
  codigo: string
  descricao: string
  /** Insumo de receita e sempre KG. Embalagem tem unidade livre. */
  unidade: string
  modo: ModoQuantidade
  /** Quantidade literal. Usada por `fixa`/`proporcional`, e resultado dos outros modos. */
  qtd?: number
  /** Custo unitario DA EPOCA. */
  preco: number
  /** Data do preco usado. O escopo exige guardar as duas coisas. */
  precoData?: string | null
  /** `multiplo_lote`, `coef_rend`, `coef_linha`: parcela constante. */
  base?: number
  /** `coef_rend` e `coef_linha`: multiplicador. */
  coef?: number
  /** `saida_etapa`: id da etapa. `coef_linha`: id do item de referencia. */
  ref?: string
  /** `multiplo_lote`: numero de batidas, quando difere da media da etapa. */
  lote?: number
  /** Insumo provisorio, ainda sem codigo no Protheus. */
  provisorio?: boolean
}

export type ModoRendimento = 'fator' | 'perdas'

export interface Rendimento {
  modo: ModoRendimento
  /** `fator`: multiplicador sobre o total insumido. Invariante a escala. */
  fator?: number
}

/**
 * Onde a perda incide — e a resposta muda a conta.
 *
 * `sobre_entrada` .. desconta do que foi insumido
 * `sobre_saida` .... perda sobre o rendimento; recompor exige dividir por
 *                    (1 - percentual), nao multiplicar por (1 + percentual)
 */
export type TipoPerda = 'sobre_entrada' | 'sobre_saida'

export interface Perda {
  nome: string
  valorKg: number
  unidade: string
  /** Alternativa ao valor absoluto. Fracao, nao porcentagem: 0,05 e 5%. */
  percentual?: number | null
  tipo: TipoPerda
  /**
   * Perda de uma batida so, diluida na media de batidas da etapa.
   *
   * Fundo de caldeira acontece uma vez por producao, nao a cada batida.
   */
  rateada: boolean
  observacao?: string | null
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
  /** Quantas unidades (bags) saem de uma batida. */
  unidadesPorBatida: number
  precoVenda: number | null
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

// -------------------------------------------------------------- ficha inteira

/** Linha industrial e sua capacidade por batida. Sugere a quantidade da FT Produção. */
export interface LinhaProducao {
  id: string
  nome: string
  capacidadeKg: number
  ativa: boolean
}

/** Estados da integracao com o ERP. */
export type StatusIntegracao = 'nao_integrado' | 'pendente' | 'integrando' | 'integrado' | 'erro'

/**
 * Dados industriais do cabecalho. Nomes conforme a ficha de referencia.
 */
export interface DadosIndustriais {
  codigoDocumento: string | null
  area: string | null
  descricaoComercial: string | null
  descricaoTecnica: string | null
  status: string | null
  armazenamento: string | null
  shelfLifeDias: number | null
  bagsPorCaixa: number | null
  caixasPorPallet: number | null
  numeroCaldeiras: number | null
  dataElaboracao: string | null
  dataRevisao: string | null
}

/** Um passo do modo de preparo, com os parametros que hoje vivem em prosa. */
export interface PassoPreparo {
  ordem: number
  descricao: string
  equipamento: string | null
  velocidade: string | null
  tempoMinutos: number | null
  temperatura: string | null
  pontoControle: string | null
  observacao: string | null
}

export interface PadraoSensorial {
  cor: string | null
  sabor: string | null
  aroma: string | null
  textura: string | null
  aspecto: string | null
}

/**
 * Ingrediente como a fabrica o enxerga.
 *
 * `quantidadeKg` pode ser nula: na ficha de referencia o creme de leite varia
 * por fornecedor ("Terra Viva 7,200 / Quatá 5,200 — 1 balde"), e so a
 * orientacao operacional existe. NAO substitui a quantidade tecnica da BOM.
 */
export interface IngredienteOperacional {
  ordem: number
  nome: string
  quantidadeKg: number | null
  orientacao: string
}

export interface FichaProcesso {
  codigoDocumento: string | null
  revisao: string | null
  conservacao: string | null
  rendimentoIndustrial: string | null
  ingredientes: IngredienteOperacional[]
  passos: PassoPreparo[]
  sensorial: PadraoSensorial
}

/** Uma alteracao no historico documental, que sai impressa na ficha. */
export interface AlteracaoDocumental {
  revisao: string
  data: string
  alteracao: string
  responsavel: string
}
