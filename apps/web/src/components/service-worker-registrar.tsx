'use client'

import { useEffect } from 'react'

/** Registra o service worker que torna o site instalavel como PWA. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('[pwa] falha ao registrar o service worker', error)
    })
  }, [])

  return null
}
