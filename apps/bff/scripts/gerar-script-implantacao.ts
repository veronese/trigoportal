/**
 * Gera `deploy/criar-banco.sql`: o script que cria o banco do zero em outra
 * instancia (homologacao, producao, outro cliente).
 *
 * POR QUE GERAR, e nao manter o SQL a mao: script escrito a mao envelhece em
 * silencio. Aqui o DDL sai do proprio schema.prisma via `prisma migrate diff`,
 * mais os objetos de prisma/sql/ e os parametros do catalogo. Mudou o schema,
 * roda de novo e o arquivo acompanha.
 *
 * `db:verificar-script` compara o arquivo versionado com o que seria gerado
 * agora e falha se houver divergencia — e o que impede o script de ficar velho.
 *
 *   pnpm --filter @trigo/bff db:gerar-script
 *   pnpm --filter @trigo/bff db:verificar-script
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { PARAMETER_CATALOG } from '../src/parameters/parameter-catalog'

const RAIZ = path.join(__dirname, '..')
const SCHEMA = path.join(RAIZ, 'prisma', 'schema.prisma')
const PASTA_SQL = path.join(RAIZ, 'prisma', 'sql')
const DESTINO = path.join(RAIZ, 'deploy', 'criar-banco.sql')
const VERIFICAR = process.argv.includes('--verificar')

/** Escapa apostrofo para literal T-SQL. */
const lit = (valor: string | null): string =>
  valor === null ? 'NULL' : `N'${valor.replace(/'/g, "''")}'`

/**
 * DDL das tabelas a partir do schema. `--from-empty` nao precisa de conexao:
 * o Prisma compara "banco vazio" com o datamodel e imprime o SQL.
 */
