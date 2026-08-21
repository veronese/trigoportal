'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { DatabaseStatus } from '@trigo/core'
import { PageTitle } from '@/components/page-title'
import { Alert, Badge, Button, Card } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

export default function BancoDeDadosPage() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const load = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setStatus(await api.database.status())
    } catch (error) {
      setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao ler a situacao do banco')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageTitle
        icon="database"
        modulo="Configurador"
        titulo="Banco de dados"
        descricao="Conexao em uso pelo portal, em modo leitura. E definida no arquivo .env do servidor, nao por esta tela."
        acoes={
          <Button variant="secondary" loading={carregando} onClick={() => void load()}>
            Atualizar
          </Button>
        }
      />

      {erro && <Alert>{erro}</Alert>}
      {carregando && !status && <p className="text-sm text-ink-500">Carregando...</p>}

      {status && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink-900">Conexao em uso</h2>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">Somente leitura</Badge>
                {status.criptografado && <Badge tone="neutral">TLS</Badge>}
                <Badge tone={status.conectado ? 'success' : 'danger'}>
                  {status.conectado ? 'Conectado' : 'Sem conexao'}
                </Badge>
              </div>
            </div>

            <dl className="mt-4 grid gap-4 border-t border-border-subtle pt-4 sm:grid-cols-2">
              <Campo rotulo="Servidor" valor={status.servidor} mono />
              <Campo rotulo="Porta" valor={status.porta ? String(status.porta) : ''} />
              <Campo rotulo="Banco" valor={status.banco} mono />
              <Campo rotulo="Usuario" valor={status.usuario} />
              <Campo
                rotulo="Latencia"
                valor={status.latenciaMs !== null ? `${status.latenciaMs} ms` : ''}
              />
              <Campo rotulo="Provider" valor={status.provider} />
            </dl>

            {status.versaoServidor && (
              <p className="mt-4 border-t border-border-subtle pt-4 text-xs text-ink-500">
                {status.versaoServidor}
              </p>
            )}

            {!status.conectado && status.detalheErro && (
              <div className="mt-4">
                <Alert>{status.detalheErro}</Alert>
              </div>
            )}
          </Card>

          {status.tabelas.length > 0 && (
            <Card title="Registros">
              <ul className="flex flex-col gap-2">
                {status.tabelas.map((tabela) => (
                  <li key={tabela.nome} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-ink-700">{tabela.nome}</span>
                    <span className="font-semibold text-ink-900">
                      {tabela.registros.toLocaleString('pt-BR')}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="border-dashed bg-transparent shadow-none">
            <h2 className="text-sm font-semibold text-ink-900">
              Por que a conexao nao e editavel aqui
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              Os parametros ficam gravados <strong>neste banco</strong>. Ler um parametro que diz
              onde o banco esta exigiria estar conectado a ele — dependencia circular. Por isso o
              processo sobe pelo <code className="rounded bg-ink-100 px-1">.env</code>, junto do que
              ele precisa antes de existir: banco, segredo do JWT e chave de cifragem.
            </p>
            <p className="mt-3 text-sm text-ink-600">
              Ha tambem um motivo operacional: conexao editavel por tela e um caminho para trancar
              todo mundo fora do sistema com um erro de digitacao — inclusive quem foi corrigir.
              Trocar de banco e operacao de servidor: editar o{' '}
              <code className="rounded bg-ink-100 px-1">.env</code> e reiniciar o BFF.
            </p>
            <p className="mt-3 text-sm text-ink-600">
              O que muda o comportamento das consultas <strong>e</strong> parametrizavel: veja o
              grupo <strong>Banco de dados</strong> em{' '}
              <Link href="/configurador/parametros" className="underline">
                Parametros
              </Link>
              .
            </p>
          </Card>
        </>
      )}
    </div>
  )
}

function Campo({ rotulo, valor, mono = false }: { rotulo: string; valor: string; mono?: boolean }) {
  const preenchido = valor.trim() !== ''
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
