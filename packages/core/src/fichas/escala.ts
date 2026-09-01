import { MODOS_ESCALAVEIS, type EtapaFicha, type ItemEtapa, type Perda } from './types'

/**
 * Redimensionamento da formulacao e recomposicao de rendimento liquido.
 *
 * Existe porque a mesma formula roda em tres escalas: bancada (5 kg), batida
 * teste (80 kg) e producao (590 kg). O protótipo NAO fazia isso — ele guardava
 * uma escala so.
 *
 * PURO: sem I/O, sem data, sem aleatoriedade. Entrada igual, saida igual.
 */

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

/**
 * Fator para levar a formulacao de um rendimento a outro.
 *
 * @throws quando o rendimento de origem nao e positivo — escalar a partir de
 *   zero e divisao por zero disfarcada, e o resultado seria Infinity calado.
 */
export function calcularFatorEscala(rendimentoBase: number, quantidadeDesejada: number): number {
  if (!(rendimentoBase > 0)) {
    throw new Error(
      'Nao da para redimensionar a partir de um rendimento zero ou negativo. ' +
        'Calcule a ficha na escala atual antes de mudar a quantidade final.',
    )
  }
  if (!(quantidadeDesejada > 0)) {
    throw new Error('A quantidade final desejada tem que ser maior que zero.')
  }
  return quantidadeDesejada / rendimentoBase
}

export interface ResultadoEscala {
  etapas: EtapaFicha[]
  /** Itens multiplicados pelo fator. */
  escalados: number
  /** Itens deixados como estavam, por serem fixos ou derivados. */
  mantidos: number
}

/**
 * Aplica o fator aos itens que acompanham o redimensionamento.
 *
 * SO os itens em modo `proporcional` sao multiplicados. `fixa` fica como esta —
 * e essa distincao e o ponto: redimensionar tudo multiplicaria a etiqueta junto
 * com a farinha. Os modos derivados (`coef_rend`, `coef_linha`, `saida_etapa`,
 * `multiplo_lote`) tambem nao sao tocados: eles ja se recalculam sozinhos a
 * partir do rendimento ou de outra linha.
 *
 * ATENCAO ao importar fichas antigas: no protótipo TODOS os itens de receita
 * estao como `fixa`, entao escalar uma ficha importada sem converte-los nao faz
 * nada. Por isso o retorno conta quantos itens foram escalados e quantos nao —
 * escala que nao faz nada tem que ser visivel, nao silenciosa.
 */
export function escalarEtapas(etapas: EtapaFicha[], fator: number): ResultadoEscala {
  let escalados = 0
  let mantidos = 0

  const novas = etapas.map((etapa) => {
    const itens = etapa.itens.map((item): ItemEtapa => {
      if (!MODOS_ESCALAVEIS.includes(item.modo)) {
        mantidos++
        return { ...item }
      }
      escalados++
      return { ...item, qtd: num(item.qtd) * fator }
    })

    return { ...etapa, itens, perdas: etapa.perdas.map((p) => escalarPerda(p, fator)) }
  })

  return { etapas: novas, escalados, mantidos }
}

/**
 * Perda absoluta acompanha o volume; perda percentual e invariante.
 *
 * PENDENTE DE CONFIRMACAO COM P&D: perda `rateada` — fundo de caldeira, perda
 * da primeira batida — talvez NAO deva escalar, por ser evento por producao e
 * nao por quilo. Aqui ela escala junto, que e o comportamento conservador
 * (mantem a proporcao da ficha original). Se P&D disser que e evento fixo,
 * basta parar de escalar quando `rateada` for true.
 */
function escalarPerda(perda: Perda, fator: number): Perda {
  if (perda.percentual != null) return { ...perda }
  return { ...perda, valorKg: num(perda.valorKg) * fator }
}

/**
 * Quanto pesar para obter um rendimento liquido, dada uma perda percentual.
 *
 * A conta certa e dividir, nao multiplicar:
 *
 *   desejado 100 kg, perda 5%
 *   certo    100 / (1 - 0,05) = 105,263 kg
 *   errado   100 x 1,05       = 105,000 kg   -> entrega 99,75 kg
 *
 * A diferenca e pequena por batida e sistematica ao longo do ano. Multiplicar
 * por (1 + p) responde "quanto e 5% a mais"; a pergunta aqui e outra: "quanto
 * preciso pesar para que, perdendo 5%, sobrem 100".
 *
 * @param perdaPercentual fracao sobre a SAIDA. 0,05 e 5%.
 * @throws quando a perda e 100% ou mais — nao existe quantidade que recomponha.
 */
export function quantidadeParaRendimentoLiquido(
  liquidoDesejado: number,
  perdaPercentual: number,
): number {
  if (!(liquidoDesejado > 0)) {
    throw new Error('O rendimento liquido desejado tem que ser maior que zero.')
  }
  if (perdaPercentual < 0) {
    throw new Error('A perda percentual nao pode ser negativa.')
  }
  if (perdaPercentual >= 1) {
    throw new Error(
      `Perda de ${(perdaPercentual * 100).toFixed(1)}% consome todo o rendimento: ` +
        'nenhuma quantidade de entrada resulta no liquido desejado.',
    )
  }
  return liquidoDesejado / (1 - perdaPercentual)
}

/**
 * O inverso: quanto sobra ao pesar uma quantidade, dada a perda sobre a saida.
 *
 * Existe para a tela poder mostrar as duas direcoes sem inverter a formula na
 * mao — inverter formula em componente e como se introduz erro de sinal.
 */
export function rendimentoLiquidoEsperado(
  quantidadeEntrada: number,
  perdaPercentual: number,
): number {
  if (perdaPercentual < 0 || perdaPercentual >= 1) {
    throw new Error('A perda percentual tem que estar entre 0 e 1 (exclusive).')
  }
  return num(quantidadeEntrada) * (1 - perdaPercentual)
}
