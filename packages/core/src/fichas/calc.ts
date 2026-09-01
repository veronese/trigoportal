import type {
  EmbalagemCalculada,
  EntradaCalculo,
  EtapaCalculada,
  EtapaFicha,
  ItemCalculado,
  ItemEtapa,
  PerdaCalculada,
  ResultadoCalculo,
  Validacao,
} from './types'

/**
 * Motor de calculo da Ficha de Custo — etapas em cascata.
 *
 * POR QUE ESTA EM packages/core: o mesmo calculo tem que rodar na tela, para o
 * usuario ver o custo mudar enquanto digita, e no BFF, para congelar a versao
 * aprovada. Duas implementacoes divergiriam, e a divergencia apareceria como
 * "o sistema mostrou um custo e gravou outro".
 *
 * PURO de proposito: nao le banco, nao chama Protheus, nao usa data nem
 * aleatoriedade. Mesma entrada, mesma saida, sempre — e por isso da para
 * comparar contra a planilha de referencia.
 *
 * PORTADO do prototipo (js/services/calc-etapas.js) preservando a aritmetica e
 * a ordem das operacoes, para os numeros baterem exatamente. Conferido contra a
 * ficha FTC-P&D-088 "Molho Branco Cremoso Refrigerado": rendimento 590,1919 kg,
 * custo da batida R$ 3.080,6339, custo/kg R$ 5,219716.
 */

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

/** Quantas passadas o ponto-fixo das embalagens tenta antes de desistir. */
const MAXIMO_PASSADAS = 12

interface ContextoEtapas {
  porId: Record<string, EtapaCalculada>
}

/**
 * Resolve uma etapa medida em quilos: receita, subreceita, montagem, processo.
 */
function calcularEtapaEmKg(etapa: EtapaFicha, ctx: ContextoEtapas): EtapaCalculada {
  const itens: ItemCalculado[] = etapa.itens.map((item) => {
    const resolvido = resolverQuantidade(item, etapa, ctx)
    return {
      ...item,
      qtdResolvida: resolvido.qtd,
      preco: resolvido.preco,
      valor: num(resolvido.qtd) * num(resolvido.preco),
      pct: 0,
    }
  })

  const total = itens.reduce((soma, item) => soma + num(item.qtdResolvida), 0)
  const custo = itens.reduce((soma, item) => soma + num(item.valor), 0)
  for (const item of itens) item.pct = total ? num(item.qtdResolvida) / total : 0

  const perdas: PerdaCalculada[] = etapa.perdas.map((p) => ({
    ...p,
    pct: total ? num(p.valorKg) / total : 0,
  }))

  // Dois caminhos, e eles NAO sao equivalentes:
  //  - fator:  rendimento = fator x total. As perdas declaradas ficam apenas
  //            informativas, e podem nem fechar com o fator.
  //  - perdas: rendimento = total - soma das perdas.
  // O escopo permite os dois; qual vale e escolha da ficha.
  const rendimento =
    etapa.rendimento.modo === 'fator'
      ? num(etapa.rendimento.fator) * total
      : total -
        perdas.reduce((soma, p) => {
          const divisor = p.rateada ? etapa.mediaBatidas || 1 : 1
          return soma + num(p.valorKg) / divisor
        }, 0)

  return {
    id: etapa.id,
    nome: etapa.nome,
    tipo: etapa.tipo,
    itens,
    total,
    custo,
    perdas,
    rendimento,
    custoKg: rendimento > 0 ? custo / rendimento : 0,
    usaPercentual: etapa.usaPercentual,
  }
}

function resolverQuantidade(
  item: ItemEtapa,
  etapa: EtapaFicha,
  ctx: ContextoEtapas,
): { qtd: number; preco: number } {
  // Saida de outra etapa: a subreceita entra como insumo, com o rendimento e o
  // custo/kg dela. E o que faz o custo somar de baixo para cima.
  if (item.modo === 'saida_etapa') {
    const referida = item.ref ? ctx.porId[item.ref] : undefined
    return { qtd: referida ? referida.rendimento : 0, preco: referida ? referida.custoKg : 0 }
  }

  if (item.modo === 'multiplo_lote') {
    const lotes = item.lote != null ? item.lote : etapa.mediaBatidas || 1
    return { qtd: num(item.base) * num(lotes), preco: num(item.preco) }
  }

  // `fixa` e `proporcional` usam a quantidade literal. A diferenca entre os
  // dois NAO e do motor: e de escala.ts, que multiplica so os proporcionais
  // antes de chegar aqui. Separar assim mantem o motor puro em relacao ao
  // redimensionamento — ele calcula o que recebe, sem opinar sobre escala.
  //
  // Os modos coef_* pertencem a embalagem e cairiam aqui por engano; a
  // validacao no fim avisa quando isso acontece.
  return { qtd: num(item.qtd), preco: num(item.preco) }
}

