/**
 * Gera `prisma/schema.sqlite.prisma` a partir do schema de SQL Server.
 *
 * POR QUE GERAR, e nao manter dois schemas a mao: modelo escrito duas vezes
 * diverge. A producao e SQL Server, e esse schema e a fonte de verdade; o de
 * SQLite existe apenas para rodar o portal na maquina do desenvolvedor sem
 * depender de nenhum servidor de banco.
 *
 * O que a transformacao faz:
 *  - troca o provider para `sqlite`;
 *  - remove todo `@db.<Tipo>`: sao tipos nativos de SQL Server, e o SQLite nao
 *    tem tipagem de coluna equivalente (ele usa affinity). Sem remover, o
 *    Prisma recusa o schema;
 *  - remove `map:` de @id/@unique/@@unique/@@index: nome de constraint e
 *    conceito de SQL Server. No SQLite o Prisma nomeia sozinho.
 *
 * O que NAO muda: nome de tabela e de coluna (@@map/@map). Isso importa —
 * significa que a convencao tp_/snake_case vale nos dois bancos, e que uma
 * consulta crua escrita para um funciona no outro.
 *
 *   pnpm --filter @trigo/bff db:sqlite:gerar
 *   pnpm --filter @trigo/bff db:sqlite:verificar
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const RAIZ = path.join(__dirname, '..')
const ORIGEM = path.join(RAIZ, 'prisma', 'schema.prisma')
const DESTINO = path.join(RAIZ, 'prisma', 'schema.sqlite.prisma')
const VERIFICAR = process.argv.includes('--verificar')

const AVISO = `// ============================================================================
// ARQUIVO GERADO — nao edite a mao.
//
// Origem: prisma/schema.prisma (SQL Server, que e a producao e a fonte de
// verdade). Regere com:
//
//   pnpm --filter @trigo/bff db:sqlite:gerar
//
// Serve apenas para desenvolvimento local em arquivo, sem servidor de banco.
// Diferencas em relacao ao original, todas mecanicas: provider sqlite, sem
// tipos nativos @db.* e sem nome de constraint (map:). Modelos, campos e nomes
// de tabela/coluna sao identicos.
//
// LIMITE CONHECIDO: o SQLite compara texto com case SENSITIVE por padrao. A
// busca por nome/e-mail e por descricao de produto, que em SQL Server ignora
// caixa por causa da collation CI, aqui diferencia. E uma diferenca de
// comportamento entre dev e producao — nao um defeito do portal.
// ============================================================================

`

function transformar(original: string): string {
  let saida = original

  // 1. Provider. Trocado apenas no bloco datasource, nao no generator.
  saida = saida.replace(
    /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")sqlserver(")/s,
    '$1sqlite$2',
  )

  // 2. Variavel de ambiente propria. Usar a mesma DATABASE_URL obrigaria a
  //    editar o .env a cada troca de banco, e uma URL de SQL Server num schema
  //    sqlite (ou o contrario) falha na validacao. Com duas variaveis, as duas
  //    conexoes coexistem no .env e o que decide e o schema em uso.
  saida = saida.replace(
    /(datasource\s+db\s*\{[^}]*?url\s*=\s*env\(")DATABASE_URL("\))/s,
    '$1DATABASE_URL_SQLITE$2',
  )

  // 3. Tipos nativos: `@db.NVarChar(36)`, `@db.Decimal(18, 4)`, `@db.Bit`.
  saida = saida.replace(/\s*@db\.\w+(\([^)]*\))?/g, '')

  // 4. Nome de constraint/indice. `@id(map: "x")` fica `@id`; quando ha outros
  //    argumentos, so o `map:` sai.
  saida = saida.replace(/\(\s*map:\s*"[^"]*"\s*\)/g, '')
  saida = saida.replace(/,\s*map:\s*"[^"]*"/g, '')
  saida = saida.replace(/map:\s*"[^"]*"\s*,\s*/g, '')

  // 5. Espaco que sobrou de atributo removido no fim da linha.
  saida = saida
    .split('\n')
    .map((linha) => linha.replace(/[ \t]+$/, ''))
    .join('\n')

  return AVISO + saida
}

function main(): void {
  if (!existsSync(ORIGEM)) {
    console.error(`[sqlite] Nao achei ${ORIGEM}`)
    process.exitCode = 1
    return
  }

  const conteudo = transformar(readFileSync(ORIGEM, 'utf8'))

  if (VERIFICAR) {
    if (!existsSync(DESTINO)) {
      console.error('[sqlite] prisma/schema.sqlite.prisma nao existe. Rode db:sqlite:gerar.')
      process.exitCode = 1
      return
    }
    if (readFileSync(DESTINO, 'utf8').trim() === conteudo.trim()) {
      console.log('[sqlite] prisma/schema.sqlite.prisma esta atualizado.')
      return
    }
    console.error('[sqlite] DESATUALIZADO: schema.prisma mudou e o de SQLite nao foi regerado.')
    console.error('[sqlite] Rode: pnpm --filter @trigo/bff db:sqlite:gerar')
    process.exitCode = 1
    return
  }

  writeFileSync(DESTINO, conteudo, 'utf8')

  // Conta so linha de codigo: o cabecalho deste arquivo MENCIONA `@db.*` em
  // prosa, e contar o texto todo dava falso positivo.
  const restantes = conteudo
    .split('\n')
    .filter((linha) => !linha.trimStart().startsWith('//'))
    .join('\n')
    .split('@db.').length - 1
  console.log(`[sqlite] Gerado: prisma/schema.sqlite.prisma`)
  console.log(`[sqlite] Tipos nativos restantes: ${restantes} (esperado 0)`)
  if (restantes > 0) process.exitCode = 1
}

main()
