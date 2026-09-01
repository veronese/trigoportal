/**
 * Regressao do motor de calculo da Ficha de Custo.
 *
 * POR QUE EXISTE: o calculo da ficha e o codigo de maior consequencia do modulo.
 * Um erro nele nao quebra tela nem falha build — produz um custo plausivel e
 * errado, que vira decisao de preco. Nenhum typecheck pega isso.
 *
 * COMO FUNCIONA: `fixtures/ficha-referencia-baseline.json` guarda os numeros
 * produzidos pelo motor ORIGINAL do prototipo (js/services/calc-etapas.js),
 * rodado sem alteracao sobre a ficha FTC-P&D-088 "Molho Branco Cremoso
 * Refrigerado" — a mesma que, segundo o escopo, bate com a planilha real. Este
 * script roda o motor portado sobre a mesma entrada e exige numeros identicos.
 *
 * A baseline NAO deve ser regerada para "fazer o teste passar". Se o calculo
 * mudar de proposito, troque a baseline em um commit que explique a mudanca de
 * regra — e que mostre os dois valores.
 *
 *   pnpm --filter @trigo/bff verificar-calculo
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  calcularFatorEscala,
  calcularFichaCusto,
  escalarEtapas,
  quantidadeParaRendimentoLiquido,
  rendimentoLiquidoEsperado,
  type EntradaCalculo,
  type EtapaFicha,
  type ItemEtapa,
} from '@trigo/core'

const FIXTURES = path.join(__dirname, 'fixtures')
/** Igualdade praticamente exata: tolerancia generosa deixaria passar o erro que este teste caca. */
const TOLERANCIA = 1e-9

interface Baseline {
  rendimento_final: number
  custo_batida_final: number
  custo_kg_final: number
  custo_unidade: number
  bags_por_batida: number
  custo_embalagens: number
  etapa_receita: { total: number; custo: number; rendimento: number; custo_kg: number }
  embalagens_qtds: { id: string; qtd: number; valor: number }[]
}

const caso = JSON.parse(
  readFileSync(path.join(FIXTURES, 'ficha-referencia.json'), 'utf8'),
) as Record<string, any>
const baseline = JSON.parse(
  readFileSync(path.join(FIXTURES, 'ficha-referencia-baseline.json'), 'utf8'),
) as Baseline

const versao = caso.versions[0]

/**
 * Traduz o formato do prototipo (snake_case, campos opcionais) para o dominio.
 *
 * Existe so aqui: a fixture guarda o formato ANTIGO de proposito, porque o teste
 * precisa comparar contra a entrada que o motor original recebia. O importador
 * de fichas legadas vai precisar de uma traducao parecida.
 */
function traduzir(): EntradaCalculo {
  const etapas: EtapaFicha[] = versao.etapas.map((e: any, iEtapa: number) => ({
    id: e.id,
    nome: e.nome,
    tipo: e.tipo,
    ordem: e.ordem ?? iEtapa + 1,
    usaPercentual: e.usa_percentual !== false,
    itens: (e.itens ?? []).map(
      (it: any, i: number): ItemEtapa => ({
        id: it.id ?? `${e.id}-${i}`,
        codigo: it.codigo ?? '',
        descricao: it.descricao ?? '',
        unidade: it.unidade ?? 'KG',
        modo: it.modo ?? 'fixa',
        qtd: it.qtd,
        preco: it.preco ?? 0,
        base: it.base,
        coef: it.coef,
        ref: it.ref,
        lote: it.lote,
      }),
    ),
    // A fixture guarda o formato antigo, que nao tinha unidade nem tipo de
    // perda. `sobre_entrada` e o comportamento que o motor original praticava:
    // a perda descontava do que foi insumido.
    perdas: (e.perdas ?? []).map((p: any) => ({
      nome: p.nome,
      valorKg: p.valor_kg ?? 0,
      unidade: 'KG',
      tipo: 'sobre_entrada' as const,
      rateada: Boolean(p.rateada),
    })),
    rendimento: { modo: e.rendimento?.modo ?? 'perdas', fator: e.rendimento?.fator },
    mediaBatidas: e.media_batidas ?? 1,
  }))

  return { etapas, pesoUnitario: versao.peso_unit, precoVenda: versao.preco_venda ?? null }
}

const resultado = calcularFichaCusto(traduzir())

let falhas = 0

function conferir(nome: string, portado: number, original: number): void {
  const diferenca = Math.abs(portado - original)
  const ok = diferenca <= TOLERANCIA
  if (!ok) falhas++
  console.log(
    `  ${ok ? 'ok   ' : 'FALHA'} ${nome.padEnd(21)} ` +
      `portado ${portado.toFixed(8).padStart(15)}   original ${original.toFixed(8).padStart(15)}` +
      (ok ? '' : `   diferenca ${diferenca}`),
  )
}

console.log('')
console.log(`  Ficha ${caso.code} — ${caso.name}`)
console.log(`  ${versao.etapas.length} etapas, peso unitario ${versao.peso_unit} kg`)
console.log('')

