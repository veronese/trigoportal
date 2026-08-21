import type { Role } from '../auth/permissions'

/** Usuario como o front pode ver. Nunca inclua hash de senha aqui. */
export interface PublicUser {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
  provider: string
  /** Sessao dele so serve para trocar a senha ate que ele troque. */
  mustChangePassword: boolean
  /** Tentativas de login erradas desde o ultimo acesso bem-sucedido. */
  failedLoginAttempts: number
  /** Enquanto estiver no futuro, o login e recusado mesmo com a senha certa. */
  lockedUntil: string | null
  /**
   * Prazo da senha provisoria, ja calculado pelo servidor (que conhece o
   * parametro). null = nao ha senha provisoria pendente ou o prazo esta
   * desligado no Configurador.
   */
  provisionalPasswordExpiresAt: string | null
  lastLoginAt: string | null
  passwordChangedAt: string | null
  createdAt: string
}

/** Identidade da sessao corrente. */
export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  /**
   * Quando true, o BFF recusa qualquer rota que nao seja a troca de senha.
   * O front usa isso para levar direto a tela de troca.
   */
  mustChangePassword: boolean
}
