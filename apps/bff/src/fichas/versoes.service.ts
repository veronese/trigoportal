import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import {
  ORDEM_DAS_FASES,
  SEQUENCIA_APROVACAO,
  calcularFatorEscala,
  calcularFichaCusto,
  escalarEtapas,
  impedimentosDaPromocao,
  proximaFase,
  ROTULO_FASE,
  type AvaliacaoPromocao,
  type DecidirAprovacaoInput,
  type EtapaFicha,
  type FaseFicha,
  type GerarVersaoInput,
  type ItemEtapa,
  type Perda,
  type PromoverFaseInput,
} from '@trigo/core'
import { PrismaService } from '../prisma/prisma.service'
import { FichasService } from './fichas.service'

/**
 * Escrita das fichas: gerar versao, promover fase e decidir aprovacao.
 *
 * As tres sao TRANSACIONAIS. Uma versao meio salva — com etapas mas sem itens,
 * ou congelada sem KPI — e pior que nenhuma versao: ela parece valida e
 * responde numero errado.
 */
@Injectable()
export class VersoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fichas: FichasService,
  ) {}

  /**
   * GERAR VERSAO: valida, calcula, congela e abre um novo rascunho.
   *
   * O rascunho corrente vira a versao congelada, e um novo rascunho nasce como
   * copia dela. Assim o P&D continua trabalhando sem que a versao recem-gerada
   * possa ser alterada — que e a exigencia central do escopo.
   */
  async gerar(versaoId: string, input: GerarVersaoInput, autor: string): Promise<{ versaoId: string; novoRascunhoId: string }> {
    const atual = await this.prisma.fichaVersao.findUnique({
      where: { id: versaoId },
      include: {
        fase: true,
        etapas: { include: { itens: true, perdas: true }, orderBy: { ordem: 'asc' } },
      },
    })
    if (!atual) throw new NotFoundException('Versao nao encontrada')
    if (atual.status !== 'rascunho') {
      throw new ConflictException(
        'Esta versao ja foi gerada e nao pode ser alterada. Crie uma nova a partir dela.',
      )
    }

    const detalhe = await this.fichas.versao(versaoId)
    const calculo = calcularFichaCusto({
      etapas: detalhe.etapas,
      pesoUnitario: detalhe.pesoUnitario ?? 0,
      precoVenda: detalhe.precoVenda,
    })

    // Erro impede gerar; aviso nao. Percentual que nao fecha 100% e aviso — a
    // ficha real de referencia tem arredondamento e ainda assim e valida.
    const erros = calculo.validacoes.filter((v) => v.nivel === 'erro')
    if (erros.length > 0) {
      throw new BadRequestException({
        message: 'A ficha tem pendencias que impedem gerar a versao.',
        issues: erros.map((e) => ({ path: ['calculo'], message: e.mensagem })),
      })
    }

    return this.prisma.$transaction(async (tx) => {
      const congeladoEm = new Date()

      await tx.fichaVersao.update({
        where: { id: versaoId },
        data: {
          status: 'em_aprovacao',
          nome: input.nome ?? atual.nome,
          motivo: input.motivo,
          revisaoDocumental: input.revisaoDocumental ?? atual.revisaoDocumental,
          congeladoEm,
          // KPIs gravados aqui e nunca recalculados depois.
          custoBatida: calculo.custoBatida,
          rendimentoKg: calculo.rendimentoFinal,
          custoKg: calculo.custoKg,
          custoUnidade: calculo.custoUnidade,
        },
      })

      // A sequencia de aprovacao nasce junto: sem ela a versao ficaria
      // "em aprovacao" sem ninguem para aprovar.
      await tx.fichaAprovacao.deleteMany({ where: { versaoId } })
      await tx.fichaAprovacao.createMany({
        data: SEQUENCIA_APROVACAO.map((area, i) => ({ versaoId, area, ordem: i + 1 })),
      })

      // O novo rascunho nasce como COPIA da versao recem-congelada: mesmos
      // itens, mesmos precos, mesma data de preco. Copia e nao referencia — e o
      // que faz a versao anterior parar de mudar quando o custo do insumo muda.
      const novoRascunho = await tx.fichaVersao.create({
        data: {
          faseId: atual.faseId,
          versaoFormula: atual.versaoFormula + 1,
          status: 'rascunho',
          criadoPor: autor,
          pesoUnitario: atual.pesoUnitario,
          precoVenda: atual.precoVenda,
          quantidadeFinalKg: atual.quantidadeFinalKg,
        },
      })
      await this.gravarEtapas(tx, novoRascunho.id, detalhe.etapas)

      await tx.fichaAuditoria.create({
        data: {
          fichaId: atual.fase.fichaId,
          versaoId,
          evento: 'gerou_versao',
          autor,
          motivo: input.motivo,
          valorNovo: `versao ${atual.versaoFormula}, custo/kg ${calculo.custoKg.toFixed(4)}`,
        },
      })

      return { versaoId, novoRascunhoId: novoRascunho.id }
    })
  }

  /** O que impede promover, sem executar nada. Alimenta a tela e o botao. */
  async avaliarPromocao(faseId: string): Promise<AvaliacaoPromocao> {
    const fase = await this.prisma.fichaFase.findUnique({
      where: { id: faseId },
      include: {
        linhaProducao: true,
        versoes: {
          orderBy: { versaoFormula: 'desc' },
          include: {
            aprovacoes: true,
            processo: { select: { id: true } },
            etapas: { include: { itens: { where: { provisorio: true }, select: { id: true } } } },
          },
        },
      },
    })
    if (!fase) throw new NotFoundException('Fase nao encontrada')

    const destino = proximaFase(fase.fase as FaseFicha)
    // A versao de origem e a mais recente que ja foi congelada.
    const origem = fase.versoes.find((v) => v.status !== 'rascunho')

    if (!destino) {
      return {
        destino: null,
        permitido: false,
        impedimentos: [
          { motivo: `${ROTULO_FASE[fase.fase as FaseFicha]} e a ultima fase.`, comoResolver: 'Nao ha o que promover.' },
        ],
        quantidadeSugeridaKg: null,
      }
    }

    const provisorios = origem
      ? origem.etapas.reduce((soma, e) => soma + e.itens.length, 0)
      : 0

    const impedimentos = impedimentosDaPromocao({
      faseAtual: fase.fase as FaseFicha,
      destino,
      origemCongelada: Boolean(origem),
      insumosProvisorios: provisorios,
      aprovada: Boolean(origem && origem.aprovacoes.every((a) => a.status === 'aprovado')),
      temLinhaProducao: Boolean(fase.linhaProducaoId),
      temFichaProcesso: Boolean(origem?.processo),
    })

    return {
      destino,
      permitido: impedimentos.length === 0,
      impedimentos,
      quantidadeSugeridaKg: fase.linhaProducao ? Number(fase.linhaProducao.capacidadeKg) : null,
    }
  }

  /**
   * Promove para a fase seguinte.
   *
   * NAO transforma nem apaga a fase anterior: cria uma fase nova apontando para
   * a versao de origem, e leva a formulacao redimensionada para a nova escala.
   */
  async promover(faseId: string, input: PromoverFaseInput, autor: string): Promise<{ faseId: string; versaoId: string }> {
    const avaliacao = await this.avaliarPromocao(faseId)
    if (!avaliacao.permitido || !avaliacao.destino) {
      throw new BadRequestException({
        message: 'A promocao esta bloqueada.',
        issues: avaliacao.impedimentos.map((i) => ({
          path: ['promocao'],
          message: `${i.motivo} ${i.comoResolver}`,
        })),
      })
    }
    if (avaliacao.destino !== input.destino) {
      throw new BadRequestException(
        `A proxima fase e ${ROTULO_FASE[avaliacao.destino]}, nao ${ROTULO_FASE[input.destino]}.`,
      )
    }

    const origem = await this.fichas.versao(input.versaoOrigemId)
    if (origem.status === 'rascunho') {
      throw new BadRequestException('Promova a partir de uma versao gerada, nao de um rascunho.')
    }

    // Redimensiona para a escala da nova fase. So os itens `proporcional`
    // mudam — o resto se recalcula sozinho ou e fixo de propósito.
    const base = calcularFichaCusto({
      etapas: origem.etapas,
      pesoUnitario: origem.pesoUnitario ?? 0,
      precoVenda: origem.precoVenda,
    })
    const fator = calcularFatorEscala(base.rendimentoFinal, input.quantidadeAlvoKg)
    const escalado = escalarEtapas(origem.etapas, fator)

    const fase = await this.prisma.fichaFase.findUniqueOrThrow({ where: { id: faseId } })

    return this.prisma.$transaction(async (tx) => {
      const novaFase = await tx.fichaFase.create({
        data: {
          fichaId: fase.fichaId,
          fase: input.destino,
          origemVersaoId: input.versaoOrigemId,
          quantidadeAlvoKg: input.quantidadeAlvoKg,
          linhaProducaoId: input.linhaProducaoId ?? null,
        },
      })

      const versao = await tx.fichaVersao.create({
        data: {
          faseId: novaFase.id,
          versaoFormula: 1,
          status: 'rascunho',
          criadoPor: autor,
          pesoUnitario: origem.pesoUnitario,
          precoVenda: origem.precoVenda,
          quantidadeFinalKg: input.quantidadeAlvoKg,
          fatorEscala: fator,
          motivo: `Promovida de ${ROTULO_FASE[origem.fase]} versao ${origem.versaoFormula}`,
        },
      })

      await this.gravarEtapas(tx, versao.id, escalado.etapas)

      await tx.fichaAuditoria.create({
        data: {
          fichaId: fase.fichaId,
          versaoId: versao.id,
          evento: 'promoveu',
          autor,
          valorAnterior: `${ROTULO_FASE[origem.fase]} v${origem.versaoFormula} (${base.rendimentoFinal.toFixed(3)} kg)`,
          valorNovo: `${ROTULO_FASE[input.destino]} (${input.quantidadeAlvoKg} kg, fator ${fator.toFixed(6)})`,
        },
      })

      return { faseId: novaFase.id, versaoId: versao.id }
    })
  }

  /** Grava etapas, itens e perdas de uma versao nova, traduzindo as refs. */
  private async gravarEtapas(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    versaoId: string,
    etapas: EtapaFicha[],
  ): Promise<void> {
    const mapa = new Map<string, string>()

    for (const etapa of etapas) {
      const criada = await tx.fichaEtapa.create({
        data: {
          versaoId,
          nome: etapa.nome,
          tipo: etapa.tipo,
          ordem: etapa.ordem,
          usaPercentual: etapa.usaPercentual,
          mediaBatidas: etapa.mediaBatidas,
          rendimentoModo: etapa.rendimento.modo,
          rendimentoFator: etapa.rendimento.fator ?? null,
        },
      })
      mapa.set(etapa.id, criada.id)

      let ordem = 0
      for (const item of etapa.itens) {
        const criado = await tx.fichaItem.create({
          data: {
            etapaId: criada.id,
            ordem: ordem++,
            codigo: item.codigo,
            descricao: item.descricao,
            unidade: item.unidade,
            modo: item.modo,
            qtd: item.qtd ?? null,
            preco: item.preco,
            precoData: item.precoData ? new Date(item.precoData) : null,
            base: item.base ?? null,
            coef: item.coef ?? null,
            lote: item.lote ?? null,
            ref: item.ref ?? null,
            provisorio: Boolean(item.provisorio),
          },
        })
        mapa.set(item.id, criado.id)
      }

      let ordemPerda = 0
      for (const perda of etapa.perdas) {
        await tx.fichaPerda.create({
          data: {
            etapaId: criada.id,
            nome: perda.nome,
            valorKg: perda.valorKg,
            unidade: perda.unidade,
            percentual: perda.percentual ?? null,
            tipo: perda.tipo,
            rateada: perda.rateada,
            observacao: perda.observacao ?? null,
            ordem: ordemPerda++,
          },
        })
      }
    }

    const comRef = await tx.fichaItem.findMany({
      where: { etapa: { versaoId }, ref: { not: null } },
    })
    for (const item of comRef) {
      const destino = mapa.get(item.ref!)
      if (destino) await tx.fichaItem.update({ where: { id: item.id }, data: { ref: destino } })
    }
  }

  /** Aprova ou reprova uma etapa da sequencia. */
  async decidir(
    versaoId: string,
    area: string,
    input: DecidirAprovacaoInput,
    autor: string,
  ): Promise<void> {
    const aprovacao = await this.prisma.fichaAprovacao.findUnique({
      where: { versaoId_area: { versaoId, area } },
      include: { versao: { include: { fase: true, aprovacoes: { orderBy: { ordem: 'asc' } } } } },
    })
    if (!aprovacao) throw new NotFoundException('Esta versao nao tem aprovacao para essa area')
    if (aprovacao.status !== 'pendente') {
      throw new ConflictException('Esta area ja decidiu sobre esta versao.')
    }

    // A sequencia importa: Qualidade nao assina antes do P&D. Sem isso, a
    // ordem das areas seria decorativa.
    const anteriores = aprovacao.versao.aprovacoes.filter((a) => a.ordem < aprovacao.ordem)
    const pendente = anteriores.find((a) => a.status !== 'aprovado')
    if (pendente) {
      throw new ConflictException(
        `A area ${pendente.area} ainda nao decidiu. A aprovacao segue a ordem definida.`,
      )
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.fichaAprovacao.update({
        where: { versaoId_area: { versaoId, area } },
        data: {
          status: input.decisao,
          decididoPor: autor,
          decididoEm: new Date(),
          comentario: input.comentario ?? null,
          identificador: `${area}-${versaoId.slice(0, 8)}`,
        },
      })

      if (input.decisao === 'reprovado') {
        // Reprovar devolve a versao inteira para edicao — nao adianta manter
        // "em aprovacao" uma ficha que precisa mudar.
        await tx.fichaVersao.update({ where: { id: versaoId }, data: { status: 'rascunho' } })
      } else {
        const todas = await tx.fichaAprovacao.findMany({ where: { versaoId } })
        if (todas.every((a) => a.status === 'aprovado')) {
          // A nova vigente aposenta a anterior da mesma fase.
          await tx.fichaVersao.updateMany({
            where: { faseId: aprovacao.versao.faseId, status: 'vigente' },
            data: { status: 'obsoleta' },
          })
          await tx.fichaVersao.update({ where: { id: versaoId }, data: { status: 'vigente' } })
        }
      }

      await tx.fichaAuditoria.create({
        data: {
          fichaId: aprovacao.versao.fase.fichaId,
          versaoId,
          evento: input.decisao === 'aprovado' ? 'aprovou' : 'reprovou',
          autor,
          campo: area,
          motivo: input.comentario ?? null,
        },
      })
    })
  }

  /** Trilha canonica, para a tela nao reimplementar a ordem. */
  get trilha(): readonly FaseFicha[] {
    return ORDEM_DAS_FASES
  }
}
