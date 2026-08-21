'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loginSchema } from '@trigo/core'
import { Logo } from '@/components/logo'
import { Alert, Button, Card, Field } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    // Mesmo schema que o BFF usa: a validacao nao pode divergir entre as pontas.
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      const fieldErrors: { email?: string; password?: string } = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (field === 'email' || field === 'password') fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setErrors({})
    setSubmitting(true)
    try {
      const { user } = await api.auth.login(parsed.data)
      // Conta com senha provisoria vai direto para a troca: o BFF recusaria
      // qualquer outra rota de qualquer forma.
      if (user.mustChangePassword) {
        router.replace('/trocar-senha')
        return
      }
      router.replace(nextPath.startsWith('/') ? nextPath : '/')
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.displayMessage : 'Nao foi possivel conectar ao servidor',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" />
          <h1 className="mt-5 text-lg font-semibold text-ink-900">Acesse sua conta</h1>
          <p className="mt-1 text-sm text-ink-500">Entre com suas credenciais corporativas</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Field
              label="E-mail"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={errors.email}
            />
            <Field
              label="Senha"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={errors.password}
            />

            {formError && <Alert>{formError}</Alert>}

            <Button type="submit" loading={submitting} className="mt-1 w-full">
              Entrar
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-ink-400">
          Grupo Trigo &middot; acesso monitorado
        </p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
