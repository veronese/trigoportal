/** Uma tabela do portal e quantos registros ela tem. */
export interface DatabaseTable {
  nome: string
  registros: number
}

/**
 * Diagnostico da conexao com o banco, em modo LEITURA.
 *
 * A conexao e definida em DATABASE_URL, no .env do servidor — nao pela tela.
 * A senha nunca aparece aqui, nem mascarada. `criptografado` reflete o
 * `encrypt=true` da string de conexao, obrigatorio no Azure SQL.
 */
export interface DatabaseStatus {
  provider: string
  servidor: string
  porta: number | null
  banco: string
  usuario: string
  criptografado: boolean
  conectado: boolean
  latenciaMs: number | null
  versaoServidor: string | null
  tabelas: DatabaseTable[]
  /** Primeira linha do erro quando a conexao falha. */
  detalheErro: string | null
}
