'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ROLE_LABELS } from '@trigo/core'
import { NAV_SECTIONS, type NavSection } from '@/lib/navigation'
import { useSession } from '@/components/session-provider'
import { Icon, type IconName } from '@/components/icons'
import { Logo, LogoMark } from '@/components/logo'
import { Button } from '@/components/ui'

const CHAVE_MENU = 'trigo-portal:menu-recolhido'

/**
 * Layout no padrao Architect UI, com a identidade do Grupo Trigo: barra
 * superior clara com a marca, menu lateral grafite recolhivel com icones, e
 * area de conteudo com cabecalho de pagina padronizado.
 *
 * No mobile mantemos o padrao ja validado — cabecalho grafite e barra inferior
 * de abas. Menu lateral em tela pequena viraria gaveta sobreposta, que e pior
 * no toque do que abas fixas.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, hasPermission } = useSession()
  const pathname = usePathname()
  const router = useRouter()

  // Preferencia por dispositivo. Lida so depois da montagem, para o HTML do
  // servidor nao divergir do cliente (hydration).
  const [recolhido, setRecolhido] = useState(false)
  useEffect(() => {
    setRecolhido(window.localStorage.getItem(CHAVE_MENU) === '1')
  }, [])

  const alternarMenu = useCallback(() => {
    setRecolhido((atual) => {
      const proximo = !atual
      window.localStorage.setItem(CHAVE_MENU, proximo ? '1' : '0')
      return proximo
    })
  }, [])

  // Cobre o caso de um admin ter redefinido a senha enquanto a tela estava
  // aberta: o BFF passa a recusar tudo, e o usuario precisa ir para a troca.
  const travadoPorSenha = user?.mustChangePassword ?? false
  useEffect(() => {
    if (travadoPorSenha) router.replace('/trocar-senha')
  }, [travadoPorSenha, router])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span
          aria-label="Carregando"
          className="size-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
        />
      </div>
    )
  }

  // O middleware ja barra o acesso sem cookie; isso cobre a sessao expirada
  // enquanto a tela estava aberta (o redirect vem do onUnauthorized do api client).
  if (!user || travadoPorSenha) return null

  // Secao aparece se o usuario puder ver ao menos um item dela.
  const sections: NavSection[] = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || hasPermission(item.permission)),
  })).filter((section) => section.items.length > 0)

  return (
    <div className="min-h-dvh">
      {/* Barra superior — desktop */}
      <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-border-subtle bg-white px-4 md:flex">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={alternarMenu}
            aria-expanded={!recolhido}
            aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
            title={recolhido ? 'Expandir menu' : 'Recolher menu'}
            className="flex size-10 items-center justify-center rounded-lg text-ink-600 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <Icon name={recolhido ? 'menu' : 'chevronLeft'} />
          </button>
          <Logo />
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-500">{ROLE_LABELS[user.role]}</p>
          </div>
          <Link
            href="/conta"
            aria-label="Minha conta"
            title="Minha conta"
            className="flex size-10 items-center justify-center rounded-full bg-ink-900 text-brand-500 transition hover:bg-ink-800"
          >
            <Icon name="account" />
          </Link>
        </div>
      </header>

      {/* Cabecalho — mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-ink-900 px-4 py-3 md:hidden">
        <span className="flex items-center gap-2">
          <LogoMark size={32} />
          <span className="text-sm font-bold text-white">Portal Trigo</span>
        </span>
        <span className="truncate pl-3 text-xs text-ink-300">{user.name}</span>
      </header>

      <div className="md:flex">
        {/* Menu lateral — desktop */}
        <aside
          className={`sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col bg-ink-900 transition-[width] duration-200 md:flex ${
            recolhido ? 'md:w-[4.75rem]' : 'md:w-64'
          }`}
        >
          <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
            <ItemMenu
              href="/"
              icon="home"
              label="Inicio"
              active={pathname === '/'}
              recolhido={recolhido}
            />

            {sections.map((section) => (
              <div key={section.href}>
                {recolhido ? (
                  <div className="mx-2 mb-2 border-t border-white/10" />
                ) : (
                  <p className="px-3 pb-1.5 text-[0.6875rem] font-bold uppercase tracking-wider text-ink-400">
                    {section.label}
                  </p>
                )}
                <ul className="flex flex-col gap-1">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <ItemMenu
                        href={item.href}
                        icon={item.icon}
                        label={item.label}
                        active={pathname.startsWith(item.href)}
                        recolhido={recolhido}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Rodape: Conta e Sair sempre alcancaveis, em qualquer modulo. */}
          <div className="shrink-0 border-t border-white/10 p-3">
            {!recolhido && (
              <>
                <p className="truncate px-2 text-sm font-semibold text-white">{user.name}</p>
                <p className="truncate px-2 pb-2 text-xs text-ink-300">{ROLE_LABELS[user.role]}</p>
              </>
            )}
            <ItemMenu
              href="/conta"
              icon="account"
              label="Conta"
              active={pathname.startsWith('/conta')}
              recolhido={recolhido}
            />
            <Button
              variant="secondary"
              title="Sair"
              className="mt-3 w-full border-white/20 bg-transparent px-0 text-ink-100 hover:bg-white/10 hover:text-white"
              onClick={() => void logout()}
            >
              Sair
            </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 pb-24 sm:px-6 md:px-8 md:pb-10">{children}</main>
      </div>

      {/* Barra inferior — mobile */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-white md:hidden">
        <ul className="flex">
          <AbaInferior href="/" icon="home" label="Inicio" active={pathname === '/'} />
          {sections.map((section) => (
            <AbaInferior
              key={section.href}
              href={section.href}
              icon={section.icon}
              label={section.shortLabel}
              active={pathname.startsWith(section.href)}
            />
          ))}
          <AbaInferior
            href="/conta"
            icon="account"
            label="Conta"
            active={pathname.startsWith('/conta')}
          />
        </ul>
      </nav>
    </div>
  )
}

function ItemMenu({
  href,
  icon,
  label,
  active,
  recolhido,
}: {
  href: string
  icon: IconName
  label: string
  active: boolean
  recolhido: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      // Com o menu recolhido o rotulo desaparece, entao o title vira a unica
      // pista do destino: sem ele o menu de icones fica indecifravel.
      title={recolhido ? label : undefined}
      className={`flex items-center gap-3 rounded-lg border-l-[3px] py-2 text-sm transition ${
        recolhido ? 'justify-center px-0' : 'px-3'
      } ${
        active
          ? 'border-brand-500 bg-white/10 font-semibold text-white'
          : 'border-transparent text-ink-200 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon name={icon} className={active ? 'size-5 text-brand-500' : 'size-5'} />
      {!recolhido && <span className="truncate">{label}</span>}
    </Link>
  )
}

function AbaInferior({
  href,
  icon,
  label,
  active,
}: {
  href: string
  icon: IconName
  label: string
  active: boolean
}) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-2 text-[0.6875rem] ${
          active ? 'border-brand-500 font-bold text-ink-900' : 'border-transparent text-ink-500'
        }`}
      >
        <Icon name={icon} className={active ? 'size-5 text-brand-600' : 'size-5'} />
        {label}
      </Link>
    </li>
  )
}