/**
 * Resolve a etapa de embalagens.
 *
 * Embalagem depende do que SAIU, nao do que entrou, e pode depender de outra
 * embalagem (etiqueta por caixa, fita por caixa). Por isso o ponto-fixo: cada
 * passada resolve o que ja tem referencia pronta, ate ninguem mais faltar.
 */
function calcularEmbalagem(
  etapa: EtapaFicha,
  rendimentoFinal: number,
): { calculada: EmbalagemCalculada; naoResolvidos: string[] } {
  const resolvido: Record<string, number> = {}
  let pendente = true
  let passadas = 0

  while (pendente && passadas < MAXIMO_PASSADAS) {
    pendente = false
    passadas++

    for (const item of etapa.itens) {
      if (resolvido[item.id] != null) continue

      let qtd: number | null
      if (item.modo === 'coef_rend') {
        qtd = num(item.base) + num(item.coef) * rendimentoFinal
      } else if (item.modo === 'coef_linha') {
        const referencia = item.ref ? resolvido[item.ref] : undefined
        qtd = referencia != null ? num(item.base) + num(item.coef) * referencia : null
      } else {
        // `fixa`, `proporcional` e o resto: quantidade literal.
        qtd = num(item.qtd)
      }

      if (qtd != null) resolvido[item.id] = qtd
      else pendente = true
    }
  }

  const itens: ItemCalculado[] = etapa.itens.map((item) => {
    const qtd = num(resolvido[item.id])
    return { ...item, qtdResolvida: qtd, valor: qtd * num(item.preco), pct: 0 }
  })

  return {
    calculada: {
      id: etapa.id,
      nome: etapa.nome,
      itens,
      custo: itens.reduce((soma, item) => soma + num(item.valor), 0),
    },
    // Item que sobrou sem resolver significa referencia circular ou cadeia mais
    // longa que o limite de passadas. O original devolvia zero em silencio.
    naoResolvidos: etapa.itens.filter((i) => resolvido[i.id] == null).map((i) => i.id),
  }
}

/**
 * Ordena as etapas em kg pelas referencias `saida_etapa`.
 *
 * Sem isso, uma etapa que consome a saida de outra poderia ser calculada antes
 * dela e receber zero. Percorre em profundidade e detecta ciclo.
 */
function ordenarPorDependencia(etapas: EtapaFicha[]): EtapaFicha[] {
  const porId = new Map(etapas.map((e) => [e.id, e]))
  const saida: EtapaFicha[] = []
  const pronto = new Set<string>()
  const visitando = new Set<string>()

  function visitar(etapa: EtapaFicha): void {
    if (pronto.has(etapa.id)) return
    if (visitando.has(etapa.id)) {
      throw new Error(`Referencia circular entre etapas, comecando em "${etapa.nome}".`)
    }

    visitando.add(etapa.id)
    for (const item of etapa.itens) {
      if (item.modo !== 'saida_etapa' || !item.ref) continue
      const referida = porId.get(item.ref)
      if (referida) visitar(referida)
    }
    visitando.delete(etapa.id)

    pronto.add(etapa.id)
    saida.push(etapa)
  }

  for (const etapa of [...etapas].sort((a, b) => a.ordem - b.ordem)) visitar(etapa)
  return saida
}

