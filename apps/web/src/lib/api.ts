import { createApiClient } from '@trigo/api-client'

/**
 * Todas as chamadas passam por /api/bff (proxy do Next -> BFF).
 * Vantagem: mesma origem, cookie httpOnly funciona sem CORS e o
 * endereco real do BFF nunca aparece no navegador.
 */
export const api = createApiClient({
  baseUrl: '/api/bff',
  onUnauthorized: () => {
    if (typeof window === 'undefined') return
    if (window.location.pathname.startsWith('/login')) return
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
  },
  onPasswordChangeRequired: () => {
    if (typeof window === 'undefined') return
    if (window.location.pathname.startsWith('/trocar-senha')) return
    window.location.href = '/trocar-senha'
  },
})

export { ApiError } from '@trigo/api-client'
