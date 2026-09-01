import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { calcularFichaCusto, type EtapaFicha, type ItemEtapa } from '@trigo/core'

/**
 * Carga da ficha de referencia FTC-P&D-088.
 *
 * POR QUE ELA E NAO UM EXEMPLO INVENTADO: e a mesma ficha que o escopo diz
 * bater com a planilha real, e a mesma que o teste de regressao do motor usa.
 * Se a tela mostrar um numero diferente do que a planilha mostra, o erro
 * aparece na hora — o que nao aconteceria com dado ficticio.
 *
 * IMPORTA COMO ESTA: uma unica fase, `ft_producao`, sem origem. A ficha existia
 * antes do portal e nao passou por bancada nem batida teste AQUI. Fabricar essa
 * trilha para a tela ficar bonita seria inventar historico que ninguem viveu.
 *
 * Idempotente: se a ficha ja existe, nao faz nada.
 */

interface FixtureItem {
  id?: string
  codigo?: string
  descricao?: string
  unidade?: string
  modo?: string
  qtd?: number
  preco?: number
  base?: number
  coef?: number
  ref?: string
  lote?: number
}

interface FixtureEtapa {
  id: string
  nome: string
  tipo: string
  ordem?: number
  usa_percentual?: boolean
  media_batidas?: number
  rendimento?: { modo?: string; fator?: number }
  itens?: FixtureItem[]
  perdas?: { nome: string; valor_kg?: number; rateada?: boolean }[]
}

const MARCA_REFERENCIA = {
  // A ficha de referencia e da fabrica e nao traz marca. Nao invento uma:
  // quando as fichas legadas forem migradas, elas trazem a marca real e esta
  // pasta deixa de ser a unica.
  nome: 'Grupo Trigo',
  cor: '#2f3237',
}