/** Calcula a ficha inteira. Lanca apenas em referencia circular. */
export function calcularFichaCusto(entrada: EntradaCalculo): ResultadoCalculo {
  const emKg = entrada.etapas.filter((e) => e.tipo !== 'embalagem')
  const deEmbalagem = entrada.etapas.filter((e) => e.tipo === 'embalagem')

  const ctx: ContextoEtapas = { porId: {} }
  const etapas: EtapaCalculada[] = []
  for (const etapa of ordenarPorDependencia(emKg)) {
    const calculada = calcularEtapaEmKg(etapa, ctx)
    ctx.porId[etapa.id] = calculada
    etapas.push(calculada)
  }

  // A etapa final e a de maior ordem entre as medidas em kg: e o rendimento
  // dela que as embalagens usam e que divide o custo da batida.
  const etapaFinal = [...emKg].sort((a, b) => b.ordem - a.ordem)[0]
  const final = etapaFinal ? ctx.porId[etapaFinal.id] : undefined
  const rendimentoFinal = final ? final.rendimento : 0

  const embalagens: EmbalagemCalculada[] = []
  const naoResolvidos: string[] = []
  for (const etapa of deEmbalagem) {
    const r = calcularEmbalagem(etapa, rendimentoFinal)
    embalagens.push(r.calculada)
    naoResolvidos.push(...r.naoResolvidos)
  }

  const custoEmbalagens = embalagens.reduce((soma, e) => soma + e.custo, 0)
  const custoBatida = (final ? final.custo : 0) + custoEmbalagens
  const custoKg = rendimentoFinal > 0 ? custoBatida / rendimentoFinal : 0
  const peso = num(entrada.pesoUnitario)
  const precoVenda = entrada.precoVenda ? num(entrada.precoVenda) : null

  const resultado: ResultadoCalculo = {
    etapas,
    embalagens,
    custoEmbalagens,
    custoBatida,
    rendimentoFinal,
    custoKg,
    custoUnidade: custoKg * peso,
    unidadesPorBatida: peso > 0 ? rendimentoFinal / peso : 0,
    precoVenda,
    cmv: precoVenda ? custoKg / precoVenda : null,
    margemReais: precoVenda ? precoVenda - custoKg : null,
    margemPct: precoVenda ? (precoVenda - custoKg) / precoVenda : null,
    validacoes: [],
  }

  resultado.validacoes = validar(resultado, entrada, naoResolvidos)
  return resultado
}

/**
 * Validacoes que o usuario precisa ver antes de enviar para aprovacao.
 *
 * Devolve lista em vez de lancar: ficha em construcao passa por estados
 * invalidos, e travar a digitacao no meio seria pior que avisar.
 */
function validar(
  resultado: ResultadoCalculo,
  entrada: EntradaCalculo,
  naoResolvidos: string[],
): Validacao[] {
  const vs: Validacao[] = []

  for (const etapa of resultado.etapas) {
    if (etapa.usaPercentual) {
      const soma = etapa.itens.reduce((s, item) => s + num(item.pct), 0)
      if (Math.abs(soma - 1) > 0.01) {
        vs.push({
          nivel: 'aviso',
          mensagem: `Soma dos percentuais da etapa "${etapa.nome}" e ${(soma * 100).toFixed(1)}%, esperado 100%.`,
        })
      }
    }

    if (!(etapa.rendimento > 0)) {
      vs.push({
        nivel: 'erro',
        mensagem: `Rendimento da etapa "${etapa.nome}" tem que ser maior que zero.`,
      })
    }

    if (etapa.rendimento > etapa.total + 1e-6) {
      vs.push({
        nivel: 'erro',
        mensagem:
          `Rendimento da etapa "${etapa.nome}" (${etapa.rendimento.toFixed(2)} kg) e maior que ` +
          `o total insumido (${etapa.total.toFixed(2)} kg).`,
      })
    }

    // Acrescentado ao portar: modo de embalagem em etapa medida em kg cai no
    // caminho da quantidade literal e produz numero sem sentido, calado.
    for (const item of etapa.itens) {
      if (item.modo === 'coef_rend' || item.modo === 'coef_linha') {
        vs.push({
          nivel: 'erro',
          mensagem:
            `O item "${item.descricao}" da etapa "${etapa.nome}" usa um modo de embalagem ` +
            `(${item.modo}) numa etapa medida em quilos. A quantidade foi lida como literal.`,
        })
      }
    }
  }

  // Acrescentado ao portar: o original devolvia zero em silencio.
  if (naoResolvidos.length > 0) {
    vs.push({
      nivel: 'erro',
      mensagem:
        `${naoResolvidos.length} item(ns) de embalagem nao tiveram a quantidade resolvida. ` +
        'Verifique referencia circular entre itens que dependem um do outro.',
    })
  }

  if (!entrada.pesoUnitario) {
    vs.push({
      nivel: 'erro',
      mensagem: 'Peso unitario e obrigatorio para calcular custo por unidade e unidades por batida.',
    })
  }

  return vs
}
