import type { ChangePasswordInput, LoginInput, SessionResponse } from '@trigo/core'
import { request, type HttpConfig } from './http'

export function login(config: HttpConfig, input: LoginInput): Promise<SessionResponse> {
  return request<SessionResponse>(config, '/auth/login', { method: 'POST', body: input })
}

export function logout(config: HttpConfig): Promise<void> {
  return request<void>(config, '/auth/logout', { method: 'POST' })
}

export function me(config: HttpConfig): Promise<SessionResponse> {
  return request<SessionResponse>(config, '/auth/me')
}

/**
 * Troca de senha pelo proprio usuario. Tambem e a saida da trava de primeiro
 * acesso. O BFF devolve um cookie novo, ja com o tokenVersion atualizado.
 */
export function changePassword(
  config: HttpConfig,
  input: ChangePasswordInput,
): Promise<SessionResponse> {
  return request<SessionResponse>(config, '/auth/change-password', {
    method: 'POST',
    body: input,
  })
}
