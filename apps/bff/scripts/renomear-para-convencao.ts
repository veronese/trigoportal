/**
 * Renomeia tabelas, colunas e constraints para a convencao tp_/snake_case.
 *
 * POR QUE ISSO EXISTE, e nao um `db push`: ao trocar @@map, o Prisma nao ve um
 * rename — ve uma tabela nova e outra que sobrou. O `db push` criaria tp_users
 * e DERRUBARIA User, levando os dados com ela. `sp_rename` altera no lugar,
 * preservando linhas, chaves e o indice filtrado.
 *
 * Idempotente: cada rename so acontece se o nome antigo ainda existir. Em banco
 * novo, criado ja com os nomes finais, o script e um no-op.
 *
 *   pnpm --filter @trigo/bff db:renomear
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface RenomeacaoTabela {
  de: string
  para: string
  colunas: Record<string, string>
  objetos: Record<string, string>
  /**
   * Indices FILTRADOS que precisam cair antes de renomear coluna.
   *
   * Erro 5074: "The index X is dependent on column Y". Indice comum sobrevive ao
   * rename da coluna; filtrado nao, porque o predicado (WHERE ... IS NOT NULL)
   * fica amarrado ao nome antigo. Sao recriados em seguida por
   * scripts/aplicar-sql.ts, a partir de prisma/sql/.
   */
  indicesFiltrados: string[]
}

/** `objetos` cobre PK e unique (constraints); `indices` cobre indices puros. */
const TABELAS: RenomeacaoTabela[] = [
  {
    de: 'User',
    para: 'tp_users',
    colunas: {
      passwordHash: 'password_hash',
      isActive: 'is_active',
      externalId: 'external_id',
      tokenVersion: 'token_version',
      mustChangePassword: 'must_change_password',
      passwordChangedAt: 'password_changed_at',
      provisionalPasswordAt: 'provisional_password_at',
      failedLoginAttempts: 'failed_login_attempts',
      lockedUntil: 'locked_until',
      lastLoginAt: 'last_login_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    objetos: {
      User_pkey: 'tp_users_pk',
      User_email_key: 'tp_users_email_uq',
      User_isActive_idx: 'tp_users_is_active_idx',
      User_provider_externalId_idx: 'tp_users_provider_external_id_idx',
    },
    // Aceita os dois nomes: em banco parcialmente migrado ele pode estar em
    // qualquer um dos dois.
    indicesFiltrados: ['User_provider_externalId_unico', 'tp_users_provider_external_id_uq'],
  },
  {
    de: 'Parameter',
    para: 'tp_parameters',
    colunas: {
      group: 'group_name',
      type: 'value_type',
      value: 'current_value',
      defaultValue: 'default_value',
      isSecret: 'is_secret',
      updatedBy: 'updated_by',
      updatedAt: 'updated_at',
      createdAt: 'created_at',
    },
    objetos: {
      Parameter_pkey: 'tp_parameters_pk',
      Parameter_group_idx: 'tp_parameters_group_name_idx',
    },
    indicesFiltrados: [],
  },
]

const existeTabela = async (nome: string): Promise<boolean> => {
  const r = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM sys.tables WHERE name = '${nome}'`,
  )
  return Number(r[0]?.n ?? 0) > 0
}

const existeColuna = async (tabela: string, coluna: string): Promise<boolean> => {
  const r = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM sys.columns
     WHERE object_id = OBJECT_ID('dbo.[${tabela}]') AND name = '${coluna}'`,
  )
  return Number(r[0]?.n ?? 0) > 0
}

/** Cobre indice e constraint: ambos aparecem por nome em sys.indexes/sys.objects. */
const existeObjeto = async (nome: string): Promise<boolean> => {
  const r = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT (
       (SELECT COUNT(*) FROM sys.indexes WHERE name = '${nome}') +
       (SELECT COUNT(*) FROM sys.objects WHERE name = '${nome}')
     ) AS n`,
  )
  return Number(r[0]?.n ?? 0) > 0
}

async function main(): Promise<void> {
  let alteracoes = 0

  for (const tabela of TABELAS) {
    // 1. Tabela primeiro: os renames seguintes usam o nome novo.
    if (await existeTabela(tabela.de)) {
      await prisma.$executeRawUnsafe(`EXEC sp_rename N'dbo.[${tabela.de}]', N'${tabela.para}'`)
      console.log(`[renomear] tabela  ${tabela.de} -> ${tabela.para}`)
      alteracoes++
    }

    if (!(await existeTabela(tabela.para))) {
      console.log(`[renomear] tabela ${tabela.para} nao existe; nada a fazer`)
      continue
    }

    // 2. Constraints e indices ANTES das colunas: os nomes de indice do Prisma
    //    embutem o nome antigo da coluna (User_isActive_idx).
    for (const [de, para] of Object.entries(tabela.objetos)) {
      if (!(await existeObjeto(de))) continue
      const alvo = de.includes('_idx') || de.includes('_key') || de.includes('_unico')
        ? `N'dbo.${tabela.para}.${de}', N'${para}', N'INDEX'`
        : `N'dbo.${de}', N'${para}', N'OBJECT'`
      await prisma.$executeRawUnsafe(`EXEC sp_rename ${alvo}`)
      console.log(`[renomear] objeto  ${de} -> ${para}`)
      alteracoes++
    }

    // 3. Indice filtrado cai aqui: bloquearia o rename das colunas (erro 5074).
    //    scripts/aplicar-sql.ts recria em seguida, ja com os nomes novos.
    for (const indice of tabela.indicesFiltrados) {
      if (!(await existeObjeto(indice))) continue
      await prisma.$executeRawUnsafe(`DROP INDEX [${indice}] ON [dbo].[${tabela.para}]`)
      console.log(`[renomear] indice filtrado derrubado: ${indice} (sera recriado por db:sql)`)
      alteracoes++
    }

    // 4. Colunas.
    for (const [de, para] of Object.entries(tabela.colunas)) {
      if (!(await existeColuna(tabela.para, de))) continue
      await prisma.$executeRawUnsafe(
        `EXEC sp_rename N'dbo.${tabela.para}.[${de}]', N'${para}', N'COLUMN'`,
      )
      console.log(`[renomear] coluna  ${tabela.para}.${de} -> ${para}`)
      alteracoes++
    }
  }

  console.log(
    alteracoes === 0
      ? '[renomear] Nada a renomear: o banco ja esta na convencao.'
      : `[renomear] ${alteracoes} alteracao(oes) aplicada(s).`,
  )
}

main()
  .catch((erro) => {
    console.error('[renomear] Falhou:', erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