function ddlDoSchema(): string {
  // Chama o CLI do Prisma pelo proprio node, em vez de `npx`. Dois motivos:
  // o Node 24 no Windows recusa spawn de .cmd (EINVAL, CVE-2024-27980), e
  // `shell: true` resolveria mas emite DeprecationWarning DEP0190 por nao
  // escapar argumento. Resolver o modulo dispensa shell.
  const cli = require.resolve('prisma/build/index.js')
  const saida = execFileSync(
    process.execPath,
    [cli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', SCHEMA, '--script'],
    { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return saida.trim()
}

/** Objetos que o Prisma nao declara — hoje o indice filtrado. */
function objetosManuais(): string {
  if (!existsSync(PASTA_SQL)) return ''
  return readdirSync(PASTA_SQL)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((n) => `-- ${n}\n${readFileSync(path.join(PASTA_SQL, n), 'utf8').trim()}`)
    .join('\n\nGO\n\n')
}

/**
 * Catalogo de parametros. `current_value` fica NULL de proposito: instancia nova
 * comeca no padrao de fabrica, e quem configurar preenche pela tela.
 */
function parametros(): string {
  const linhas = PARAMETER_CATALOG.map((p) => {
    const campos = [
      lit(p.key),
      lit(p.label),
      lit(p.description),
      lit(p.group),
      lit(p.type),
      'NULL',
      lit(p.defaultValue),
      p.isSecret ? '1' : '0',
      'NULL',
      'SYSUTCDATETIME()',
      'SYSUTCDATETIME()',
    ]
    return `  (${campos.join(', ')})`
  })

  return `-- ${PARAMETER_CATALOG.length} parametros do Configurador, no padrao de fabrica.
-- Idempotente: so insere o que ainda nao existe.
MERGE [dbo].[tp_parameters] AS destino
USING (VALUES
${linhas.join(',\n')}
) AS origem ([key], [label], [description], [group_name], [value_type], [current_value], [default_value], [is_secret], [updated_by], [updated_at], [created_at])
  ON destino.[key] = origem.[key]
WHEN NOT MATCHED THEN
  INSERT ([key], [label], [description], [group_name], [value_type], [current_value], [default_value], [is_secret], [updated_by], [updated_at], [created_at])
  VALUES (origem.[key], origem.[label], origem.[description], origem.[group_name], origem.[value_type], origem.[current_value], origem.[default_value], origem.[is_secret], origem.[updated_by], origem.[updated_at], origem.[created_at]);`
}

function montar(): string {
  const corpo = [
    '-- ' + '='.repeat(76),
    '-- Portal Trigo — criacao do banco de dados (SQL Server 2017+ / Azure SQL)',
    '-- ' + '='.repeat(76),
    '--',
    '-- ARQUIVO GERADO. Nao edite a mao: rode `pnpm --filter @trigo/bff db:gerar-script`',
    '-- sempre que o schema mudar. `db:verificar-script` falha se este arquivo estiver',
    '-- desatualizado em relacao ao prisma/schema.prisma.',
    '--',
    '-- COMO USAR numa instancia nova:',
    '--   1. Crie o database vazio. Este script NAO cria o database: no Azure',
    '--      isso e operacao de infraestrutura (tier e custo), e em instancia',
    '--      local a escolha de collation e arquivo e do DBA.',
    '--',
    '--      SQL Server local — a COLLATION IMPORTA:',
    '--        CREATE DATABASE [trigo_portal_db]',
    "--          COLLATE SQL_Latin1_General_CP1_CI_AS;",
    '--',
    '--      Tem que ser CI (case insensitive). A busca de usuario e de produto',
    '--      conta com isso: o Prisma nao suporta `mode: insensitive` no provider',
    '--      sqlserver, entao quem ignora a caixa e o banco. Em collation CS a',
    '--      busca passa a diferenciar maiuscula de minuscula, sem erro nenhum —',
    '--      so resultado faltando.',
    '--   2. Execute este arquivo conectado a esse database.',
    '--   3. Configure DATABASE_URL no .env do BFF.',
    '--   4. Rode `pnpm --filter @trigo/bff db:seed` para criar o administrador',
    '--      inicial (senha vem de SEED_ADMIN_PASSWORD). O hash NAO vem neste',
    '--      script de proposito: senha nao entra em arquivo versionado.',
    '--   5. Defina PARAMETER_ENCRYPTION_KEY no .env, ou os parametros do tipo',
    '--      SECRET e CREDENTIAL nao poderao ser gravados.',
    '--',
    '-- Idempotente: pode rodar novamente sem duplicar objeto nem parametro.',
    '-- ' + '='.repeat(76),
    '',
    'SET XACT_ABORT ON;',
    'SET NOCOUNT ON;',
    'GO',
    '',
    '-- ' + '-'.repeat(74),
    '-- 1. Tabelas, chaves e indices (gerado de prisma/schema.prisma)',
    '-- ' + '-'.repeat(74),
    '',
    'IF EXISTS (SELECT 1 FROM sys.tables WHERE name IN (N\'tp_users\', N\'tp_parameters\'))',
    'BEGIN',
    "  PRINT 'Tabelas do portal ja existem: etapa 1 ignorada.';",
    'END',
    'ELSE',
    'BEGIN',
    indentar(ddlDoSchema()),
    'END',
    'GO',
    '',
    '-- ' + '-'.repeat(74),
    '-- 2. Objetos que o Prisma nao declara (indice filtrado)',
    '-- ' + '-'.repeat(74),
    '',
    objetosManuais(),
    'GO',
    '',
    '-- ' + '-'.repeat(74),
    '-- 3. Parametros do Configurador',
    '-- ' + '-'.repeat(74),
    '',
    parametros(),
    'GO',
    '',
    "PRINT 'Portal Trigo: estrutura criada. Rode db:seed para o administrador inicial.';",
    'GO',
    '',
  ].join('\n')

  // Hash do conteudo, para o verificador detectar divergencia sem depender de
  // data de geracao (que mudaria a cada execucao e daria falso positivo).
  const hash = createHash('sha256').update(corpo).digest('hex').slice(0, 16)
  return corpo.replace(
    '-- Idempotente: pode rodar novamente sem duplicar objeto nem parametro.',
    `-- Idempotente: pode rodar novamente sem duplicar objeto nem parametro.\n-- Assinatura do conteudo: ${hash}`,
  )
}

/** O DDL do Prisma vem sem indentacao; dentro do BEGIN/END fica mais legivel. */
function indentar(sql: string): string {
  return sql
    .split('\n')
    .map((linha) => (linha.trim() === '' ? '' : `  ${linha}`))
    .join('\n')
}

function main(): void {
  const conteudo = montar()

  if (VERIFICAR) {
    if (!existsSync(DESTINO)) {
      console.error('[script] deploy/criar-banco.sql nao existe. Rode db:gerar-script.')
      process.exitCode = 1
      return
    }
    const atual = readFileSync(DESTINO, 'utf8')
    if (atual.trim() === conteudo.trim()) {
      console.log('[script] deploy/criar-banco.sql esta atualizado.')
      return
    }
    console.error('[script] DESATUALIZADO: o schema mudou e o script nao foi regerado.')
    console.error('[script] Rode: pnpm --filter @trigo/bff db:gerar-script')
    process.exitCode = 1
    return
  }

  mkdirSync(path.dirname(DESTINO), { recursive: true })
  writeFileSync(DESTINO, conteudo, 'utf8')
  console.log(`[script] Gerado: deploy/criar-banco.sql (${conteudo.split('\n').length} linhas)`)
  console.log(`[script] ${PARAMETER_CATALOG.length} parametros incluidos.`)
}

main()
