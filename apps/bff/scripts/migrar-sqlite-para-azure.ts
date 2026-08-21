/**
 * Copia os dados do SQLite antigo para o banco atual (Azure SQL).
 *
 * Le o arquivo .db com o `node:sqlite` nativo — nao com Prisma, porque o Prisma
 * aceita um provider por schema e o schema ja aponta para o SQL Server.
 *
 * Preserva o que seria perdido num seed limpo: sua conta (com o hash da senha,
 * que continua valendo) e os parametros customizados, incluindo a credencial do
 * Protheus. A chave de cifragem nao muda, entao o ciphertext segue decifravel.
 *
 * Idempotente: usa upsert por chave natural (email / key).
 *
 *   pnpm --filter @trigo/bff db:migrar-sqlite
 *   pnpm --filter @trigo/bff db:migrar-sqlite -- prisma/dev.db.backup-antes-azure
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const origem = path.resolve(
  process.argv[2] ?? path.join(__dirname, '..', 'prisma', 'dev.db.backup-antes-azure'),
)

/** SQLite guarda DateTime do Prisma como inteiro em ms e Boolean como 0/1. */
const data = (valor: unknown): Date | null =>
  valor === null || valor === undefined ? null : new Date(Number(valor))
const bool = (valor: unknown): boolean => Number(valor) === 1
const texto = (valor: unknown): string => String(valor ?? '')
const textoOuNulo = (valor: unknown): string | null =>
  valor === null || valor === undefined ? null : String(valor)

async function main(): Promise<void> {
  if (!existsSync(origem)) {
    console.error(`[migrar] Arquivo nao encontrado: ${origem}`)
    process.exitCode = 1
    return
  }

  const db = new DatabaseSync(origem, { readOnly: true })
  console.log(`[migrar] Origem: ${origem}`)

  // ----------------------------------------------------------------- usuarios
  const usuarios = db.prepare('SELECT * FROM User').all() as Record<string, unknown>[]
  let usuariosGravados = 0

  for (const linha of usuarios) {
    const dados = {
      name: texto(linha.name),
      email: texto(linha.email),
      passwordHash: textoOuNulo(linha.passwordHash),
      role: texto(linha.role) || 'USER',
      isActive: bool(linha.isActive),
      provider: texto(linha.provider) || 'local',
      externalId: textoOuNulo(linha.externalId),
      tokenVersion: Number(linha.tokenVersion ?? 0),
      mustChangePassword: bool(linha.mustChangePassword),
      passwordChangedAt: data(linha.passwordChangedAt),
      provisionalPasswordAt: data(linha.provisionalPasswordAt),
      failedLoginAttempts: Number(linha.failedLoginAttempts ?? 0),
      lockedUntil: data(linha.lockedUntil),
      lastLoginAt: data(linha.lastLoginAt),
    }

    await prisma.user.upsert({
      where: { email: dados.email },
      update: dados,
      // Mantem o id original: token JWT emitido antes carrega esse id no `sub`.
      create: { ...dados, id: texto(linha.id), createdAt: data(linha.createdAt) ?? new Date() },
    })
    usuariosGravados++
  }

  // -------------------------------------------------------------- parametros
  const parametros = db.prepare('SELECT * FROM Parameter').all() as Record<string, unknown>[]
  let parametrosGravados = 0
  let comValor = 0

  for (const linha of parametros) {
    const dados = {
      label: texto(linha.label),
      description: textoOuNulo(linha.description),
      group: texto(linha.group),
      type: texto(linha.type) || 'STRING',
      value: textoOuNulo(linha.value),
      defaultValue: textoOuNulo(linha.defaultValue),
      isSecret: bool(linha.isSecret),
      updatedBy: textoOuNulo(linha.updatedBy),
    }
    if (dados.value !== null) comValor++

    await prisma.parameter.upsert({
      where: { key: texto(linha.key) },
      update: dados,
      create: { ...dados, key: texto(linha.key), createdAt: data(linha.createdAt) ?? new Date() },
    })
    parametrosGravados++
  }

  db.close()

  console.log(`[migrar] Usuarios: ${usuariosGravados}`)
  console.log(`[migrar] Parametros: ${parametrosGravados} (${comValor} com valor customizado)`)
  console.log('[migrar] Concluido. Sua senha e a credencial do Protheus seguem valendo.')
}

main()
  .catch((erro) => {
    console.error('[migrar] Falhou:', erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