export async function seedFichaReferencia(prisma: PrismaClient): Promise<void> {
  const arquivo = path.join(__dirname, '..', 'scripts', 'fixtures', 'ficha-referencia.json')
  const caso = JSON.parse(readFileSync(arquivo, 'utf8')) as {
    code: string
    name: string
    line: string
    versions: {
      peso_unit: number
      caldeiras?: number
      etapas: FixtureEtapa[]
      by?: string
      at?: string
      info?: Record<string, unknown>
      approval?: { steps?: { role: string; status: string; actor?: string; decided_at?: string }[] }
    }[]
  }

  const existente = await prisma.ficha.findUnique({ where: { codigo: caso.code } })
  if (existente) {
    console.log(`[seed] Ficha ${caso.code} ja existe. Nada a fazer.`)
    return
  }

  const versao = caso.versions[0]!
  const info = (versao.info ?? {}) as Record<string, string | number | null>
  const etapas = traduzir(versao.etapas)

  // Calcula ANTES de gravar: os KPIs de uma versao congelada sao gravados, e
  // nao recalculados na leitura. Importar sem eles produziria uma versao
  // vigente com custo nulo.
  const calculo = calcularFichaCusto({
    etapas,
    pesoUnitario: versao.peso_unit,
    precoVenda: null,
  })

  const marca = await prisma.fichaRestaurante.upsert({
    where: { nome: MARCA_REFERENCIA.nome },
    update: {},
    create: MARCA_REFERENCIA,
  })
  const linha = await prisma.fichaLinha.upsert({
    where: { nome: caso.line },
    update: {},
    create: { nome: caso.line },
  })

  await prisma.$transaction(async (tx) => {
    const ficha = await tx.ficha.create({
      data: {
        codigo: caso.code,
        nome: caso.name,
        restauranteId: marca.id,
        linhaId: linha.id,
        categoria: (info.area as string) ?? null,
      },
    })

    const fase = await tx.fichaFase.create({
      data: {
        fichaId: ficha.id,
        fase: 'ft_producao',
        // Sem origem: a ficha nasceu fora do portal.
        origemVersaoId: null,
        quantidadeAlvoKg: calculo.rendimentoFinal,
      },
    })

    const registro = await tx.fichaVersao.create({
      data: {
        faseId: fase.id,
        versaoFormula: 1,
        // A revisao do DOCUMENTO e "000" e nao se confunde com a versao 1 do
        // contador interno. Sao numeracoes independentes, e a ficha real prova.
        revisaoDocumental: (info.revisao as string) ?? null,
        revisaoProtheus: null,
        status: 'vigente',
        criadoPor: versao.by ?? 'importacao',
        congeladoEm: versao.at ? new Date(versao.at) : new Date(),
        quantidadeFinalKg: calculo.rendimentoFinal,
        pesoUnitario: versao.peso_unit,
        custoBatida: calculo.custoBatida,
        rendimentoKg: calculo.rendimentoFinal,
        custoKg: calculo.custoKg,
        custoUnidade: calculo.custoUnidade,
        codigoDocumento: (info.doc_code as string) ?? null,
        area: (info.area as string) ?? null,
        descricaoComercial: (info.descricao_comercial as string) ?? null,
        descricaoTecnica: (info.descricao as string) ?? null,
        armazenamento: (info.armazenamento as string) ?? null,
        shelfLifeDias: (info.shelf_life as number) ?? null,
        bagsPorCaixa: (info.bags_caixa as number) ?? null,
        caixasPorPallet: (info.caixas_pallet as number) ?? null,
        numeroCaldeiras: versao.caldeiras ?? null,
        dataElaboracao: info.data_elab ? new Date(String(info.data_elab)) : null,
        dataRevisao: info.data_rev ? new Date(String(info.data_rev)) : null,
      },
    })

    // Os ids da fixture ("rec", "e_caixa") viram uuid. `ref` aponta para id, e
    // sem traduzir isso os itens `coef_linha` e `saida_etapa` calculariam zero.
    const mapa = new Map<string, string>()

    for (const etapa of etapas) {
      const gravada = await tx.fichaEtapa.create({
        data: {
          versaoId: registro.id,
          nome: etapa.nome,
          tipo: etapa.tipo,
          ordem: etapa.ordem,
          usaPercentual: etapa.usaPercentual,
          mediaBatidas: etapa.mediaBatidas,
          rendimentoModo: etapa.rendimento.modo,
          rendimentoFator: etapa.rendimento.fator ?? null,
        },
      })
      mapa.set(etapa.id, gravada.id)

      let ordem = 0
      for (const item of etapa.itens) {
        const criado = await tx.fichaItem.create({
          data: {
            etapaId: gravada.id,
            ordem: ordem++,
            codigo: item.codigo,
            descricao: item.descricao,
            unidade: item.unidade,
            modo: item.modo,
            qtd: item.qtd ?? null,
            preco: item.preco,
            base: item.base ?? null,
            coef: item.coef ?? null,
            lote: item.lote ?? null,
            ref: item.ref ?? null,
          },
        })
        mapa.set(item.id, criado.id)
      }

      let ordemPerda = 0
      for (const perda of etapa.perdas) {
        await tx.fichaPerda.create({
          data: {
            etapaId: gravada.id,
            nome: perda.nome,
            valorKg: perda.valorKg,
            unidade: perda.unidade,
            tipo: perda.tipo,
            rateada: perda.rateada,
            ordem: ordemPerda++,
          },
        })
      }
    }

    const comRef = await tx.fichaItem.findMany({
      where: { etapa: { versaoId: registro.id }, ref: { not: null } },
    })
    for (const item of comRef) {
      const destino = mapa.get(item.ref!)
      if (destino) await tx.fichaItem.update({ where: { id: item.id }, data: { ref: destino } })
    }

    // A aprovacao vem da propria ficha: P&D, Anna Rita. As demais areas nao
    // constam no documento, e registrar "aprovado" por elas seria assinar em
    // nome de quem nao assinou.
    for (const [i, passo] of (versao.approval?.steps ?? []).entries()) {
      await tx.fichaAprovacao.create({
        data: {
          versaoId: registro.id,
          area: passo.role,
          ordem: i + 1,
          status: passo.status === 'approved' ? 'aprovado' : 'pendente',
          decididoPor: passo.actor ?? null,
          decididoEm: passo.decided_at ? new Date(passo.decided_at) : null,
        },
      })
    }

    await tx.fichaAuditoria.create({
      data: {
        fichaId: ficha.id,
        versaoId: registro.id,
        evento: 'criou',
        autor: 'importacao',
        motivo: 'Carga da ficha de referencia do escopo, ja em producao antes do portal.',
        valorNovo: `custo/kg ${calculo.custoKg.toFixed(4)}, rendimento ${calculo.rendimentoFinal.toFixed(3)} kg`,
      },
    })
  })

  console.log(
    `[seed] Ficha ${caso.code} importada: rendimento ${calculo.rendimentoFinal.toFixed(3)} kg, ` +
      `custo/kg R$ ${calculo.custoKg.toFixed(4)}`,
  )
}

/** Traduz o formato do prototipo para o dominio. Mesmo mapeamento do teste de regressao. */
function traduzir(etapas: FixtureEtapa[]): EtapaFicha[] {
  return etapas.map((e, iEtapa) => ({
    id: e.id,
    nome: e.nome,
    tipo: e.tipo as EtapaFicha['tipo'],
    ordem: e.ordem ?? iEtapa + 1,
    usaPercentual: e.usa_percentual !== false,
    itens: (e.itens ?? []).map(
      (it, i): ItemEtapa => ({
        id: it.id ?? `${e.id}-${i}`,
        codigo: it.codigo ?? '',
        descricao: it.descricao ?? '',
        unidade: it.unidade ?? 'KG',
        modo: (it.modo ?? 'fixa') as ItemEtapa['modo'],
        qtd: it.qtd,
        preco: it.preco ?? 0,
        base: it.base,
        coef: it.coef,
        ref: it.ref,
        lote: it.lote,
      }),
    ),
    // O formato antigo nao tinha unidade nem tipo de perda. `sobre_entrada` e o
    // que o motor original praticava: a perda descontava do que foi insumido.
    perdas: (e.perdas ?? []).map((p) => ({
      nome: p.nome,
      valorKg: p.valor_kg ?? 0,
      unidade: 'KG',
      tipo: 'sobre_entrada' as const,
      rateada: Boolean(p.rateada),
    })),
    rendimento: {
      modo: (e.rendimento?.modo ?? 'perdas') as 'fator' | 'perdas',
      fator: e.rendimento?.fator,
    },
    mediaBatidas: e.media_batidas ?? 1,
  }))
}
