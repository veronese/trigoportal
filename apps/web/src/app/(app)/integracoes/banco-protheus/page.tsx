'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { can, type ProtheusDbConfig, type ProtheusDbTestResult, type Role } from '@trigo/core'
import { PageTitle } from '@/components/page-title'
import { useSession } from '@/components/session-provider'
import { Alert, Badge, Button, Card, CardFlush } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

export default function BancoProtheusPage() {
  const { user } = useSession()
  const role = user?.role as Role | undefined
  const podeTestar = role ? can(role, 'settings:write') : false

  const [config, setConfig] = useState<ProtheusDbConfig | null>(null)
  const [teste, setTeste] = useState<ProtheusDbTestResult | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [testando, setTestando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setConfig(await api.protheusDb.config())
      setErro(null)
    } catch (e) {
      setErro(e instanceof ApiError ? e.displayMessage : 'Falha ao ler a configuracao')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function testar() {
    setTestando(true)
    setTeste(null)
    setErro(null)
    try {
      setTeste(await api.protheusDb.testar())
    } catch (e) {
      setErro(e instanceof ApiError ? e.displayMessage : 'Falha ao testar a conexao')
    } finally {
      setTestando(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        icon="database"
        modulo="Integracoes"
        titulo="Banco do Protheus"
        descricao="Conexao direta com o SQL Server do ERP, somente leitura. Serve ao ETL, que alcanca empresas sem ambiente REST preparado."
        acoes={
          podeTestar && (
            <Button loading={testando} disabled={!config?.configurado} onClick={testar}>
              Testar conexao
            </Button>
          )
        }
      />

      {erro && <Alert>{erro}</Alert>}

      {/* O escopo precede a configuracao: quem abre esta tela precisa saber
          por que existem duas conexoes com o mesmo ERP. */}
      <Card title="Para que serve">
        <p className="text-sm text-ink-700">
          O REST do Protheus respeita o ambiente do appserver e recusa empresa que nao tenha um
          ambiente preparado. O banco nao tem esse conceito:{' '}
          <span className="font-mono text-xs">SB1090</span> e uma tabela como outra qualquer, no
          mesmo banco da <span className="font-mono text-xs">SB1020</span>.
        </p>
        <p className="mt-2 text-sm text-ink-500">
          Em troca, filial, <span className="font-mono text-xs">D_E_L_E_T_</span> e tamanho de campo
          deixam de ser resolvidos pelo framework e passam a ser responsabilidade das consultas do
          portal. Por isso esta conexao <strong>nunca grava</strong> — inclusao e alteracao
          continuam pelo REST, com ExecAuto.
        </p>
      </Card>

      {carregando && <p className="text-sm text-ink-500">Carregando...</p>}

      {config && (
        <Card
          title="Configuracao"
          actions={
            <Link
              href="/configurador/parametros"
              className="text-sm font-semibold text-ink-500 hover:underline"
            >
              Editar em Parametros
            </Link>
          }
        >
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Servidor" valor={config.host} mono />
            <Campo rotulo="Porta" valor={String(config.porta)} mono />
            <Campo rotulo="Banco de dados" valor={config.banco} mono />
            <Campo rotulo="Login" valor={config.usuario} mono />
            <div className="min-w-0">
              <dt className="text-xs font-bold uppercase tracking-wider text-ink-400">Senha</dt>
              <dd className="mt-1">
                {config.senhaConfigurada ? (
                  <Badge tone="success">configurada</Badge>
                ) : (
                  <Badge tone="neutral">nao informada</Badge>
                )}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-bold uppercase tracking-wider text-ink-400">Conexao</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {config.criptografia ? (
                  <Badge tone="success">criptografada</Badge>
                ) : (
                  <Badge tone="danger">em claro</Badge>
                )}
                {config.certificadoConfiavel && (
                  <Badge tone="neutral">certificado nao verificado</Badge>
                )}
              </dd>
            </div>
            <Campo rotulo="Timeout" valor={`${config.timeoutSegundos}s`} />
          </dl>

          {config.pendencias.length > 0 && (
            <div className="mt-4 rounded-lg border border-border-strong bg-ink-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
                Falta preencher
              </p>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-700">
                {config.pendencias.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {teste && <Resultado teste={teste} />}
    </div>
  )
}

function Resultado({ teste }: { teste: ProtheusDbTestResult }) {
  return (
    <div className="flex flex-col gap-4">
      <Alert tone={teste.ok ? 'success' : 'error'}>{teste.detalhe}</Alert>

      {/* Login com escrita e alerta, nao detalhe: e o unico achado do teste que
          exige acao mesmo quando tudo conectou. */}
      {teste.podeEscrever && (
        <Alert>
          Este login pode gravar no banco do ERP. O ETL so le — troque por um login somente leitura
          antes de usar em producao.
        </Alert>
      )}

      {teste.ok && (
        <Card title="Servidor">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Maquina" valor={teste.servidor} mono />
            <Campo rotulo="Banco" valor={teste.banco} mono />
            <Campo rotulo="Login efetivo" valor={teste.loginEfetivo} mono />
            <Campo rotulo="Tempo" valor={`${teste.duracaoMs} ms`} />
            <div className="min-w-0 sm:col-span-2 lg:col-span-4">
              <dt className="text-xs font-bold uppercase tracking-wider text-ink-400">Versao</dt>
              <dd className="mt-1 break-words font-mono text-xs text-ink-700">
                {teste.versaoServidor ?? 'nao informada'}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      {teste.tabelas.length > 0 && (
        <CardFlush title="Tabelas de produto">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-strong bg-ink-50 text-left">
                  <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-500">
                    Empresa
                  </th>
                  <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-500">
                    Tabela
                  </th>
                  <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-500">
                    Situacao
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-ink-500">
                    Registros
                  </th>
                </tr>
              </thead>
              <tbody>
                {teste.tabelas.map((t) => (
                  <tr key={t.nome} className="border-b border-border-subtle align-top">
                    <td className="px-4 py-2.5 font-semibold text-ink-900">{t.empresa}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-700">{t.nome}</td>
                    <td className="px-4 py-2.5">
                      {t.existe ? (
                        <Badge tone="success">existe</Badge>
                      ) : (
                        <Badge tone="danger">nao existe</Badge>
                      )}
                      {t.detalhe && <p className="mt-1 text-xs text-ink-500">{t.detalhe}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-700">
                      {t.registros === null ? '—' : t.registros.toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardFlush>
      )}

      {teste.erro && (
        <Card title="Erro do driver">
          <p className="break-words font-mono text-xs text-ink-700">{teste.erro}</p>
        </Card>
      )}
    </div>
  )
}

function Campo({
  rotulo,
  valor,
  mono = false,
}: {
  rotulo: string
  valor: string | null
  mono?: boolean
}) {
  const preenchido = valor !== null && valor.trim() !== ''
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-wider text-ink-400">{rotulo}</dt>
      <dd
        className={`mt-1 break-words text-sm ${preenchido ? 'text-ink-900' : 'text-ink-400'} ${
          mono && preenchido ? 'font-mono text-xs' : ''
        }`}
      >
        {preenchido ? valor : 'nao informado'}
      </dd>
    </div>
  )
}
