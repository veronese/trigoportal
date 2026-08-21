import path from 'node:path'
import { defineConfig } from 'prisma/config'

/**
 * Configuracao do Prisma CLI.
 *
 * POR QUE ESTE ARQUIVO EXISTE: substitui a chave `prisma` do package.json, que
 * a versao 7 REMOVE. Enquanto ela existia, todo comando prisma imprimia aviso
 * de depreciacao, e a atualizacao para a 7 ficava bloqueada pelo planejador de
 * atualizacao do portal.
 *
 * `schema` aponta para o schema de SQL SERVER de proposito: e a producao, e a
 * fonte de verdade da qual o schema SQLite e gerado. Comando que precisa do
 * banco local passa `--schema prisma/schema.sqlite.prisma`, que sobrepoe isto —
 * e por isso que `pnpm db:local` e `pnpm db:sqlite` continuam funcionando.
 *
 * ATENCAO AO .env: com prisma.config.ts presente, o CLI PARA de carregar o .env
 * sozinho. Ele mesmo avisa, em toda execucao:
 *
 *   "Prisma config detected, skipping environment variable loading."
 *
 * Sem o carregamento explicito abaixo, DATABASE_URL chega vazia e todo comando
 * de banco falha — inclusive o seed. Nao e detalhe de versao: e o
 * comportamento, e a razao pela qual este arquivo le o .env a mao.
 */
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

/**
 * Le o .env para dentro de process.env, sem sobrescrever o que ja veio do
 * ambiente — em CI e no servidor as variaveis chegam por fora, e elas mandam.
 *
 * Feito a mao em vez de instalar `dotenv`: sao 10 linhas, e uma dependencia a
 * mais no caminho de build de banco e uma dependencia a mais para auditar.
 */
function carregarEnv(arquivo: string): void {
  if (!existsSync(arquivo)) return

  for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
    const texto = linha.trim()
    if (texto === '' || texto.startsWith('#')) continue

    const separador = texto.indexOf('=')
    if (separador === -1) continue

    const chave = texto.slice(0, separador).trim()
    if (process.env[chave] !== undefined) continue

    // Valor pode vir entre aspas simples ou duplas.
    const bruto = texto.slice(separador + 1).trim()
    process.env[chave] =
      (bruto.startsWith('"') && bruto.endsWith('"')) ||
      (bruto.startsWith("'") && bruto.endsWith("'"))
        ? bruto.slice(1, -1)
        : bruto
  }
}

carregarEnv(path.join(__dirname, '.env'))

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    // Antes era package.json#prisma.seed. Mesmo comando, lugar novo.
    seed: 'tsx prisma/seed.ts',
  },
})
