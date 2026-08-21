import { Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma, Product } from '@prisma/client'
import type { ProductListResponse, PublicProduct } from '@trigo/core'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Consulta do cadastro de produtos.
 *
 * Le o espelho `tp_products` — rapido, e sem ocupar thread do appserver a cada
 * pesquisa de usuario. SOMENTE LEITURA: o Protheus e o dono do cadastro, e a
 * unica coisa que grava aqui e a carga (ProductsSyncService).
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opcoes: {
    search?: string
    empori?: string
    page?: number
    pageSize?: number
  }): Promise<ProductListResponse> {
    const page = Math.max(1, Math.trunc(opcoes.page ?? 1))
    const pageSize = Math.max(1, Math.min(200, Math.trunc(opcoes.pageSize ?? 20)))
    const busca = opcoes.search?.trim()

    const where: Prisma.ProductWhereInput = {
      // Nao uso `mode: 'insensitive'`: o banco esta em collation CI, o SQL
      // Server ja compara sem diferenciar caixa, e o Prisma nao suporta esse
      // modificador no provider sqlserver.
      ...(busca
        ? { OR: [{ code: { contains: busca } }, { description: { contains: busca } }] }
        : {}),
      // String vazia e um EMPORI valido (o cadastro base), por isso comparo com
      // undefined em vez de usar valor-verdade.
      ...(opcoes.empori !== undefined ? { empori: opcoes.empori } : {}),
    }

    const [registros, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ empori: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ])

    return { data: registros.map(publicar), total }
  }

  async get(id: string): Promise<PublicProduct> {
    const produto = await this.prisma.product.findUnique({ where: { id } })
    if (!produto) throw new NotFoundException('Produto nao encontrado')
    return publicar(produto)
  }

}

/**
 * Converte a linha do banco no contrato da API.
 *
 * `Decimal` do Prisma nao sobrevive a JSON.stringify como numero — vira objeto.
 * Por isso a conversao explicita.
 */
function publicar(produto: Product): PublicProduct {
  return {
    id: produto.id,
    empori: produto.empori,
    sourceTable: produto.sourceTable,
    code: produto.code,
    description: produto.description,
    type: produto.type,
    unit: produto.unit,
    group: produto.group,
    defaultWarehouse: produto.defaultWarehouse,
    ncm: produto.ncm,
    fiscalModel: produto.fiscalModel,
    isBlocked: produto.isBlocked,
    isActive: produto.isActive,
    costCenter: produto.costCenter,
    expenseAccount: produto.expenseAccount,
    assetAccount: produto.assetAccount,
    revenueAccount: produto.revenueAccount,
    salePrice: produto.salePrice === null ? null : Number(produto.salePrice),
    syncedAt: produto.syncedAt.toISOString(),
  }
}
