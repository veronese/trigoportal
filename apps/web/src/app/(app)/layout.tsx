import { SessionProvider } from '@/components/session-provider'
import { AppShell } from '@/components/app-shell'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  )
}
