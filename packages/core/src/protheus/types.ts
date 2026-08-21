/** Diagnostico da conexao com o Protheus, para a tela do Configurador. */
export interface ProtheusStatus {
  /** Falta URL, usuario ou senha. */
  configurado: boolean
  baseUrl: string
  usuario: string
  timeoutSegundos: number
  senhaConfigurada: boolean
}

export interface ProtheusTestResult {
  ok: boolean
  /** Mensagem pronta para exibir, com o motivo da falha quando houver. */
  detalhe: string
  /** Validade do token obtido, quando o teste passou. */
  tokenValidoPorSegundos: number | null
  duracaoMs: number
}
