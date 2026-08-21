'use client'

import Link from 'next/link'
import { ROLE_LABELS } from '@trigo/core'
import { NAV_SECTIONS } from '@/lib/navigation'
import { useSession } from '@/components/session-provider'
import { Icon } from '@/components/icons'
import { PageTitle } from '@/components/page-title'
import { Card } from '@/components/ui'

export default function HomePage() {
  const { user, hasPermission } = useSession()
  if (!user) return null

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || hasPermission(item.permission)),
  })).filter((section) => section.items.length > 0)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageTitle
        icon="home"
        titulo={`Ola, ${user.name.split(' ')[0]}`}
        descricao={`Perfil de acesso: ${ROLE_LABELS[user.role]}`}
      />

      {sections.map((section) => (
        <section key={section.href} className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400">
            {section.label}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-card outline-ink-900 focus-visible:outline-2"
              >
                <Card className="h-full transition hover:border-brand-500 hover:shadow-card-hover">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon name={item.icon} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-ink-900">{item.label}</h3>
                      <p className="mt-1 text-sm text-ink-500">{item.description}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {sections.length === 0 && (
        <Card>
          <p className="text-sm text-ink-500">
            Seu perfil ainda nao tem acesso a nenhuma rotina. Procure o administrador.
          </p>
        </Card>
      )}
    </div>
  )
}
