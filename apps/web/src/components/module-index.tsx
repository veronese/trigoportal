'use client'

import Link from 'next/link'
import { NAV_SECTIONS } from '@/lib/navigation'
import { useSession } from '@/components/session-provider'
import { Icon } from '@/components/icons'
import { PageTitle } from '@/components/page-title'
import { Card } from '@/components/ui'

/**
 * Tela indice de um modulo. Monta os cartoes a partir do registro de navegacao,
 * filtrando por permissao — nao existe lista de rotinas duplicada por tela.
 */
export function ModuleIndex({ sectionHref }: { sectionHref: string }) {
  const { hasPermission } = useSession()
  const section = NAV_SECTIONS.find((candidate) => candidate.href === sectionHref)

  if (!section) return null

  const items = section.items.filter((item) => !item.permission || hasPermission(item.permission))

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle icon={section.icon} titulo={section.label} descricao={section.description} />

      {items.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-500">
            Voce nao tem permissao para nenhuma rotina deste modulo.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
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
                    <h2 className="text-sm font-semibold text-ink-900">{item.label}</h2>
                    <p className="mt-1 text-sm text-ink-500">{item.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