conferir('rendimento final', resultado.rendimentoFinal, baseline.rendimento_final)
conferir('custo da batida', resultado.custoBatida, baseline.custo_batida_final)
conferir('custo por kg', resultado.custoKg, baseline.custo_kg_final)
conferir('custo por unidade', resultado.custoUnidade, baseline.custo_unidade)
conferir('unidades/batida', resultado.unidadesPorBatida, baseline.bags_por_batida)
conferir('custo embalagens', resultado.custoEmbalagens, baseline.custo_embalagens)

const receita = resultado.etapas[0]
if (receita) {
  conferir('etapa total kg', receita.total, baseline.etapa_receita.total)
  conferir('etapa custo', receita.custo, baseline.etapa_receita.custo)
  conferir('etapa rendimento', receita.rendimento, baseline.etapa_receita.rendimento)
  conferir('etapa custo/kg', receita.custoKg, baseline.etapa_receita.custo_kg)
}

// As embalagens sao o ponto mais frageis do calculo: a quantidade de uma
// depende da de outra (etiqueta por caixa, fita por caixa, ribbon por etiqueta),
// resolvida por ponto-fixo. Conferir item por item, e nao so o total, garante
// que a cadeia foi percorrida na mesma ordem.
const embalagem = resultado.embalagens[0]
if (embalagem) {
  console.log('')
  console.log('  Cadeia de dependencia das embalagens, item por item:')
  for (const esperado of baseline.embalagens_qtds) {
    const obtido = embalagem.itens.find((i) => i.id === esperado.id)
    if (!obtido) {
      console.log(`  FALHA item de embalagem "${esperado.id}" ausente no resultado portado`)
      falhas++
      continue
    }
    conferir(`emb ${esperado.id}`, obtido.qtdResolvida, esperado.qtd)
  }
}

console.log('')
if (resultado.validacoes.length > 0) {
  console.log('  Validacoes emitidas pelo motor portado:')
  for (const v of resultado.validacoes) console.log(`    ${v.nivel}: ${v.mensagem}`)
  console.log('')
}

// ---------------------------------------------------------------------------
// Escalonamento e calculo inverso.
//
// Nao existiam no prototipo, entao nao ha baseline para comparar. Aqui a
// verificacao e por PROPRIEDADE MATEMATICA: escalar e depois medir tem que
// devolver exatamente o alvo, e o inverso tem que voltar ao ponto de partida.
// ---------------------------------------------------------------------------

console.log('')
console.log('  Escalonamento e calculo inverso:')

const entradaBase = traduzir()

// A ficha de referencia tem TODOS os itens de receita em `fixa`. Escalar sem
// converter para `proporcional` nao muda nada — e o teste prova isso de
// proposito, porque e exatamente a armadilha que o importador de fichas antigas
// vai encontrar.
const semConverter = escalarEtapas(entradaBase.etapas, 0.5)
conferir('escala sem converter', semConverter.escalados, 0)

const proporcionais: EtapaFicha[] = entradaBase.etapas.map((etapa) =>
  etapa.tipo === 'embalagem'
    ? etapa
    : { ...etapa, itens: etapa.itens.map((i): ItemEtapa => ({ ...i, modo: 'proporcional' })) },
)

const fator = calcularFatorEscala(resultado.rendimentoFinal, 5)
const escalado = escalarEtapas(proporcionais, fator)
const emCincoKg = calcularFichaCusto({ ...entradaBase, etapas: escalado.etapas })

conferir('itens escalados', escalado.escalados, 12)
conferir('rendimento em 5 kg', emCincoKg.rendimentoFinal, 5)

// O custo POR QUILO da receita nao muda com a escala: e a propriedade que prova
// que o redimensionamento foi proporcional de verdade. O custo/kg FINAL muda,
// porque as embalagens nao escalam junto — e isso e correto: caixa nao vira
// meia caixa.
conferir('custo/kg da receita', emCincoKg.etapas[0]!.custoKg, resultado.etapas[0]!.custoKg)

const necessario = quantidadeParaRendimentoLiquido(100, 0.05)
conferir('inverso 100 kg / 5%', necessario, 105.26315789473684)
conferir('volta ao liquido', rendimentoLiquidoEsperado(necessario, 0.05), 100)

// A conta errada fica registrada no proprio teste, para ninguem "simplificar"
// depois.
const errado = 100 * 1.05
console.log(
  `  nota   multiplicar por 1,05 daria ${errado.toFixed(5)} kg e entregaria ` +
    `${rendimentoLiquidoEsperado(errado, 0.05).toFixed(5)} kg, nao 100.`,
)

for (const [nome, fn] of [
  ['perda de 100%', () => quantidadeParaRendimentoLiquido(100, 1)],
  ['rendimento base zero', () => calcularFatorEscala(0, 5)],
] as const) {
  let lancou = false
  try {
    fn()
  } catch {
    lancou = true
  }
  if (!lancou) falhas++
  console.log(`  ${lancou ? 'ok   ' : 'FALHA'} recusa ${nome}`)
}

console.log('')
console.log(
  falhas === 0
    ? '  Motor identico ao original, e o escalonamento fecha.'
    : `  ${falhas} divergencia(s): o calculo mudou.`,
)

if (falhas > 0) process.exitCode = 1
