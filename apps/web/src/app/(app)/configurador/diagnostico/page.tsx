'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CaminhoDiagnostico, DiagnosticoResponse, ItemDiagnostico } from '@trigo/api-client'
import { PageTitle } from '@/components/page-title'
import { Alert, Badge, Button, Card, CardFlush } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

export default function DiagnosticoPage() {
  const [dados, setDados] = useState<DiagnosticoResponse | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setDados(await api.diagnostics.get())
    } catch (e) {
      setErro(e instanceof ApiError ? e.displayMessage : 'Falha ao gerar o diagnostico')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        icon="pulse"
        modulo="Configurador"
        titulo="Diagnostico do sistema"
        descricao="O que o portal precisa para funcionar, onde ele guarda as coisas e o que esta instalado neste servidor."
        acoes={
          <Button variant="secondary" loading={carregando} onClick={carregar}>
            Atualizar
          </Button>
        }
      />

      {erro && <Alert>{erro}</Alert>}
      {carregando && !dados && <p className="text-sm text-ink-500">Gerando...</p>}

      {dados && (
        <>
          {/* Os alertas vem primeiro: quem abre esta tela quer saber se ha algo
              errado, e nao ler a lista inteira para descobrir. */}
          {dados.alertas.length > 0 && (
            <Card title={`${dados.alertas.length} ponto(s) de atencao`}>
              <ul className="flex flex-col gap-2">
                {dados.alertas.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-sm text-ink-700">
                    <span
                      aria-hidden
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500"
                    />
                    {a}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Itens titulo="Execucao" itens={dados.runtime} />
            <Itens titulo="Banco do portal" itens={dados.banco} />
          </div>

          <CardFlush title="Arquivos e diretorios">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-strong bg-ink-50 text-left">
                    <Th className="w-56">Item</Th>
                    <Th>Caminho</Th>
                    <Th className="w-28">Situacao</Th>
                    <Th className="w-24 text-right">Tamanho</Th>
                  </tr>
                </thead>
                <tbody>
                  {dados.caminhos.map((c: CaminhoDiagnostico) => (
                    <tr key={c.caminho} className="border-b border-border-subtle align-top">
                      <Td className="font-semibold text-ink-900">
                        {c.nome}
                        {c.observacao && (
                          <span className="mt-0.5 block text-xs font-normal text-ink-500">
                            {c.observacao}
                          </span>
                        )}
                      </Td>
                      <Td className="break-all font-mono text-xs">{c.caminho}</Td>
                      <Td>
                        {c.existe ? (
                          <Badge tone="success">existe</Badge>
                        ) : (
                          <Badge tone="danger">ausente</Badge>
                        )}
                      </Td>
                      <Td className="text-right font-mono text-xs">
                        {c.tamanho === null || c.tamanho === undefined
                          ? '—'
                          : formatarBytes(c.tamanho)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardFlush>

          {/*
            NAO HA MAIS BOTAO DE ATUALIZAR PACOTE, e a ausencia e deliberada.
            O planejador antigo lia o package.json, consultava o registry do npm
            e montava script com rollback — tudo amarrado ao ecossistema Node,
            que o backend nao usa mais. Refazer aquilo para o `uv` e trabalho
            proprio, e nao traducao. Ate la, esta tela RELATA versao; quem
            atualiza e o servidor.
          */}
          <CardFlush
            title="Pacotes que sustentam o portal"
            actions={<span className="text-xs text-ink-500">Atualizacao pelo uv, no servidor</span>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[24rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-strong bg-ink-50 text-left">
                    <Th>Pacote</Th>
                    <Th className="w-44">Versao instalada</Th>
                  </tr>
                </thead>
                <tbody>
                  {dados.pacotes.map((p) => (
                    <tr key={p.nome} className="border-b border-border-subtle">
                      <Td className="font-mono text-xs text-ink-900">{p.nome}</Td>
                      <Td className="font-mono text-xs">
                        {p.versao === '(nao instalado)' ? (
                          <Badge tone="danger">nao instalado</Badge>
                        ) : (
                          p.versao
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardFlush>

          <p className="text-xs text-ink-400">
            Gerado em {new Date(dados.geradoEm).toLocaleString('pt-BR')}.
          </p>
        </>
      )}
    </div>
  )
}

function Itens({ titulo, itens }: { titulo: string; itens: ItemDiagnostico[] }) {
  return (
    <Card title={titulo}>
      <dl className="flex flex-col gap-3">
        {itens.map((i) => (
          <div key={i.nome} className="min-w-0">
            <dt className="text-xs font-bold uppercase tracking-wider text-ink-400">{i.nome}</dt>
            <dd className="mt-0.5 break-words text-sm text-ink-900">{i.valor}</dd>
            {i.observacao && <p className="text-xs text-ink-500">{i.observacao}</p>}
          </div>
        ))}
      </dl>
    </Card>
  )
}

/** Tamanho legivel. KB e MB dizem mais que sete digitos. */
function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-500 ${className}`}
    >
      {children}
    </th>
  )
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-top text-ink-700 ${className}`}>{children}</td>
}
