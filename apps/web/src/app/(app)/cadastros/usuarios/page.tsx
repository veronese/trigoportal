'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ROLES,
  ROLE_LABELS,
  createUserSchema,
  passwordSchema,
  updateUserSchema,
  type PublicUser,
  type Role,
} from '@trigo/core'
import { useSession } from '@/components/session-provider'
import { PageTitle } from '@/components/page-title'
import { Alert, Badge, Button, Card, CardFlush, Field, SelectField } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))

/** Qual painel esta aberto para um usuario da lista. */
type PainelAberto = { id: string; modo: 'editar' | 'senha' | 'excluir' } | null

function estaBloqueado(item: PublicUser): boolean {
  return item.lockedUntil !== null && new Date(item.lockedUntil).getTime() > Date.now()
}

function provisoriaVencida(item: PublicUser): boolean {
  return (
    item.provisionalPasswordExpiresAt !== null &&
    new Date(item.provisionalPasswordExpiresAt).getTime() <= Date.now()
  )
}

export default function UsuariosPage() {
  const { user: currentUser, hasPermission } = useSession()
  const canWrite = hasPermission('users:write')
  const canDelete = hasPermission('users:delete')

  const [users, setUsers] = useState<PublicUser[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [painel, setPainel] = useState<PainelAberto>(null)

  const load = useCallback(async (term: string) => {
    setLoading(true)
    setErro(null)
    try {
      const result = await api.users.list({ search: term || undefined, pageSize: 100 })
      setUsers(result.data)
      setTotal(result.total)
    } catch (error) {
      setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao carregar usuarios')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => void load(search), search ? 350 : 0)
    return () => clearTimeout(timer)
  }, [search, load])

  /** Centraliza tratamento de erro e recarga: toda mutacao passa por aqui. */
  const executar = useCallback(
    async (acao: () => Promise<unknown>, mensagemSucesso: string) => {
      setErro(null)
      setAviso(null)
      try {
        await acao()
        setPainel(null)
        setAviso(mensagemSucesso)
        await load(search)
        return true
      } catch (error) {
        setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao executar a operacao')
        return false
      }
    },
    [load, search],
  )

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageTitle
        icon="users"
        modulo="Cadastros"
        titulo="Usuarios"
        descricao={loading ? 'Carregando...' : `${total} usuario(s) cadastrado(s)`}
        acoes={
          canWrite && (
            <Button
              onClick={() => {
                setShowForm((value) => !value)
                setPainel(null)
              }}
            >
              {showForm ? 'Fechar' : 'Novo usuario'}
            </Button>
          )
        }
      />

      {aviso && <Alert tone="success">{aviso}</Alert>}
      {erro && <Alert>{erro}</Alert>}

      {showForm && canWrite && (
        <CriarUsuario
          onCriado={() => {
            setShowForm(false)
            setAviso('Usuario cadastrado.')
            void load(search)
          }}
        />
      )}

      <CardFlush>
        <div className="border-b border-border-subtle p-4">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar usuarios"
            className="min-h-11 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </div>

        {!loading && users.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-500">Nenhum usuario encontrado.</p>
        )}

        <ul className="divide-y divide-border-subtle">
          {users.map((item) => {
            const isSelf = item.id === currentUser?.id
            const aberto = painel?.id === item.id ? painel.modo : null

            return (
              <li key={item.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {item.name}
                      {isSelf && <span className="ml-2 text-xs font-normal text-ink-400">(voce)</span>}
                    </p>
                    <p className="truncate text-xs text-ink-500">{item.email}</p>
                    <p className="mt-1 text-xs text-ink-400">
                      {item.lastLoginAt
                        ? `Ultimo acesso: ${new Date(item.lastLoginAt).toLocaleString('pt-BR')}`
                        : 'Nunca acessou'}
                      {item.provider !== 'local' && ` · origem: ${item.provider}`}
                      {item.failedLoginAttempts > 0 &&
                        ` · ${item.failedLoginAttempts} tentativa(s) errada(s)`}
                    </p>
                    {item.provisionalPasswordExpiresAt && (
                      <p className="mt-1 text-xs text-ink-400">
                        {provisoriaVencida(item)
                          ? `Senha provisoria venceu em ${new Date(item.provisionalPasswordExpiresAt).toLocaleString('pt-BR')} — emita uma nova`
                          : `Senha provisoria valida ate ${new Date(item.provisionalPasswordExpiresAt).toLocaleString('pt-BR')}`}
                      </p>
                    )}
                    {estaBloqueado(item) && item.lockedUntil && (
                      <p className="mt-1 text-xs font-medium text-danger-700">
                        Bloqueado ate {new Date(item.lockedUntil).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>

                  <Badge tone={item.isActive ? 'success' : 'danger'}>
                    {item.isActive ? 'Ativo' : 'Inativo'}
                  </Badge>
                  {estaBloqueado(item) && <Badge tone="danger">Bloqueado</Badge>}
                  {item.mustChangePassword && (
                    <Badge tone={provisoriaVencida(item) ? 'danger' : 'brand'}>
                      {provisoriaVencida(item) ? 'Provisoria vencida' : 'Senha provisoria'}
                    </Badge>
                  )}
                  <span className="w-28 text-sm text-ink-600">{ROLE_LABELS[item.role]}</span>

                  {canWrite && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setPainel(aberto === 'editar' ? null : { id: item.id, modo: 'editar' })}
                      >
                        Editar
                      </Button>
                      {item.provider === 'local' && (
                        <Button
                          variant="ghost"
                          onClick={() => setPainel(aberto === 'senha' ? null : { id: item.id, modo: 'senha' })}
                        >
                          Senha
                        </Button>
                      )}
                      {estaBloqueado(item) && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            void executar(
                              () => api.users.unlock(item.id),
                              `Conta de ${item.name} desbloqueada.`,
                            )
                          }
                        >
                          Desbloquear
                        </Button>
                      )}
                      {canDelete && !isSelf && (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              void executar(
                                () =>
                                  item.isActive
                                    ? api.users.deactivate(item.id)
                                    : api.users.update(item.id, { isActive: true }),
                                item.isActive ? 'Usuario desativado.' : 'Usuario reativado.',
                              )
                            }
                          >
                            {item.isActive ? 'Desativar' : 'Reativar'}
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() =>
                              setPainel(aberto === 'excluir' ? null : { id: item.id, modo: 'excluir' })
                            }
                          >
                            Excluir
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {aberto === 'editar' && (
                  <EditarUsuario
                    usuario={item}
                    podeTrocarPapel={!isSelf}
                    onCancelar={() => setPainel(null)}
                    onSalvar={(input) =>
                      executar(() => api.users.update(item.id, input), 'Usuario atualizado.')
                    }
                  />
                )}

                {aberto === 'senha' && (
                  <RedefinirSenha
                    usuario={item}
                    onCancelar={() => setPainel(null)}
                    onSalvar={(newPassword) =>
                      executar(
                        () => api.users.resetPassword(item.id, { newPassword }),
                        `Senha de ${item.name} redefinida. As sessoes ativas dele foram encerradas.`,
                      )
                    }
                  />
                )}

                {aberto === 'excluir' && (
                  <ConfirmarExclusao
                    usuario={item}
                    onCancelar={() => setPainel(null)}
                    onConfirmar={() =>
                      executar(() => api.users.remove(item.id), 'Usuario excluido definitivamente.')
                    }
                  />
                )}
              </li>
            )
          })}
        </ul>
      </CardFlush>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Criar
// ---------------------------------------------------------------------------

function CriarUsuario({ onCriado }: { onCriado: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'USER' as Role })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro(null)

    const parsed = createUserSchema.safeParse(form)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '')
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setErrors({})
    setEnviando(true)
    try {
      await api.users.create(parsed.data)
      onCriado()
    } catch (error) {
      setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao criar usuario')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-ink-900">Novo usuario</h2>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field
          label="Nome completo"
          name="name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          error={errors.name}
          required
        />
        <Field
          label="E-mail"
          name="email"
          type="email"
          autoCapitalize="none"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          error={errors.email}
          required
        />
        <Field
          label="Senha provisoria"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="Minimo 10 caracteres, com maiuscula, minuscula e numero"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          error={errors.password}
          required
        />
        <SelectField
          label="Papel de acesso"
          name="role"
          options={ROLE_OPTIONS}
          value={form.role}
          onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
        />

        {erro && (
          <div className="sm:col-span-2">
            <Alert>{erro}</Alert>
          </div>
        )}

        <div className="sm:col-span-2">
          <Button type="submit" loading={enviando}>
            Cadastrar
          </Button>
        </div>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Editar
// ---------------------------------------------------------------------------

function EditarUsuario({
  usuario,
  podeTrocarPapel,
  onCancelar,
  onSalvar,
}: {
  usuario: PublicUser
  podeTrocarPapel: boolean
  onCancelar: () => void
  onSalvar: (input: { name?: string; role?: Role }) => Promise<boolean>
}) {
  const [name, setName] = useState(usuario.name)
  const [role, setRole] = useState<Role>(usuario.role)
  const [erroNome, setErroNome] = useState<string | undefined>()
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const input: { name?: string; role?: Role } = {}
    if (name !== usuario.name) input.name = name
    if (podeTrocarPapel && role !== usuario.role) input.role = role

    const parsed = updateUserSchema.safeParse(input)
    if (!parsed.success) {
      setErroNome(parsed.error.issues[0]?.message)
      return
    }
    if (Object.keys(input).length === 0) {
      onCancelar()
      return
    }

    setErroNome(undefined)
    setEnviando(true)
    await onSalvar(input)
    setEnviando(false)
  }

  return (
    <PainelInline titulo={`Editar ${usuario.email}`}>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field
          label="Nome completo"
          name={`name-${usuario.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={erroNome}
          required
        />
        {podeTrocarPapel ? (
          <SelectField
            label="Papel de acesso"
            name={`role-${usuario.id}`}
            options={ROLE_OPTIONS}
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          />
        ) : (
          <p className="self-end text-xs text-ink-500">
            Nao e possivel alterar o proprio papel de acesso.
          </p>
        )}

        {podeTrocarPapel && role !== usuario.role && (
          <div className="sm:col-span-2">
            <Alert tone="success">
              Trocar o papel encerra as sessoes ativas deste usuario.
            </Alert>
          </div>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={enviando}>
            Salvar
          </Button>
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </form>
    </PainelInline>
  )
}

// ---------------------------------------------------------------------------
// Redefinir senha
// ---------------------------------------------------------------------------

function RedefinirSenha({
  usuario,
  onCancelar,
  onSalvar,
}: {
  usuario: PublicUser
  onCancelar: () => void
  onSalvar: (novaSenha: string) => Promise<boolean>
}) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | undefined>()
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsed = passwordSchema.safeParse(senha)
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message)
      return
    }

    setErro(undefined)
    setEnviando(true)
    await onSalvar(parsed.data)
    setEnviando(false)
  }

  return (
    <PainelInline titulo={`Redefinir senha de ${usuario.email}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:max-w-sm" noValidate>
        <Field
          label="Nova senha"
          name={`senha-${usuario.id}`}
          type="password"
          autoComplete="new-password"
          hint="Minimo 10 caracteres, com maiuscula, minuscula e numero"
          value={senha}
          onChange={(event) => setSenha(event.target.value)}
          error={erro}
          required
        />
        <p className="text-xs text-ink-500">
          As sessoes ativas deste usuario serao encerradas ao salvar.
        </p>
        <div className="flex gap-2">
          <Button type="submit" loading={enviando}>
            Redefinir
          </Button>
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </form>
    </PainelInline>
  )
}

// ---------------------------------------------------------------------------
// Excluir
// ---------------------------------------------------------------------------

function ConfirmarExclusao({
  usuario,
  onCancelar,
  onConfirmar,
}: {
  usuario: PublicUser
  onCancelar: () => void
  onConfirmar: () => Promise<boolean>
}) {
  const [confirmacao, setConfirmacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const liberado = confirmacao.trim().toLowerCase() === usuario.email.toLowerCase()

  return (
    <PainelInline titulo="Excluir definitivamente" tone="danger">
      <div className="flex flex-col gap-4 sm:max-w-md">
        <p className="text-sm text-ink-700">
          A exclusao nao pode ser desfeita e remove o historico do usuario. Na maioria dos casos o
          correto e <strong>desativar</strong>, o que bloqueia o acesso e preserva o registro.
        </p>
        <Field
          label={`Digite ${usuario.email} para confirmar`}
          name={`confirmar-${usuario.id}`}
          value={confirmacao}
          autoCapitalize="none"
          onChange={(event) => setConfirmacao(event.target.value)}
        />
        <div className="flex gap-2">
          <Button
            variant="danger"
            disabled={!liberado}
            loading={enviando}
            onClick={async () => {
              setEnviando(true)
              await onConfirmar()
              setEnviando(false)
            }}
          >
            Excluir
          </Button>
          <Button variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </div>
    </PainelInline>
  )
}

function PainelInline({
  titulo,
  tone = 'neutral',
  children,
}: {
  titulo: string
  tone?: 'neutral' | 'danger'
  children: React.ReactNode
}) {
  return (
    <div
      className={`mt-4 rounded-lg border p-4 ${
        tone === 'danger' ? 'border-danger-500/40 bg-danger-50' : 'border-border-subtle bg-ink-50'
      }`}
    >
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-500">{titulo}</p>
      {children}
    </div>
  )
}
