import type {
  ParameterListResponse,
  PublicBranding,
  PublicParameter,
  UpdateCredentialInput,
  UpdateParameterInput,
} from '@trigo/core'
import { request, type HttpConfig } from './http'

/** Marca do portal — nao exige sessao, usada pela tela de login. */
export function getBranding(config: HttpConfig) {
  return request<PublicBranding>(config, '/parameters/branding')
}

export function listParameters(config: HttpConfig) {
  return request<ParameterListResponse>(config, '/parameters')
}

export function updateParameter(config: HttpConfig, key: string, input: UpdateParameterInput) {
  return request<PublicParameter>(config, `/parameters/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: input,
  })
}

export function resetParameter(config: HttpConfig, key: string) {
  return request<PublicParameter>(config, `/parameters/${encodeURIComponent(key)}/reset`, {
    method: 'POST',
  })
}

/** Grava usuario e senha juntos, para parametro do tipo CREDENTIAL. */
export function updateParameterCredential(
  config: HttpConfig,
  key: string,
  input: UpdateCredentialInput,
) {
  return request<PublicParameter>(config, `/parameters/${encodeURIComponent(key)}/credential`, {
    method: 'PATCH',
    body: input,
  })
}
