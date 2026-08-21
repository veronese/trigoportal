'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { can, type Permission, type SessionUser } from '@trigo/core'
import { api } from '@/lib/api'

interface SessionState {
  user: SessionUser | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
  /** Mesma regra do BFF: a tela esconde o que o backend recusaria. */
  hasPermission: (permission: Permission) => boolean
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { user: current } = await api.auth.me()
      setUser(current)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => undefined)
    setUser(null)
    router.replace('/login')
  }, [router])

  const hasPermission = useCallback(
    (permission: Permission) => (user ? can(user.role, permission) : false),
    [user],
  )

  return (
    <SessionContext.Provider value={{ user, loading, refresh, logout, hasPermission }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionState {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession deve ser usado dentro de SessionProvider')
  return context
}
