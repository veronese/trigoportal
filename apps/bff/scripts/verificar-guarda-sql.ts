/**
 * Regressao da trava de somente-leitura do console de consulta.
 *
 * POR QUE EXISTE: esta funcao e a unica coisa entre um erro de digitacao no
 * console e um UPDATE sem WHERE no banco de producao do ERP. Um afrouxamento
 * nela nao quebra tela nem falha build — passa despercebido ate o dia em que
 * alguem colar o comando errado.
 *
 * OS CASOS LIMITE SAO O PONTO: num banco Protheus, `D_E_L_E_T_` esta em toda
 * consulta e `A1_DELETE` pode ser nome de campo. Uma trava que recuse esses
 * dois e inutil na pratica e sera desligada por quem precisa trabalhar.
 *
 *   pnpm --filter @trigo/bff verificar-guarda-sql
 */
import process from 'node:process'
import { analisarSqlLeitura } from '@trigo/core'

interface Caso {
  sql: string
  permitido: boolean
  porque: string
}

const CASOS: Caso[] = [
  // ------------------------------------------------------------- deve passar
  { sql: 'SELECT * FROM SB1020', permitido: true, porque: 'consulta simples' },
  { sql: '  select top 10 B1_COD from SB1090', permitido: true, porque: 'minusculas e espacos' },
  { sql: 'WITH x AS (SELECT 1 AS a) SELECT * FROM x', permitido: true, porque: 'CTE' },
  {
    sql: "SELECT * FROM SB1020 WHERE D_E_L_E_T_ = ' '",
    permitido: true,
    porque: 'D_E_L_E_T_ esta em toda consulta Protheus',
  },
  {
    sql: 'SELECT A1_DELETE FROM SA1010',
    permitido: true,
    porque: 'DELETE dentro de nome de campo nao e comando',
  },
  {
    sql: "SELECT * FROM SB1020 WHERE B1_DESC LIKE '%DELETE%'",
    permitido: true,
    porque: 'palavra proibida dentro de texto entre aspas',
  },
  {
    sql: '-- drop table SB1020\nSELECT 1',
    permitido: true,
    porque: 'palavra proibida dentro de comentario de linha',
  },
  { sql: 'SELECT 1 /* update */', permitido: true, porque: 'comentario de bloco' },

  // ------------------------------------------------------------ deve recusar
  { sql: 'DELETE FROM SB1020', permitido: false, porque: 'exclusao' },
  { sql: "UPDATE SB1020 SET B1_DESC = 'x'", permitido: false, porque: 'alteracao' },
  { sql: 'INSERT INTO SB1020 VALUES (1)', permitido: false, porque: 'inclusao' },
  { sql: 'DROP TABLE SB1020', permitido: false, porque: 'estrutura' },
  { sql: 'TRUNCATE TABLE SB1020', permitido: false, porque: 'estrutura' },
  { sql: 'ALTER TABLE SB1020 ADD X INT', permitido: false, porque: 'estrutura' },
  {
    sql: 'SELECT * INTO nova FROM SB1020',
    permitido: false,
    porque: 'SELECT INTO cria tabela: parece consulta e nao e',
  },
  { sql: 'EXEC sp_who', permitido: false, porque: 'procedure faz o que quiser por dentro' },
  {
    sql: 'SELECT 1; DROP TABLE SB1020',
    permitido: false,
    porque: 'segundo comando escondido depois do ponto e virgula',
  },
  { sql: 'SELECT 1; SELECT 2', permitido: false, porque: 'um comando por vez, mesmo sendo dois SELECT' },
  { sql: 'SET ROWCOUNT 10', permitido: false, porque: 'nao comeca com SELECT nem WITH' },
  { sql: "WAITFOR DELAY '00:10:00'", permitido: false, porque: 'prende a conexao com o ERP' },
  { sql: 'DBCC CHECKDB', permitido: false, porque: 'age sobre o banco inteiro' },
  { sql: '', permitido: false, porque: 'vazio' },
  { sql: '-- so comentario', permitido: false, porque: 'so comentario' },
]

let falhas = 0
console.log('')
console.log('  Trava de somente-leitura do console de consulta')
console.log('')

for (const caso of CASOS) {
  const resultado = analisarSqlLeitura(caso.sql)
  const ok = resultado.permitido === caso.permitido
  if (!ok) falhas++

  const rotulo = caso.sql.replace(/\n/g, ' \n ').slice(0, 44).padEnd(46)
  const esperado = caso.permitido ? 'permite' : 'recusa '
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${esperado} ${rotulo} ${caso.porque}`)
}

console.log('')
if (falhas > 0) {
  console.log(`  ${falhas} caso(s) divergiram. A trava mudou de comportamento.`)
  process.exitCode = 1
} else {
  console.log(`  ${CASOS.length} casos conferem: so consulta passa.`)
}
