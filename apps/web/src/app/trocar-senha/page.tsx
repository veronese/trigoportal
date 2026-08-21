'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { changePasswordSchema, type SessionUser } from '@trigo/core'
import { Logo } from '@/components/logo'
import { Alert, Button, Card, Field } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

/**
 * Tela de troca de senha — fora do grupo (app) de proposito: quem cai aqui por
 * obrigatoriedade nao pode ver o menu nem navegar para outra rotina.
 *
 * A obrigatoriedade real e do BFF, que recusa toda rota com 403
 * PASSWORD_CHANGE_REQUIRED enquanto a senha nao for trocada. Esta tela existe
 * para o usuario ter como sair da trava, nao para impor a regra.
 */
export default function TrocarSenhaPage() {
  const router = useRouter()

  const [user, setUser] = useState<SessionUser | null>(null)
  const [carregando, setCarregando] = useState(true)

  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [errors, setErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmacao?: string }>({})
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  useEffect(() => {
    api.auth
      .me()
      .then(({ user: atualUser }) => setUser(atualUser))
      .catch(() => router.replace('/login'))
      .finally(() => setCarregando(false))
  }, [router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro(null)

    if (nova !== confirmacao) {
      setErrors({ confirmacao: 'A confirmacao nao confere com a nova senha' })
      return
    }

    const parsed = changePasswordSchema.safeParse({ currentPassword: atual, newPassword: nova })
    if (!parsed.success) {
      const fieldErrors: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (field === 'currentPassword' || field === 'newPassword') {
          if (!fieldErrors[field]) fieldErrors[field] = issue.message
        }
      }
      setErrors(fieldErrors)
      return
    }

    setErrors({})
    setEnviando(true)
    try {
      await api.auth.changePassword(parsed.data)
      setConcluido(true)
      // O cookie novo ja veio na resposta; o replace leva ao portal liberado.
      router.replace('/')
    } catch (error) {
      setErro(error instanceof ApiError ? error.displayMessage : 'Nao foi possivel trocar a senha')
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <span
          aria-label="Carregando"
          className="size-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
        />
      </main>
    )
  }

  const obrigatorio = user?.mustChangePassword ?? false

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" />
          <h1 className="mt-5 text-lg font-semibold text-ink-900">
            {obrigatorio ? 'Defina sua senha' : 'Trocar senha'}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {obrigatorio
              ? 'Sua senha atual foi definida por um administrador. Escolha uma senha sua para continuar.'
              : 'Escolha uma nova senha de acesso.'}
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            {user && (
              <p className="text-xs text-ink-500">
                Conta: <strong className="font-semibold text-ink-700">{user.email}</strong>
              </p>
            )}

            <Field
              label={obrigatorio ? 'Senha provisoria' : 'Senha atual'}
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              value={atual}
              onChange={(event) => setAtual(event.target.value)}
              error={errors.currentPassword}
            />
            <Field
              label="Nova senha"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              hint="Minimo 10 caracteres, com maiuscula, minuscula e numero"
              required
              value={nova}
              onChange={(event) => setNova(event.target.value)}
              error={errors.newPassword}
            />
            <Field
              label="Confirme a nova senha"
              name="confirmacao"
              type="password"
              autoComplete="new-password"
              required
              value={confirmacao}
              onChange={(event) => setConfirmacao(event.target.value)}
              error={errors.confirmacao}
            />

            <p className="text-xs text-ink-500">
              As outras sessoes abertas nesta conta serao encerradas.
            </p>

            {erro && <Alert>{erro}</Alert>}
            {concluido && <Alert tone="success">Senha alterada. Redirecionando...</Alert>}

            <Button type="submit" loading={enviando} className="mt-1 w-full">
              Salvar nova senha
            </Button>

            {!obrigatorio && (
              <Button type="button" variant="ghost" onClick={() => router.replace('/')}>
                Cancelar
              </Button>
            )}
          </form>
        </Card>

        {obrigatorio && (
          <button
            type="button"
            onClick={() => void api.auth.logout().then(() => router.replace('/login'))}
            className="mt-6 w-full text-center text-xs text-ink-500 underline"
          >
            Sair e entrar com outra conta
          </button>
        )}
      </div>
    </main>
  )
}
