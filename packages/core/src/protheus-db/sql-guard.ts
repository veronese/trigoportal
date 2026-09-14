/**
 * Trava de somente-leitura do console de consulta.
 *
 * POR QUE EXISTE, se o login ja deveria ser somente leitura: porque "deveria".
 * O login e configurado por uma pessoa, numa tela, e o dia em que alguem
 * apontar o portal para uma credencial com escrita, esta funcao e o que separa
 * um erro de digitacao de um UPDATE sem WHERE no banco do ERP.
 *
 * NAO E UM PARSER DE SQL. E uma lista branca deliberadamente estreita: o que
 * nao for reconhecido como consulta simples e recusado. Recusar uma consulta
 * legitima custa um aviso; deixar passar uma escrita custa o ERP.
 */

export interface AnaliseSql {
  permitido: boolean
  /** Por que foi recusada, em linguagem de quem escreveu a consulta. */
  motivo: string | null
  /** O comando identificado no inicio. Util para a mensagem. */
  comando: string | null
}

/**
 * Comandos que escrevem, alteram estrutura ou executam codigo.
 *
 * `INTO` esta aqui porque `SELECT ... INTO nova_tabela` CRIA tabela — parece
 * consulta e nao e. `EXEC` porque uma procedure faz o que quiser por dentro,
 * e nenhuma inspecao do texto alcanca isso.
 */
const PROIBIDOS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'TRUNCATE',
  'DROP',
  'ALTER',
  'CREATE',
  'RENAME',
  'GRANT',
  'REVOKE',
  'DENY',
  'BACKUP',
  'RESTORE',
  'SHUTDOWN',
  'RECONFIGURE',
  'EXEC',
  'EXECUTE',
  'INTO',
  'BULK',
  'OPENROWSET',
  'OPENDATASOURCE',
  'OPENQUERY',
  'WAITFOR',
  'DBCC',
] as const

/** Explicacao especifica onde a generica confundiria. */
const EXPLICACAO: Record<string, string> = {
  INTO: 'SELECT ... INTO cria uma tabela nova. Para materializar resultado, exporte o CSV.',
  EXEC: 'Executar procedure nao e consulta: o que ela faz por dentro nao da para conferir aqui.',
  EXECUTE: 'Executar procedure nao e consulta: o que ela faz por dentro nao da para conferir aqui.',
  WAITFOR: 'WAITFOR prende a conexao com o banco do ERP pelo tempo que mandar.',
  DBCC: 'Comandos DBCC agem sobre o banco inteiro, nao sobre uma consulta.',
}

/**
 * Remove o que nao e codigo: comentarios, textos entre aspas e identificadores
 * entre colchetes.
 *
 * Sem isso, uma consulta legitima com `WHERE B1_DESC LIKE '%DELETE%'` seria
 * recusada, e `-- drop table` num comentario tambem. O texto limpo serve APENAS
 * para a analise; o que vai para o banco continua sendo o original.
 */
function limpar(sql: string): string {
  let saida = ''
  let i = 0

  while (i < sql.length) {
    const atual = sql[i]
    const proximo = sql[i + 1]

    // Comentario de linha
    if (atual === '-' && proximo === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      saida += ' '
      continue
    }

    // Comentario de bloco. Nao aninha em T-SQL padrao.
    if (atual === '/' && proximo === '*') {
      i += 2
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i += 2
      saida += ' '
      continue
    }

    // Texto entre aspas simples. '' e uma aspa escapada, nao o fim.
    if (atual === "'") {
      i++
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2
          continue
        }
        if (sql[i] === "'") {
          i++
          break
        }
        i++
      }
      saida += " '' "
      continue
    }

    // Identificador entre colchetes: [Tabela Com Espaco]
    if (atual === '[') {
      i++
      while (i < sql.length && sql[i] !== ']') i++
      i++
      saida += ' ident '
      continue
    }

    saida += atual
    i++
  }

  return saida
}

/** Um `;` que ainda tem comando depois dele: duas instrucoes em uma chamada. */
function temVariosComandos(limpo: string): boolean {
  const partes = limpo.split(';').map((p) => p.trim())
  return partes.filter((p) => p.length > 0).length > 1
}

/**
 * Decide se a consulta pode ser executada.
 *
 * Aceita apenas o que comeca com SELECT ou WITH (CTE). Qualquer outra coisa —
 * inclusive um SET aparentemente inofensivo — e recusada, porque a lista do que
 * e inofensivo nunca fica completa.
 */
export function analisarSqlLeitura(sql: string): AnaliseSql {
  const original = (sql ?? '').trim()

  if (original === '') {
    return { permitido: false, motivo: 'Escreva uma consulta.', comando: null }
  }

  const limpo = limpar(original).trim()

  if (limpo === '') {
    return {
      permitido: false,
      motivo: 'A consulta tem apenas comentarios.',
      comando: null,
    }
  }

  if (temVariosComandos(limpo)) {
    return {
      permitido: false,
      motivo:
        'Execute um comando por vez. Varios comandos separados por ponto e virgula sao recusados, ' +
        'porque o segundo pode fazer algo diferente do primeiro.',
      comando: null,
    }
  }

  const primeiro = /^\s*\(*\s*([A-Za-z_]+)/.exec(limpo)
  const comando = primeiro ? primeiro[1]!.toUpperCase() : null

  if (comando !== 'SELECT' && comando !== 'WITH') {
    return {
      permitido: false,
      motivo:
        `Este console executa apenas consulta. ${comando ? `Recebi ${comando}.` : ''} ` +
        'Comece com SELECT ou WITH.',
      comando,
    }
  }

  for (const proibido of PROIBIDOS) {
    // \b em JavaScript trata _ como caractere de palavra, entao D_E_L_E_T_ e
    // A1_DELETE nao casam com \bDELETE\b — que e exatamente o que se quer num
    // banco Protheus.
    const regex = new RegExp(`\\b${proibido}\\b`, 'i')
    if (regex.test(limpo)) {
      return {
        permitido: false,
        motivo:
          EXPLICACAO[proibido] ??
          `A consulta contem ${proibido}, que altera dados ou estrutura. Este console so le.`,
        comando,
      }
    }
  }

  return { permitido: true, motivo: null, comando }
}
