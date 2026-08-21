import type { PublicUser, SessionUser } from '../users/types'

/** Nome do cookie httpOnly da sessao. Usado pelo BFF e pelo middleware do Next. */
export const SESSION_COOKIE = 'tp_session'

/**
 * Codigo legivel por maquina em respostas de erro, para o front reagir sem
 * depender do texto da mensagem.
 */
export const ERROR_CODES = {
  /** Sessao valida, mas travada ate a troca de senha obrigatoria. */
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  /** Conta bloqueada temporariamente por excesso de tentativas erradas. */
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  /** Senha provisoria passou do prazo: precisa de nova liberacao do admin. */
  PROVISIONAL_PASSWORD_EXPIRED: 'PROVISIONAL_PASSWORD_EXPIRED',
  /** Falta URL, usuario ou senha da conexao com o Protheus. */
  PROTHEUS_NOT_CONFIGURED: 'PROTHEUS_NOT_CONFIGURED',
  /** Protheus recusou a credencial da conta de servico. */
  PROTHEUS_AUTH_FAILED: 'PROTHEUS_AUTH_FAILED',
  /** Protheus inalcancavel, fora do ar ou sem responder no timeout. */
  PROTHEUS_UNAVAILABLE: 'PROTHEUS_UNAVAILABLE',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export interface SessionResponse {
  user: SessionUser
}

export interface UserListResponse {
  data: PublicUser[]
  total: number
}

export interface ApiErrorBody {
  statusCode: number
  message: string
  code?: ErrorCode
  issues?: Array<{ path: (string | number)[]; message: string }>
}
