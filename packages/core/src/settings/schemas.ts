import { z } from 'zod'
import type { ParameterType } from './types'

export const updateParameterSchema = z.object({
  // Todo valor trafega e e gravado como string; a coercao acontece na leitura,
  // conforme o tipo declarado do parametro. Isso mantem uma tabela unica.
  value: z.string().max(1000, 'Valor muito longo (maximo 1000 caracteres)'),
})
export type UpdateParameterInput = z.infer<typeof updateParameterSchema>

/**
 * Parametro do tipo CREDENTIAL: usuario e senha gravados como um par unico.
 * Trafega por endpoint proprio, nao pelo campo `value` generico — assim a senha
 * nunca passa por um caminho que possa ser logado como texto comum.
 */
export const updateCredentialSchema = z.object({
  usuario: z.string().trim().min(1, 'Informe o usuario').max(200),
  senha: z.string().min(1, 'Informe a senha').max(500),
})
export type UpdateCredentialInput = z.infer<typeof updateCredentialSchema>

export const BOOLEAN_TRUE = 'true'
export const BOOLEAN_FALSE = 'false'

/**
 * Valida o valor conforme o tipo. Retorna a mensagem de erro ou null se ok.
 * Usada pelo BFF (antes de gravar) e pela tela (antes de enviar).
 */
export function validateParameterValue(type: ParameterType, value: string): string | null {
  const trimmed = value.trim()

  switch (type) {
    case 'NUMBER': {
      if (trimmed === '') return 'Informe um numero'
      if (!/^-?\d+([.,]\d+)?$/.test(trimmed)) return 'Informe apenas numeros'
      return null
    }
    case 'BOOLEAN': {
      if (trimmed !== BOOLEAN_TRUE && trimmed !== BOOLEAN_FALSE) {
        return 'Valor deve ser Sim ou Nao'
      }
      return null
    }
    case 'SECRET': {
      if (trimmed === '') return 'Informe um valor'
      return null
    }
    case 'CREDENTIAL':
      // Validado por updateCredentialSchema, em endpoint proprio.
      return 'Use o formulario de usuario e senha para este parametro'
    case 'STRING':
      return null
  }
}

export function parameterAsNumber(value: string | null, fallback: number): number {
  if (value === null) return fallback
  const parsed = Number(value.trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

export function parameterAsBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback
  return value.trim() === BOOLEAN_TRUE
}
