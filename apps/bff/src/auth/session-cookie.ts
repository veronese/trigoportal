import type { CookieOptions } from 'express'
import { SESSION_COOKIE } from '@trigo/core'

export { SESSION_COOKIE }

/**
 * O jsonwebtoken nao aceita `string` solto em expiresIn: o tipo e um template
 * literal (`${number}${unidade}`). Como o valor vem do .env, validamos o
 * formato aqui e este e o UNICO ponto que faz a conversao de tipo.
 */
export type JwtDuration = `${number}s` | `${number}m` | `${number}h` | `${number}d`

const DEFAULT_DURATION: JwtDuration = '8h'

export function parseDuration(value: string | undefined): JwtDuration {
  const candidate = value?.trim()
  if (candidate && /^\d+[smhd]$/.test(candidate)) return candidate as JwtDuration
  return DEFAULT_DURATION
}

/** Converte '8h', '30m', '7d' em segundos. */
export function durationToSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim())
  if (!match) return 8 * 60 * 60
  const amount = Number(match[1])
  const unit = match[2] as 's' | 'm' | 'h' | 'd'
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit]
  return amount * multiplier
}

export function sessionCookieOptions(maxAgeSeconds: number): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    // 'lax' funciona porque o Next faz proxy do BFF na mesma origem.
    // Se um dia o app consumir o BFF em outro dominio, use token Bearer (ja suportado).
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  }
}
