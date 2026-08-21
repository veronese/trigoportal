'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BOOLEAN_FALSE,
  BOOLEAN_TRUE,
  PARAMETER_TYPE_LABELS,
  updateCredentialSchema,
  validateParameterValue,
  type ParameterGroupView,
  type PublicParameter,
} from '@trigo/core'
import { useSession } from '@/components/session-provider'
import { PageTitle } from '@/components/page-title'
import { Alert, Badge, Button, CardFlush, Field, SelectField } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

export default function ParametrosPage() {
  const { hasPermission } = useSession()
  const canWrite = hasPermission('settings:write')

  const [groups, setGroups] = useState<ParameterGroupView[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const result = await api.parameters.list()
      setGroups(result.groups)
    } catch (error) {
      setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao carregar parametros')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const executar = useCallback(
    async (acao: () => Promise<unknown>, mensagem: string) => {
      setErro(null)
      setAviso(null)
      try {
        await acao()
        setEditando(null)
        setAviso(mensagem)
        await load()
        return true
      } catch (error) {
        setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao salvar o parametro')
        return false
      }
    },
    [load],
  )

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle
        icon="sliders"
        modulo="Configurador"
        titulo="Parametros"
        descricao={
          <>
            Comportamento do portal em runtime. Credenciais de infraestrutura (banco, segredo do
            JWT) continuam no <code className="rounded bg-ink-100 px-1">.env</code> — aqui fica o
            que muda sem deploy.
          </>
        }
      />

      {!canWrite && (
        <Alert tone="success">
          Seu perfil permite apenas consultar a parametrizacao. Alteracao exige o papel
          Administrador.
        </Alert>
      )}
      {aviso && <Alert tone="success">{aviso}</Alert>}
      {erro && <Alert>{erro}</Alert>}
      {loading && <p className="text-sm text-ink-500">Carregando...</p>}

      {groups.map((group) => (
        <section key={group.group} className="flex flex-col gap-3">
          <CardFlush title={group.group}>
            <ul className="divide-y divide-border-subtle">
              {group.parameters.map((parameter) => (
                <li key={parameter.key} className="p-4">
                  <LinhaParametro
                    parameter={parameter}
                    canWrite={canWrite}
                    aberto={editando === parameter.key}
                    onAbrir={() =>
                      setEditando(editando === parameter.key ? null : parameter.key)
                    }
                    onSalvar={(value) =>
                      executar(
                        () => api.parameters.update(parameter.key, { value }),
                        `${parameter.label} atualizado.`,
                      )
                    }
                    onSalvarCredencial={(input) =>
                      executar(
                        () => api.parameters.updateCredential(parameter.key, input),
                        `${parameter.label} atualizada.`,
                      )
                    }
                    onRestaurar={() =>
                      executar(
                        () => api.parameters.reset(parameter.key),
                        `${parameter.label} restaurado ao padrao.`,
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </CardFlush>
        </section>
      ))}
    </div>
  )
}

function LinhaParametro({
  parameter,
  canWrite,
  aberto,
  onAbrir,
  onSalvar,
  onSalvarCredencial,
  onRestaurar,
}: {
  parameter: PublicParameter
  canWrite: boolean
  aberto: boolean
  onAbrir: () => void
  onSalvar: (value: string) => Promise<boolean>
  onSalvarCredencial: (input: { usuario: string; senha: string }) => Promise<boolean>
  onRestaurar: () => Promise<boolean>
}) {
  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink-900">{parameter.label}</p>
            {parameter.isCustomized && <Badge tone="brand">Customizado</Badge>}
            {parameter.type === 'SECRET' && <Badge tone="neutral">Secreto</Badge>}
          </div>
          <code className="mt-0.5 block text-xs text-ink-400">{parameter.key}</code>
          {parameter.description && (
            <p className="mt-1 text-sm text-ink-500">{parameter.description}</p>
          )}
          <p className="mt-2 text-sm">
            <span className="text-ink-400">Valor: </span>
            <ValorAtual parameter={parameter} />
          </p>
          {parameter.updatedBy && (
            <p className="mt-1 text-xs text-ink-400">
              Alterado por {parameter.updatedBy} em{' '}
              {new Date(parameter.updatedAt).toLocaleString('pt-BR')}
            </p>
          )}
        </div>

        {canWrite && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onAbrir}>
              {aberto ? 'Fechar' : 'Alterar'}
            </Button>
            {parameter.isCustomized && (
              <Button variant="ghost" onClick={() => void onRestaurar()}>
                Restaurar padrao
              </Button>
            )}
          </div>
        )}
      </div>

      {aberto &&
        canWrite &&
        (parameter.type === 'CREDENTIAL' ? (
          <FormCredencial parameter={parameter} onSalvar={onSalvarCredencial} onCancelar={onAbrir} />
        ) : (
          <FormParametro parameter={parameter} onSalvar={onSalvar} onCancelar={onAbrir} />
        ))}
    </>
  )
}

function ValorAtual({ parameter }: { parameter: PublicParameter }) {
  if (parameter.type === 'CREDENTIAL') {
    if (!parameter.hasValue) return <span className="text-ink-400">nao configurada</span>
    return (
      <span className="text-ink-900">
        usuario <span className="font-mono">{parameter.credentialUser ?? '(ilegivel)'}</span>
        <span className="text-ink-400"> · senha </span>
        <span className="font-mono text-ink-700">••••••••</span>
      </span>
    )
  }
  if (parameter.type === 'SECRET') {
    return parameter.hasValue ? (
      <span className="font-mono text-ink-700">••••••••</span>
    ) : (
      <span className="text-ink-400">nao configurado</span>
    )
  }
  if (parameter.type === 'BOOLEAN') {
    return (
      <span className="font-semibold text-ink-900">
        {parameter.value === BOOLEAN_TRUE ? 'Sim' : 'Nao'}
      </span>
    )
  }
  if (!parameter.value) return <span className="text-ink-400">vazio</span>
  return <span className="font-mono text-ink-900">{parameter.value}</span>
}

/**
 * Usuario e senha no mesmo formulario, gravados como um par unico.
 * O campo de senha tem "Mostrar": digitar credencial as cegas e a maior fonte
 * de erro nessa tela, e quem configura ja tem o valor em maos.
 */
function FormCredencial({
  parameter,
  onSalvar,
  onCancelar,
}: {
  parameter: PublicParameter
  onSalvar: (input: { usuario: string; senha: string }) => Promise<boolean>
  onCancelar: () => void
}) {
  const [usuario, setUsuario] = useState(parameter.credentialUser ?? '')
  const [senha, setSenha] = useState('')
  const [errors, setErrors] = useState<{ usuario?: string; senha?: string }>({})
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsed = updateCredentialSchema.safeParse({ usuario, senha })
    if (!parsed.success) {
      const campos: { usuario?: string; senha?: string } = {}
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0]
        if ((campo === 'usuario' || campo === 'senha') && !campos[campo]) {
          campos[campo] = issue.message
        }
      }
      setErrors(campos)
      return
    }

    setErrors({})
    setEnviando(true)
    await onSalvar(parsed.data)
    setEnviando(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 flex flex-col gap-4 rounded-lg border border-border-subtle bg-ink-50 p-4 sm:max-w-md"
      noValidate
    >
      <Field
        label="Usuario"
        name={`${parameter.key}-usuario`}
        autoCapitalize="none"
        autoComplete="off"
        value={usuario}
        onChange={(event) => setUsuario(event.target.value)}
        error={errors.usuario}
      />
      <Field
        label="Senha"
        name={`${parameter.key}-senha`}
        type="password"
        revealable
        autoComplete="new-password"
        hint={
          parameter.hasValue
            ? 'A senha atual nao e exibida. O que for digitado substitui a anterior.'
            : undefined
        }
        value={senha}
        onChange={(event) => setSenha(event.target.value)}
        error={errors.senha}
      />

      <div className="flex gap-2">
        <Button type="submit" loading={enviando}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function FormParametro({
  parameter,
  onSalvar,
  onCancelar,
}: {
  parameter: PublicParameter
  onSalvar: (value: string) => Promise<boolean>
  onCancelar: () => void
}) {
  const [value, setValue] = useState(
    parameter.type === 'SECRET' ? '' : (parameter.value ?? ''),
  )
  const [erro, setErro] = useState<string | undefined>()
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // Mesma funcao de validacao que o BFF usa antes de gravar.
    const problema = validateParameterValue(parameter.type, value)
    if (problema) {
      setErro(problema)
      return
    }

    setErro(undefined)
    setEnviando(true)
    await onSalvar(value)
    setEnviando(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 flex flex-col gap-4 rounded-lg border border-border-subtle bg-ink-50 p-4 sm:max-w-md"
      noValidate
    >
      {parameter.type === 'BOOLEAN' ? (
        <SelectField
          label={parameter.label}
          name={parameter.key}
          options={[
            { value: BOOLEAN_TRUE, label: 'Sim' },
            { value: BOOLEAN_FALSE, label: 'Nao' },
          ]}
          value={value || BOOLEAN_FALSE}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : (
        <Field
          label={`${parameter.label} (${PARAMETER_TYPE_LABELS[parameter.type]})`}
          name={parameter.key}
          type={parameter.type === 'SECRET' ? 'password' : 'text'}
          revealable={parameter.type === 'SECRET'}
          inputMode={parameter.type === 'NUMBER' ? 'numeric' : undefined}
          autoComplete={parameter.type === 'SECRET' ? 'new-password' : 'off'}
          autoCapitalize="none"
          hint={
            parameter.type === 'SECRET'
              ? 'O valor atual nao e exibido. O que for digitado substitui o anterior.'
              : parameter.defaultValue
                ? `Padrao de fabrica: ${parameter.defaultValue}`
                : undefined
          }
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={erro}
        />
      )}

      <div className="flex gap-2">
        <Button type="submit" loading={enviando}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
