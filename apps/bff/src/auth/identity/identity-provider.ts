/**
 * Seam de autenticacao. Hoje existe apenas o provider local (senha no banco).
 * Na fase 2 basta criar ProtheusIdentityProvider / EntraIdIdentityProvider
 * implementando esta interface e registrar no array IDENTITY_PROVIDERS.
 * Nenhuma tela nem controller precisa mudar.
 */
export interface AuthenticatedIdentity {
  email: string
  name: string
  provider: string
  externalId?: string
}

export interface IdentityProvider {
  readonly name: string
  /** Retorna a identidade quando as credenciais conferem, ou null para delegar ao proximo provider. */
  authenticate(email: string, password: string): Promise<AuthenticatedIdentity | null>
}

export const IDENTITY_PROVIDERS = 'trigo:identity-providers'
