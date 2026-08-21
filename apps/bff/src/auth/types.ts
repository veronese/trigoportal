import type { Request } from 'express'
import type { SessionUser } from '@trigo/core'

export interface JwtPayload {
  /** id do usuario */
  sub: string
  email: string
  role: string
  /** tokenVersion: permite revogar sessoes sem manter lista negra */
  tv: number
}

export interface AuthenticatedRequest extends Request {
  user?: SessionUser
}
