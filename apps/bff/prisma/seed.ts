import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/common/password'
import { PARAMETER_CATALOG } from '../src/parameters/parameter-catalog'
import { SecretCipher } from '../src/common/secret-cipher'
import { seedFichaReferencia } from './seed-fichas'

const prisma = new PrismaClient()

async function seedAdmin(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@grupotrigo.com.br').toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Trigo@2026Portal'

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`[seed] Admin ${email} ja existe. Nada a fazer.`)
    return
  }

  await prisma.user.create({
    data: {
      name: 'Administrador',
      email,
      role: 'ADMIN',
      provider: 'local',
      passwordHash: await hashPassword(password),
      // A senha do seed vem do .env e nao deve sobreviver ao primeiro acesso.
      mustChangePassword: true,
      provisionalPasswordAt: new Date(),
    },
  })

  console.log(`[seed] Admin criado: ${email}`)
  console.log('[seed] A senha de SEED_ADMIN_PASSWORD e provisoria: o portal vai')
  console.log('[seed] exigir a troca no primeiro acesso.')
}

/**
 * Sincroniza a tabela Parameter com o catalogo do Configurador.
 * Cria o que falta e atualiza rotulo/descricao/tipo, mas NUNCA sobrescreve
 * valor customizado — rodar o seed de novo e seguro em ambiente com dado real.
 */
async function seedParameters(): Promise<void> {
  let criados = 0
  let atualizados = 0

  for (const definition of PARAMETER_CATALOG) {
    const metadata = {
      label: definition.label,
      description: definition.description,
      group: definition.group,
      type: definition.type,
      defaultValue: definition.defaultValue,
      isSecret: definition.isSecret ?? false,
    }

    const existing = await prisma.parameter.findUnique({ where: { key: definition.key } })
    if (existing) {
      await prisma.parameter.update({ where: { key: definition.key }, data: metadata })
      atualizados++
    } else {
      await prisma.parameter.create({ data: { key: definition.key, value: null, ...metadata } })
      criados++
    }
  }

  await migrarCredencialProtheus()

  // Remove parametro que saiu do catalogo: o catalogo e a fonte de verdade, e
  // linha orfa apareceria na tela do Configurador sem ninguem consumindo.
  const chavesValidas = PARAMETER_CATALOG.map((definition) => definition.key)
  const removidos = await prisma.parameter.deleteMany({
    where: { key: { notIn: chavesValidas } },
  })

  console.log(
    `[seed] Parametros: ${criados} criado(s), ${atualizados} atualizado(s)` +
      (removidos.count > 0 ? `, ${removidos.count} removido(s) por sair do catalogo` : ''),
  )
}

/**
 * Migracao: PROTHEUS_USUARIO + PROTHEUS_SENHA viraram um unico parametro
 * PROTHEUS_CREDENCIAL do tipo CREDENTIAL. Junta o que ja estava configurado
 * antes do prune apagar as linhas antigas — ninguem precisa redigitar a senha.
 *
 * Idempotente: se PROTHEUS_CREDENCIAL ja tem valor, nao mexe.
 */
async function migrarCredencialProtheus(): Promise<void> {
  const destino = await prisma.parameter.findUnique({ where: { key: 'PROTHEUS_CREDENCIAL' } })
  if (!destino || destino.value) return

  const [usuarioAntigo, senhaAntiga] = await Promise.all([
    prisma.parameter.findUnique({ where: { key: 'PROTHEUS_USUARIO' } }),
    prisma.parameter.findUnique({ where: { key: 'PROTHEUS_SENHA' } }),
  ])
  if (!usuarioAntigo?.value || !senhaAntiga?.value) return

  const cipher = SecretCipher.fromEnv(process.env.PARAMETER_ENCRYPTION_KEY)
  if (!cipher.isEnabled) {
    console.log('[seed] PARAMETER_ENCRYPTION_KEY ausente: credencial do Protheus NAO migrada.')
    return
  }

  try {
    const usuario = usuarioAntigo.value
    const senha = cipher.decrypt(senhaAntiga.value)
    await prisma.parameter.update({
      where: { key: 'PROTHEUS_CREDENCIAL' },
      data: {
        value: cipher.encrypt(JSON.stringify({ usuario, senha })),
        updatedBy: usuarioAntigo.updatedBy ?? senhaAntiga.updatedBy,
      },
    })
    console.log(`[seed] Credencial do Protheus migrada (usuario: ${usuario})`)
  } catch (error) {
    console.log(
      `[seed] Nao foi possivel migrar a credencial do Protheus: ${error instanceof Error ? error.message : String(error)}`,
    )
    console.log('[seed] Reconfigure usuario e senha em Configurador > Parametros.')
  }
}

async function main(): Promise<void> {
  await seedAdmin()
  await seedParameters()
  await seedFichaReferencia(prisma)
}

main()
  .catch((error) => {
    console.error('[seed] Falhou:', error)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
