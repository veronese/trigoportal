/**
 * Aplica os arquivos de SQL manual na ordem do nome.
 *
 * Existe porque ha objetos que o schema.prisma nao sabe declarar — hoje o
 * indice filtrado/parcial de (provider, externalId). Todos os arquivos sao
 * idempotentes, entao rodar de novo e seguro.
 *
 * Duas pastas, porque a sintaxe difere entre os bancos:
 *   prisma/sql/         T-SQL, para SQL Server
 *   prisma/sql-sqlite/  SQLite, usado com --sqlite
 *
 *   pnpm --filter @trigo/bff db:sql
 *   pnpm --filter @trigo/bff db:sql -- --sqlite
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const SQLITE = process.argv.includes('--sqlite')
const pasta = path.join(__dirname, '..', 'prisma', SQLITE ? 'sql-sqlite' : 'sql')

async function main(): Promise<void> {
  const arquivos = readdirSync(pasta)
    .filter((nome) => nome.endsWith('.sql'))
    .sort()

  if (arquivos.length === 0) {
    console.log(`[sql] Nenhum arquivo em ${pasta}`)
    return
  }

  for (const arquivo of arquivos) {
    const conteudo = readFileSync(path.join(pasta, arquivo), 'utf8')
    await prisma.$executeRawUnsafe(conteudo)
    console.log(`[sql] aplicado: ${arquivo}`)
  }
}

main()
  .catch((erro) => {
    console.error('[sql] Falhou:', erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
