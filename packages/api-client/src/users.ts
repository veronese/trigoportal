import type {
  CreateUserInput,
  PublicUser,
  ResetPasswordInput,
  UpdateUserInput,
  UserListResponse,
} from '@trigo/core'
import { request, type HttpConfig } from './http'

export interface ListUsersParams {
  search?: string
  page?: number
  pageSize?: number
}

export function listUsers(config: HttpConfig, params: ListUsersParams = {}) {
  return request<UserListResponse>(config, '/users', { query: { ...params } })
}

export function getUser(config: HttpConfig, id: string) {
  return request<PublicUser>(config, `/users/${id}`)
}

export function createUser(config: HttpConfig, input: CreateUserInput) {
  return request<PublicUser>(config, '/users', { method: 'POST', body: input })
}

export function updateUser(config: HttpConfig, id: string, input: UpdateUserInput) {
  return request<PublicUser>(config, `/users/${id}`, { method: 'PATCH', body: input })
}

export function resetUserPassword(config: HttpConfig, id: string, input: ResetPasswordInput) {
  return request<PublicUser>(config, `/users/${id}/reset-password`, { method: 'POST', body: input })
}

export function deactivateUser(config: HttpConfig, id: string) {
  return request<PublicUser>(config, `/users/${id}/deactivate`, { method: 'POST' })
}

/** Libera conta bloqueada por tentativas, sem esperar o prazo. */
export function unlockUser(config: HttpConfig, id: string) {
  return request<PublicUser>(config, `/users/${id}/unlock`, { method: 'POST' })
}

/** Exclusao definitiva. Preferir desativar; ver comentario no UsersService. */
export function removeUser(config: HttpConfig, id: string) {
  return request<void>(config, `/users/${id}`, { method: 'DELETE' })
}
