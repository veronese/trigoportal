'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ProtheusStatus, ProtheusTestResult } from '@trigo/core'
import { useSession } from '@/components/session-provider'
import { PageTitle } from '@/components/page-title'
import { Alert, Badge, Button, Card } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

export default function ConexaoProtheusPage() {
  const { hasPermission } = useSession()
  const canWrite = hasPermission('settings:write')

  const [status, setStatus] = useState<ProtheusStatus | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [teste, setTeste] = useState<ProtheusTestResult | null>(null)
  const [testando, setTestando] = useState(false)

  const load = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setStatus(await api.protheus.status())
    } catch (error) {
      setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao ler a configuracao')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function testar() {
    setTestando(true)
    setTeste(null)
    setErro(null)
    try {
      setTeste(await api.protheus.testConnection())
    } catch (error) {
      setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao testar a conexao')
    } finally {
      setTestando(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageTitle
        icon="plug"
        modulo="Integracoes"
        titulo="Conexao Protheus"
        descricao="O portal autentica no REST do Protheus com uma conta de servico (usuario e senha) e reaproveita o mesmo token em todas as chamadas."
        acoes={
          <>
            <LinkParametros grupo="Protheus" rotulo="Parametros da conexao" />
            <LinkParametros grupo="Carga de produtos" rotulo="Parametros da carga" />
          </>
        }
      />

      {erro && <Alert>{erro}</Alert>}
      {carregando && <p className="text-sm text-ink-500">Carregando...</p>}

      {status && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink-900">Situacao</h2>
              <Badge tone={status.configurado ? 'success' : 'danger'}>
                {status.configurado ? 'Configurado' : 'Incompleto'}
              </Badge>
            </div>

            <dl className="mt-4 grid gap-4 border-t border-border-subtle pt-4 sm:grid-cols-2">
              <Campo rotulo="URL do REST" valor={status.baseUrl} vazio="nao informada" mono />
              <Campo rotulo="Usuario de integracao" valor={status.usuario} vazio="nao informado" />
              <Campo
                rotulo="Senha"
                valor={status.senhaConfigurada ? '•••••••• (cifrada no banco)' : ''}
                vazio="nao informada"
              />
              <Campo rotulo="Timeout" valor={`${status.timeoutSegundos} segundos`} />
            </dl>

            {!status.configurado && (
              <div className="mt-4">
                <Alert>
                  Falta preencher URL, usuario ou senha.{' '}
                  <Link href="/configurador/parametros?grupo=Protheus" className="underline">
                    Configure em Parametros
                  </Link>
                  .
                </Alert>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-ink-900">Testar autenticacao</h2>
            <p className="mt-1 text-sm text-ink-500">
              Faz um login real no appserver com a conta de servico. Cada teste consome uma sessao
              no Protheus — use com parcimonia em ambiente de producao.
            </p>

            {teste && (
              <div className="mt-4">
                <Alert tone={teste.ok ? 'success' : 'error'}>
                  {teste.detalhe}
                  {teste.ok && teste.tokenValidoPorSegundos !== null && (
                    <>
                      {' '}
                      Token valido por {Math.round(teste.tokenValidoPorSegundos / 60)} minuto(s).
                    </>
                  )}{' '}
                  <span className="opacity-70">({teste.duracaoMs} ms)</span>
                </Alert>
              </div>
            )}

            {canWrite ? (
              <Button className="mt-4" loading={testando} onClick={() => void testar()}>
                Testar conexao
              </Button>
            ) : (
              <p className="mt-4 text-xs text-ink-500">
                Testar a conexao exige o perfil Administrador.
              </p>
            )}
          </Card>

          <Card className="border-dashed bg-transparent shadow-none">
            <h2 className="text-sm font-semibold text-ink-900">Como o portal usa a conexao</h2>
            <ul className="mt-2 flex flex-col gap-2 text-sm text-ink-600">
              <Item>
                <strong>Um token para todo o portal.</strong> Cada autenticacao no appserver ocupa
                thread e conta como sessao. O token da conta de servico e compartilhado e renovado
                antes de vencer — nunca um login por requisicao.
              </Item>
              <Item>
                <strong>Renovacao por refresh_token</strong> quando o Protheus fornece, evitando
                reenviar a senha.
              </Item>
              <Item>
                <strong>Empresa e filial</strong> vao no header <code>tenantId</code> de toda
                chamada, informadas por quem chama — nao ha tenant padrao. Assim uma consulta
                nunca le a tabela de outra empresa por esquecimento.
              </Item>
              <Item>
                <strong>Senha cifrada.</strong> Gravada com AES-256-GCM e nunca devolvida pela API,
                nem para o administrador.
              </Item>
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}

function Campo({
  rotulo,
  valor,
  vazio,
  mono = false,
}: {
  rotulo: string
  valor: string
  vazio?: string
  mono?: boolean
}) {
  const preenchido = valor.trim() !== ''
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-wider text-ink-400">{rotulo}</dt>
      <dd
        className={`mt-1 break-words text-sm ${preenchido ? 'text-ink-900' : 'text-danger-700'} ${
          mono && preenchido ? 'font-mono text-xs' : ''
        }`}
      >
        {preenchido ? valor : (vazio ?? '-')}
      </dd>
    </div>
  )
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
      <span>{children}</span>
    </li>
  )
}

/**
 * Atalho para o grupo de parametros desta integracao.
 *
 * A tela de Parametros continua sendo a UNICA que edita: validacao por tipo e
 * cifragem de segredo vivem la. Aqui e so o caminho, filtrado por `?grupo=`.
 */
function LinkParametros({ grupo, rotulo }: { grupo: string; rotulo: string }) {
  return (
    <Link
      href={`/configurador/parametros?grupo=${encodeURIComponent(grupo)}`}
      className="inline-flex min-h-11 items-center rounded-lg border border-border-strong px-3 text-sm font-medium text-ink-700 hover:bg-ink-50"
    >
      {rotulo}
    </Link>
  )
}
