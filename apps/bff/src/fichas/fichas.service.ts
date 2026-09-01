import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import {
  ORDEM_DAS_FASES,
  calcularFichaCusto,
  type EtapaFicha,
  type FaseFicha,
  type FichaDetalhe,
  type FichaListaResponse,
  type FichaResumo,
  type CriarFichaInput,
  type ItemEtapa,
  type PastaFichas,
  type Perda,
  type StatusVersao,
  type VersaoDetalhe,
} from '@trigo/core'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Leitura das fichas tecnicas: pastas, lista, detalhe e calculo.
 *
 * As pastas NAO sao cadastro: saem dos proprios dados. Cada ficha tem
 * obrigatoriamente restaurante e linha, e e isso que define onde ela aparece —
 * ninguem move ficha de pasta, e por isso nao existe pasta vazia nem ficha
 * orfa.
 */
@Injectable()
export class FichasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Marcas que tem ao menos uma ficha. */
  async marcas(): Promise<PastaFichas[]> {
    const restaurantes = await this.prisma.fichaRestaurante.findMany({
      where: { fichas: { some: {} } },
      include: { _count: { select: { fichas: true } } },
      orderBy: { nome: 'asc' },
    })

    return restaurantes.map((r) => ({
      id: r.id,
      nome: r.nome,
      cor: r.cor,
      fichas: r._count.fichas,
    }))
  }

  /** Linhas que tem ficha dentro de uma marca. */
  async linhasDaMarca(restauranteId: string): Promise<PastaFichas[]> {
    const linhas = await this.prisma.fichaLinha.findMany({
      where: { fichas: { some: { restauranteId } } },
      include: { _count: { select: { fichas: { where: { restauranteId } } } } },
      orderBy: { nome: 'asc' },
    })

    return linhas.map((l) => ({ id: l.id, nome: l.nome, fichas: l._count.fichas }))
  }

  /**
   * Lista de fichas, com filtro de pasta e busca.
   *
   * A busca alcanca o INSUMO — e a razao de o modelo ser normalizado e nao JSON
   * congelado: aqui e um join, e em JSON seria OPENJSON sem indice.
   */
  async listar(opcoes: {
    restauranteId?: string
    linhaId?: string
    busca?: string
    page?: number
    pageSize?: number
  }): Promise<FichaListaResponse> {
    const page = Math.max(1, Math.trunc(opcoes.page ?? 1))
    const pageSize = Math.max(1, Math.min(200, Math.trunc(opcoes.pageSize ?? 50)))
    const busca = opcoes.busca?.trim()

    const where: Prisma.FichaWhereInput = {
      ...(opcoes.restauranteId ? { restauranteId: opcoes.restauranteId } : {}),
      ...(opcoes.linhaId ? { linhaId: opcoes.linhaId } : {}),
      ...(busca
        ? {
            OR: [
              { codigo: { contains: busca } },
              { nome: { contains: busca } },
              { restaurante: { nome: { contains: busca } } },
              { linha: { nome: { contains: busca } } },
              // Por insumo, atravessando fase -> versao -> etapa -> item.
              {
                fases: {
                  some: {
                    versoes: {
                      some: {
                        etapas: {
                          some: {
                            itens: {
                              some: {
                                OR: [
                                  { descricao: { contains: busca } },
                                  { codigo: { contains: busca } },
                                ],
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    }

    const [fichas, total] = await Promise.all([
      this.prisma.ficha.findMany({
        where,
        include: {
          restaurante: { select: { nome: true } },
          linha: { select: { nome: true } },
          fases: { include: { versoes: { orderBy: { versaoFormula: 'desc' } } } },
        },
        orderBy: [{ nome: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ficha.count({ where }),
    ])

    return { data: fichas.map((f) => this.resumir(f)), total }
  }

  private resumir(ficha: {
    id: string
    codigo: string
    nome: string
    updatedAt: Date
    restaurante: { nome: string }
    linha: { nome: string }
    fases: { fase: string; versoes: { versaoFormula: number; status: string }[] }[]
  }): FichaResumo {
    // Fase mais avancada: a maior posicao na ordem canonica, e nao a ultima
    // criada — criar a batida teste depois de ja existir producao seria
    // estranho, mas a ordem do dominio nao depende de data.
    const faseAtual = [...ficha.fases]
      .map((f) => f.fase as FaseFicha)
      .sort((a, b) => ORDEM_DAS_FASES.indexOf(b) - ORDEM_DAS_FASES.indexOf(a))[0]

    const daFase = ficha.fases.find((f) => f.fase === faseAtual)
    const versao = daFase?.versoes[0]

    return {
      id: ficha.id,
      codigo: ficha.codigo,
      nome: ficha.nome,
      restaurante: ficha.restaurante.nome,
      linha: ficha.linha.nome,
      faseAtual: faseAtual ?? 'bancada',
      versaoAtual: versao?.versaoFormula ?? null,
      status: (versao?.status as StatusVersao) ?? null,
      atualizadoEm: ficha.updatedAt.toISOString(),
    }
  }

  /**
   * Cria a ficha. Ela SEMPRE nasce na bancada, com um rascunho vazio.
   *
   * Nao ha escolha de fase na criacao de proposito: permitir nascer em producao
   * seria permitir uma receita industrial que nunca passou por teste.
   */
  async criar(dto: CriarFichaInput, autor: string): Promise<{ fichaId: string; versaoId: string }> {
    const existente = await this.prisma.ficha.findUnique({ where: { codigo: dto.codigo } })
    if (existente) {
      throw new ConflictException(`Ja existe uma ficha com o codigo ${dto.codigo}.`)
    }

    return this.prisma.$transaction(async (tx) => {
      const ficha = await tx.ficha.create({
        data: {
          codigo: dto.codigo,
          nome: dto.nome,
          restauranteId: dto.restauranteId,
          linhaId: dto.linhaId,
          categoria: dto.categoria ?? null,
        },
      })

      const fase = await tx.fichaFase.create({
        data: { fichaId: ficha.id, fase: 'bancada', quantidadeAlvoKg: dto.quantidadeAlvoKg },
      })

      const versao = await tx.fichaVersao.create({
        data: {
          faseId: fase.id,
          versaoFormula: 1,
          status: 'rascunho',
          criadoPor: autor,
          quantidadeFinalKg: dto.quantidadeAlvoKg,
        },
      })

      // Uma etapa Receita ja nasce junto: ficha sem etapa nenhuma nao tem onde
      // receber o primeiro ingrediente, e a primeira acao seria burocracia.
      await tx.fichaEtapa.create({
        data: {
          versaoId: versao.id,
          nome: 'Receita',
          tipo: 'receita',
          ordem: 1,
          usaPercentual: true,
          mediaBatidas: 1,
          rendimentoModo: 'perdas',
        },
      })

      await tx.fichaAuditoria.create({
        data: { fichaId: ficha.id, versaoId: versao.id, evento: 'criou', autor },
      })

      return { fichaId: ficha.id, versaoId: versao.id }
    })
  }

  /** Cabecalho da ficha com a trilha de fases e as versoes de cada uma. */
  async detalhe(id: string): Promise<FichaDetalhe> {
    const ficha = await this.prisma.ficha.findUnique({
      where: { id },
      include: {
        restaurante: true,
        linha: true,
        fases: {
          include: {
            linhaProducao: { select: { nome: true } },
            origemVersao: {
              select: { versaoFormula: true, fase: { select: { fase: true } } },
            },
            versoes: { orderBy: { versaoFormula: 'desc' } },
          },
        },
      },
    })
    if (!ficha) throw new NotFoundException('Ficha nao encontrada')

    return {
      id: ficha.id,
      codigo: ficha.codigo,
      nome: ficha.nome,
      restaurante: { id: ficha.restaurante.id, nome: ficha.restaurante.nome, cor: ficha.restaurante.cor },
      linha: { id: ficha.linha.id, nome: ficha.linha.nome },
      categoria: ficha.categoria,
      atualizadoEm: ficha.updatedAt.toISOString(),
      // Ordena pela sequencia do dominio, para a trilha aparecer sempre igual.
      fases: [...ficha.fases]
        .sort((a, b) => ORDEM_DAS_FASES.indexOf(a.fase as FaseFicha) - ORDEM_DAS_FASES.indexOf(b.fase as FaseFicha))
        .map((f) => ({
          id: f.id,
          fase: f.fase as FaseFicha,
          quantidadeAlvoKg: f.quantidadeAlvoKg ? Number(f.quantidadeAlvoKg) : null,
          linhaProducao: f.linhaProducao?.nome ?? null,
          origem: f.origemVersao
            ? {
                faseOrigem: f.origemVersao.fase.fase as FaseFicha,
                versaoFormula: f.origemVersao.versaoFormula,
              }
            : null,
          versoes: f.versoes.map((v) => ({
            id: v.id,
            versaoFormula: v.versaoFormula,
            revisaoDocumental: v.revisaoDocumental,
            revisaoProtheus: v.revisaoProtheus,
            nome: v.nome,
            motivo: v.motivo,
            status: v.status as StatusVersao,
            criadoPor: v.criadoPor,
            congeladoEm: v.congeladoEm?.toISOString() ?? null,
            criadoEm: v.createdAt.toISOString(),
            custoKg: v.custoKg ? Number(v.custoKg) : null,
            rendimentoKg: v.rendimentoKg ? Number(v.rendimentoKg) : null,
          })),
        })),
    }
  }

  /**
   * Uma versao, com o calculo resolvido.
   *
   * DUAS FONTES para os numeros, e a diferenca importa: rascunho recalcula
   * agora, com os precos de hoje; versao congelada devolve os KPIs gravados.
   * E por isso que atualizar o custo de um insumo nao mexe no que a versao
   * antiga responde.
   */
  async versao(id: string): Promise<VersaoDetalhe> {
    const versao = await this.prisma.fichaVersao.findUnique({
      where: { id },
      include: {
        fase: { include: { ficha: { select: { id: true, codigo: true, nome: true } } } },
        aprovacoes: { orderBy: { ordem: 'asc' } },
        etapas: {
          orderBy: { ordem: 'asc' },
          include: {
            itens: { orderBy: { ordem: 'asc' } },
            perdas: { orderBy: { ordem: 'asc' } },
          },
        },
      },
    })
    if (!versao) throw new NotFoundException('Versao nao encontrada')

    const etapas: EtapaFicha[] = versao.etapas.map((e) => ({
      id: e.id,
      nome: e.nome,
      tipo: e.tipo as EtapaFicha['tipo'],
      ordem: e.ordem,
      usaPercentual: e.usaPercentual,
      mediaBatidas: e.mediaBatidas,
      rendimento: {
        modo: e.rendimentoModo as 'fator' | 'perdas',
        fator: e.rendimentoFator ? Number(e.rendimentoFator) : undefined,
      },
      itens: e.itens.map(
        (i): ItemEtapa => ({
          id: i.id,
          codigo: i.codigo,
          descricao: i.descricao,
          unidade: i.unidade,
          modo: i.modo as ItemEtapa['modo'],
          qtd: i.qtd ? Number(i.qtd) : undefined,
          preco: Number(i.preco),
          precoData: i.precoData?.toISOString() ?? null,
          base: i.base ? Number(i.base) : undefined,
          coef: i.coef ? Number(i.coef) : undefined,
          ref: i.ref ?? undefined,
          lote: i.lote ?? undefined,
          provisorio: i.provisorio,
        }),
      ),
      perdas: e.perdas.map(
        (p): Perda => ({
          nome: p.nome,
          valorKg: Number(p.valorKg),
          unidade: p.unidade,
          percentual: p.percentual ? Number(p.percentual) : null,
          tipo: p.tipo as Perda['tipo'],
          rateada: p.rateada,
          observacao: p.observacao,
        }),
      ),
    }))

    const calculo = calcularFichaCusto({
      etapas,
      pesoUnitario: versao.pesoUnitario ? Number(versao.pesoUnitario) : 0,
      precoVenda: versao.precoVenda ? Number(versao.precoVenda) : null,
    })

    const congelado = versao.status !== 'rascunho' && versao.custoKg != null
    if (congelado) {
      // Sobrescreve com o que foi gravado. O recalculo acima ainda serve para a
      // composicao e as validacoes, mas os KPIs sao os da epoca.
      calculo.custoBatida = Number(versao.custoBatida ?? 0)
      calculo.rendimentoFinal = Number(versao.rendimentoKg ?? 0)
      calculo.custoKg = Number(versao.custoKg ?? 0)
      calculo.custoUnidade = Number(versao.custoUnidade ?? 0)
    }

    return {
      id: versao.id,
      fase: versao.fase.fase as FaseFicha,
      fichaId: versao.fase.ficha.id,
      fichaCodigo: versao.fase.ficha.codigo,
      fichaNome: versao.fase.ficha.nome,
      versaoFormula: versao.versaoFormula,
      revisaoDocumental: versao.revisaoDocumental,
      revisaoProtheus: versao.revisaoProtheus,
      nome: versao.nome,
      motivo: versao.motivo,
      status: versao.status as StatusVersao,
      somenteLeitura: versao.status !== 'rascunho',
      quantidadeFinalKg: versao.quantidadeFinalKg ? Number(versao.quantidadeFinalKg) : null,
      pesoUnitario: versao.pesoUnitario ? Number(versao.pesoUnitario) : null,
      precoVenda: versao.precoVenda ? Number(versao.precoVenda) : null,
      criadoPor: versao.criadoPor,
      congeladoEm: versao.congeladoEm?.toISOString() ?? null,
      etapas,
      aprovacoes: versao.aprovacoes.map((a) => ({
        area: a.area as 'pd' | 'qualidade' | 'fabrica' | 'producao',
        ordem: a.ordem,
        status: a.status as 'pendente' | 'aprovado' | 'reprovado',
        decididoPor: a.decididoPor,
        decididoEm: a.decididoEm?.toISOString() ?? null,
        comentario: a.comentario,
      })),
      calculo,
      calculoCongelado: congelado,
    }
  }
}
