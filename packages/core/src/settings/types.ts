/**
 * Modulo Configurador: parametrizacao sistemica.
 *
 * Ideia equivalente a SX6 do Protheus — um registro por parametro, com chave,
 * tipo, valor e grupo. A diferenca de escopo em relacao ao .env:
 *
 *   .env         -> o que o processo precisa para SUBIR (banco, segredo do JWT,
 *                   porta). Muda com deploy.
 *   Configurador -> o que muda o COMPORTAMENTO em runtime (duracao de sessao,
 *                   URL do Protheus, filial padrao). Muda sem deploy.
 */
export const PARAMETER_TYPES = ['STRING', 'NUMBER', 'BOOLEAN', 'SECRET', 'CREDENTIAL'] as const
export type ParameterType = (typeof PARAMETER_TYPES)[number]

export const PARAMETER_TYPE_LABELS: Record<ParameterType, string> = {
  STRING: 'Texto',
  NUMBER: 'Numero',
  BOOLEAN: 'Sim/Nao',
  SECRET: 'Secreto',
  CREDENTIAL: 'Usuario e senha',
}

/** Grupos exibidos como abas/secoes na tela do Configurador. */
export const PARAMETER_GROUPS = ['Geral', 'Seguranca', 'Banco de dados', 'Protheus'] as const
export type ParameterGroup = (typeof PARAMETER_GROUPS)[number]

export interface PublicParameter {
  key: string
  label: string
  description: string | null
  group: string
  type: ParameterType
  /** null quando o parametro e do tipo SECRET: o valor nunca sai do servidor. */
  value: string | null
  defaultValue: string | null
  /** Para SECRET e CREDENTIAL, indica se ja existe algo gravado. */
  hasValue: boolean
  /**
   * Somente para CREDENTIAL: o usuario, que nao e segredo e ajuda o admin a
   * saber qual conta esta configurada. A senha nunca trafega.
   */
  credentialUser: string | null
  /** true quando o valor atual e diferente do padrao de fabrica. */
  isCustomized: boolean
  updatedAt: string
  updatedBy: string | null
}

export interface ParameterGroupView {
  group: string
  parameters: PublicParameter[]
}

export interface ParameterListResponse {
  groups: ParameterGroupView[]
  total: number
}

/** Parametros liberados sem autenticacao (marca do portal na tela de login). */
export interface PublicBranding {
  portalName: string
  loginMessage: string
  supportEmail: string | null
}
