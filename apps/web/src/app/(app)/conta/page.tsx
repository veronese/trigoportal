'use client'

import Link from 'next/link'
import { PERMISSION_LABELS, ROLE_LABELS, ROLE_PERMISSIONS } from '@trigo/core'
import { useSession } from '@/components/session-provider'
import { LogoMark } from '@/components/logo'
import { PageTitle } from '@/components/page-title'
import { Button, Card } from '@/components/ui'

/**
 * Tela Conta — reune tudo do usuario logado num lugar so.
 *
 * No mobile e o destino da aba "Conta", que substitui o botao Sair solto no
 * cabecalho. No desktop as mesmas acoes seguem no rodape do menu lateral, e o
 * nome do usuario la leva para ca.
 */
export default function ContaPage() {
  const { user, logout } = useSession()
  if (!user) return null

  const permissoes = ROLE_PERMISSIONS[user.role]

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageTitle
        icon="account"
        titulo="Minha conta"
        descricao="Seus dados de acesso e acoes da conta."
      />

      <Card>
        <div className="flex items-center gap-4">
          <LogoMark size={48} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink-900">{user.name}</p>
            <p className="truncate text-sm text-ink-500">{user.email}</p>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-border-subtle pt-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-ink-400">
              Perfil de acesso
            </dt>
            <dd className="mt-1 text-sm font-semibold text-ink-900">{ROLE_LABELS[user.role]}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-ink-400">Origem</dt>
            <dd className="mt-1 text-sm text-ink-700">Conta local do portal</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-ink-900">O que seu perfil permite</h2>
        {permissoes.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">
            Seu perfil ainda nao tem permissao em nenhuma rotina. Procure o administrador.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {permissoes.map((permissao) => (
              <li key={permissao} className="flex items-start gap-2 text-sm text-ink-700">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                {PERMISSION_LABELS[permissao]}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-ink-900">Seguranca</h2>
        <p className="mt-1 text-sm text-ink-500">
          Trocar a senha encerra as outras sessoes abertas nesta conta.
        </p>
        <Link href="/trocar-senha" className="mt-4 inline-block">
          <Button>Trocar minha senha</Button>
        </Link>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-ink-900">Encerrar sessao</h2>
        <p className="mt-1 text-sm text-ink-500">
          Voce sera desconectado apenas neste dispositivo.
        </p>
        <Button variant="danger" className="mt-4" onClick={() => void logout()}>
          Sair do portal
        </Button>
      </Card>
    </div>
  )
}
