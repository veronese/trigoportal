'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import type {
  DiagnosticoCaminho,
  DiagnosticoSituacao,
  PlanoAtualizacao,
  RiscoAtualizacao,
  SaltoDeVersao,
  SystemDiagnostics,
} from '@trigo/core'
import { PageTitle } from '@/components/page-title'
import { Alert, Badge, Button, Card, CardFlush } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

const TOM_SITUACAO: Record<DiagnosticoSituacao, 'success' | 'brand' | 'danger' | 'neutral'> = {
  ok: 'success',
  atencao: 'brand',
  falha: 'danger',
  desconhecido: 'neutral',
}

const ROTULO_SITUACAO: Record<DiagnosticoSituacao, string> = {
  ok: 'OK',
  atencao: 'Atencao',
  falha: 'Falha',
  desconhecido: 'Indefinido',
}

const TOM_SALTO: Record<SaltoDeVersao, 'success' | 'brand' | 'danger' | 'neutral'> = {
  igual: 'success',
  patch: 'neutral',
  minor: 'brand',
  major: 'danger',
  desconhecido: 'neutral',
}

const ROTULO_SALTO: Record<SaltoDeVersao, string> = {
  igual: 'Atualizado',
  patch: 'Patch',
  minor: 'Minor',
  major: 'Major',
  desconhecido: '—',
}

export default function DiagnosticoPage() {
  const [dados, setDados] = useState<SystemDiagnostics | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [verificando, setVerificando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [impacto, setImpacto] = useState<string | null>(null)
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [plano, setPlano] = useState<PlanoAtualizacao | null>(null)
  const [planejando, setPlanejando] = useState(false)

  async function montarPlano() {
    setPlanejando(true)
    setErro(null)
    try {
      setPlano(await api.diagnostics.planejarAtualizacao(selecionados))
    } catch (error) {
      setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao montar o plano')
    } finally {
      setPlanejando(false)
    }
  }

  // Mudar a selecao invalida o plano exibido: plano antigo com selecao nova e a
  // maneira mais facil de alguem rodar o script errado.
  function alternar(nome: string) {
    setSelecionados((atual) =>
      atual.includes(nome) ? atual.filter((n) => n !== nome) : [...atual, nome],
    )
    setPlano(null)
  }

  const load = useCallback(async (comAtualizacoes: boolean) => {
    if (comAtualizacoes) setVerificando(true)
    else setCarregando(true)
    setErro(null)
    try {
      setDados(await api.diagnostics.get(comAtualizacoes))
    } catch (error) {
      setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao gerar o diagnostico')
    } finally {
      setCarregando(false)
      setVerificando(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  const desatualizados = (dados?.dependencias ?? []).filter(
    (d) => d.salto === 'major' || d.salto === 'minor',
  )
  const majors = (dados?.dependencias ?? []).filter((d) => d.salto === 'major')
  const faltando = [...(dados?.diretorios ?? []), ...(dados?.arquivos ?? [])].filter(
    (c) => c.obrigatorio && !c.existe,
  )
  const falhas = (dados?.requisitos ?? []).filter((r) => r.situacao === 'falha')

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        icon="pulse"
        modulo="Configurador"
        titulo="Diagnostico do sistema"
        descricao="Recursos exigidos, arquivos de funcionamento, programas em uso e situacao das atualizacoes. Somente leitura."
        acoes={
          <>
            <Button variant="secondary" loading={carregando} onClick={() => void load(false)}>
              Atualizar
            </Button>
            <Button loading={verificando} onClick={() => void load(true)}>
              Verificar atualizacoes
            </Button>
          </>
        }
      />

      {erro && <Alert>{erro}</Alert>}
      {carregando && !dados && <p className="text-sm text-ink-500">Gerando diagnostico...</p>}

      {dados && (
        <>
          {/* Resumo primeiro: quem abre esta tela quer saber se ha problema, nao ler 60 linhas. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Resumo
              titulo="Requisitos com falha"
              valor={falhas.length}
              tom={falhas.length === 0 ? 'ok' : 'falha'}
              nota={falhas.length === 0 ? 'Tudo atendido' : falhas.map((f) => f.nome).join(', ')}
            />
            <Resumo
              titulo="Itens obrigatorios ausentes"
              valor={faltando.length}
              tom={faltando.length === 0 ? 'ok' : 'falha'}
              nota={
                faltando.length === 0
                  ? 'Nenhum arquivo ou diretorio faltando'
                  : faltando.map((f) => f.caminho).join(', ')
              }
            />
            <Resumo
              titulo="Atualizacoes disponiveis"
              valor={dados.atualizacoesConsultadas ? desatualizados.length : null}
              tom={
                !dados.atualizacoesConsultadas
                  ? 'desconhecido'
                  : majors.length > 0
                    ? 'atencao'
                    : 'ok'
              }
              nota={
                dados.atualizacoesConsultadas
                  ? majors.length > 0
                    ? `${majors.length} de major, que exigem analise`
                    : 'Nenhuma de major'
                  : 'Use "Verificar atualizacoes"'
              }
            />
          </div>

          {dados.erroAtualizacoes && <Alert>{dados.erroAtualizacoes}</Alert>}

          {/* ---------------------------------------------------- Runtime */}
          <Card title="Runtime em execucao">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Info
                rotulo="Node.js"
                valor={`${dados.runtime.node}${dados.runtime.nodeMinimoExigido ? ` (exige ${dados.runtime.nodeMinimoExigido})` : ''}`}
              />
              <Info rotulo="Ambiente" valor={dados.runtime.ambiente || 'desenvolvimento'} />
              <Info
                rotulo="Plataforma"
                valor={`${dados.runtime.plataforma} ${dados.runtime.arquitetura}`}
              />
              <Info rotulo="CPUs" valor={String(dados.runtime.cpus)} />
              <Info
                rotulo="Memoria do processo"
                valor={`${dados.runtime.memoriaProcessoMb} MB de ${dados.runtime.memoriaSistemaMb} MB`}
              />
              <Info
                rotulo="Tempo no ar"
                valor={formatarDuracao(dados.runtime.uptimeSegundos)}
              />
              <Info rotulo="Fuso horario" valor={dados.runtime.fusoHorario} />
              <Info
                rotulo="Raiz do projeto"
                valor={dados.runtime.raizDoProjeto ?? 'nao localizada'}
                mono
              />
            </dl>
          </Card>

          {/* ------------------------------------------------- Requisitos */}
          <CardFlush>
            <Cabecalho
              titulo="Recursos que o sistema precisa"
              nota="O que tem de existir no servidor ou na rede para o portal funcionar."
            />
            <ul className="divide-y divide-border-subtle">
              {dados.requisitos.map((r) => (
                <li key={r.nome} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <Badge tone={TOM_SITUACAO[r.situacao]}>{ROTULO_SITUACAO[r.situacao]}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{r.nome}</p>
                    <p className="mt-0.5 break-words text-sm text-ink-700">{r.detalhe}</p>
                    <p className="mt-1 text-xs text-ink-500">{r.porQue}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardFlush>

          {/* ----------------------------------------------- Dependencias */}
          <CardFlush>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle p-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink-900">
                  Programas que o sistema utiliza
                </h2>
                <p className="mt-0.5 text-xs text-ink-500">
                  {dados.atualizacoesConsultadas
                    ? `Versoes mais recentes consultadas no registry do npm. Notas de impacto revisadas em ${dados.impactosRevisadosEm}.`
                    : 'A coluna "mais recente" fica vazia ate voce clicar em "Verificar atualizacoes" \u2014 e a unica parte que sai para a internet.'}
                </p>
              </div>
              {dados.atualizacoesConsultadas && (
                <Button
                  loading={planejando}
                  disabled={selecionados.length === 0}
                  onClick={() => void montarPlano()}
                >
                  Montar plano ({selecionados.length})
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-strong bg-ink-50 text-left">
                    <Th className="w-10">&nbsp;</Th>
                    <Th>Pacote</Th>
                    <Th className="w-28">Onde</Th>
                    <Th className="w-24">Declarado</Th>
                    <Th className="w-24">Instalado</Th>
                    <Th className="w-24">Recente</Th>
                    <Th className="w-28">Situacao</Th>
                    <Th className="w-24 text-right">&nbsp;</Th>
                  </tr>
                </thead>
                <tbody>
                  {dados.dependencias.map((d) => (
                    <Fragment key={`${d.workspace}-${d.nome}`}>
                      <tr
                        className={`border-b border-border-subtle align-top ${
                          d.salto === 'major' ? 'bg-danger-50/40' : 'hover:bg-ink-50/60'
                        }`}
                      >
                        <Td>
                          {/* So o que esta atras tem o que planejar. */}
                          {(d.salto === 'major' || d.salto === 'minor' || d.salto === 'patch') && (
                            <input
                              type="checkbox"
                              checked={selecionados.includes(d.nome)}
                              onChange={() => alternar(d.nome)}
                              aria-label={`Incluir ${d.nome} no plano`}
                              className="size-4 accent-brand-500"
                            />
                          )}
                        </Td>
                        <Td>
                          <p className="font-mono text-xs font-semibold text-ink-900">{d.nome}</p>
                          <p className="mt-0.5 max-w-md text-xs text-ink-500">{d.papel}</p>
                        </Td>
                        <Td className="font-mono text-xs">{d.workspace}</Td>
                        <Td className="font-mono text-xs">{d.faixaDeclarada}</Td>
                        <Td className="font-mono text-xs">{d.versaoInstalada ?? '?'}</Td>
                        <Td className="font-mono text-xs">{d.versaoMaisRecente ?? '—'}</Td>
                        <Td>
                          <Badge tone={TOM_SALTO[d.salto]}>{ROTULO_SALTO[d.salto]}</Badge>
                        </Td>
                        <Td className="text-right">
                          {d.impacto && (
                            <Button
                              variant="ghost"
                              onClick={() => setImpacto(impacto === d.nome ? null : d.nome)}
                              aria-expanded={impacto === d.nome}
                            >
                              {impacto === d.nome ? 'Fechar' : 'Impacto'}
                            </Button>
                          )}
                        </Td>
                      </tr>
                      {impacto === d.nome && d.impacto && (
                        <tr className="border-b border-border-subtle">
                          <td colSpan={8} className="bg-brand-50/40 px-4 py-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
                              Impacto de atualizar
                            </p>
                            <p className="mt-1 max-w-4xl text-sm text-ink-700">{d.impacto}</p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </CardFlush>

          {plano && <PainelPlano plano={plano} />}

          {/* --------------------------------- Diretorios e arquivos */}
          <CardFlush>
            <Cabecalho
              titulo="Diretorios do sistema"
              nota="Estrutura em disco. Itens gerados por build nao entram no versionamento."
            />
            <TabelaCaminhos itens={dados.diretorios} />
          </CardFlush>

          <CardFlush>
            <Cabecalho
              titulo="Arquivos de funcionamento"
              nota="Sem os marcados como obrigatorios, o portal nao sobe."
            />
            <TabelaCaminhos itens={dados.arquivos} mostrarTamanho />
          </CardFlush>

          <p className="text-xs text-ink-400">
            Diagnostico gerado em {new Date(dados.geradoEm).toLocaleString('pt-BR')}.
          </p>
        </>
      )}
    </div>
  )
}

const TOM_RISCO: Record<RiscoAtualizacao, 'success' | 'brand' | 'danger'> = {
  baixo: 'success',
  medio: 'brand',
  alto: 'danger',
}

function PainelPlano({ plano }: { plano: PlanoAtualizacao }) {
  const impeditivas = plano.precondicoes.filter((p) => !p.atendida && p.critica)

  return (
    <Card title="Plano de atualizacao">
      <p className="rounded-lg border border-brand-600/40 bg-brand-50 px-3 py-2 text-sm text-ink-700">
        {plano.porQueNaoExecutamos}
      </p>

      {plano.bloqueios.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-danger-700">
            Bloqueado, resolver antes
          </h3>
          <ul className="mt-2 flex flex-col gap-3">
            {plano.bloqueios.map((b) => (
              <li key={b.pacote} className="rounded-lg border border-danger-500/40 bg-danger-50 p-3">
                <p className="font-mono text-xs font-semibold text-danger-700">{b.pacote}</p>
                <p className="mt-1 text-sm text-ink-800">{b.motivo}</p>
                <p className="mt-1 text-sm text-ink-600">
                  <strong>Como resolver:</strong> {b.comoResolver}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
          Precondicoes do ambiente
        </h3>
        <ul className="mt-2 flex flex-col gap-2">
          {plano.precondicoes.map((p) => (
            <li key={p.nome} className="flex flex-wrap items-start gap-2">
              <Badge tone={p.atendida ? 'success' : p.critica ? 'danger' : 'brand'}>
                {p.atendida ? 'OK' : p.critica ? 'Impede' : 'Atencao'}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-900">
                  <strong>{p.nome}:</strong> {p.detalhe}
                </p>
                <p className="text-xs text-ink-500">{p.porQue}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {plano.grupos.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
            {plano.grupos.length} etapa(s), em ordem de risco crescente
          </h3>
          <ol className="mt-2 flex flex-col gap-3">
            {plano.grupos.map((g, i) => (
              <li key={g.nome} className="rounded-lg border border-border-subtle p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">
                    {i + 1}. {g.nome}
                  </span>
                  <Badge tone={TOM_RISCO[g.risco]}>risco {g.risco}</Badge>
                </div>
                <ul className="mt-2 flex flex-col gap-0.5">
                  {g.pacotes.map((p) => (
                    <li key={p.nome} className="font-mono text-xs text-ink-600">
                      {p.nome} {p.de} &rarr; {p.para}
                    </li>
                  ))}
                </ul>
                {g.porQueJuntos && (
                  <p className="mt-2 text-xs text-ink-500">
                    <strong>Sobem juntos:</strong> {g.porQueJuntos}
                  </p>
                )}
                {g.impacto && <p className="mt-2 text-xs text-ink-600">{g.impacto}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {plano.script && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
              Script para executar no servidor
            </h3>
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(plano.script)}
            >
              Copiar
            </Button>
          </div>
          {impeditivas.length > 0 && (
            <div className="mt-2">
              <Alert>
                {impeditivas.length} precondicao(oes) impeditiva(s):{' '}
                {impeditivas.map((p) => p.nome).join(', ')}. Resolva antes de rodar o script.
              </Alert>
            </div>
          )}
          {/* Bloco com scroll proprio: comando longo nao deve alargar a pagina. */}
          <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-ink-900 p-3 text-xs leading-relaxed text-ink-100">
            {plano.script}
          </pre>
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">Rollback</h3>
        <pre className="mt-2 overflow-auto rounded-lg border border-border-subtle bg-ink-50 p-3 text-xs text-ink-700">
          {plano.rollback.join('\n')}
        </pre>
      </div>
    </Card>
  )
}

function TabelaCaminhos({
  itens,
  mostrarTamanho = false,
}: {
  itens: DiagnosticoCaminho[]
  mostrarTamanho?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-strong bg-ink-50 text-left">
            <Th className="w-72">Caminho</Th>
            <Th>Papel</Th>
            {mostrarTamanho && <Th className="w-24">Tamanho</Th>}
            <Th className="w-40">Situacao</Th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => (
            <tr
              key={c.caminho}
              className={`border-b border-border-subtle align-top ${
                c.obrigatorio && !c.existe ? 'bg-danger-50/40' : ''
              }`}
            >
              <Td className="font-mono text-xs text-ink-900">{c.caminho}</Td>
              <Td className="text-xs text-ink-600">{c.papel}</Td>
              {mostrarTamanho && (
                <Td className="font-mono text-xs">
                  {c.tamanhoBytes !== null ? `${(c.tamanhoBytes / 1024).toFixed(1)} KB` : '—'}
                </Td>
              )}
              <Td>
                <div className="flex flex-wrap gap-1">
                  {c.existe ? (
                    <Badge tone="success">Presente</Badge>
                  ) : (
                    <Badge tone={c.obrigatorio ? 'danger' : 'neutral'}>
                      {c.obrigatorio ? 'Ausente' : 'Nao criado'}
                    </Badge>
                  )}
                  {c.gerado && <Badge tone="neutral">Gerado</Badge>}
                  {c.naoVersionado && <Badge tone="neutral">Fora do git</Badge>}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Resumo({
  titulo,
  valor,
  tom,
  nota,
}: {
  titulo: string
  valor: number | null
  tom: DiagnosticoSituacao
  nota: string
}) {
  const cor =
    tom === 'falha' ? 'text-danger-700' : tom === 'atencao' ? 'text-ink-900' : tom === 'ok' ? 'text-success-600' : 'text-ink-400'
  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-wider text-ink-400">{titulo}</p>
      <p className={`mt-1 text-3xl font-semibold ${cor}`}>{valor ?? '—'}</p>
      <p className="mt-1 text-xs text-ink-500">{nota}</p>
    </Card>
  )
}

function Cabecalho({ titulo, nota }: { titulo: string; nota: string }) {
  return (
    <div className="border-b border-border-subtle p-4">
      <h2 className="text-sm font-semibold text-ink-900">{titulo}</h2>
      <p className="mt-0.5 text-xs text-ink-500">{nota}</p>
    </div>
  )
}

function Info({ rotulo, valor, mono = false }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-wider text-ink-400">{rotulo}</dt>
      <dd className={`mt-1 break-words text-sm text-ink-900 ${mono ? 'font-mono text-xs' : ''}`}>
        {valor}
      </dd>
    </div>
  )
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
  return <td className={`px-4 py-2.5 text-ink-700 ${className}`}>{children}</td>
}

function formatarDuracao(segundos: number): string {
  if (segundos < 60) return `${segundos}s`
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `${minutos}min`
  const horas = Math.floor(minutos / 60)
  return `${horas}h ${minutos % 60}min`
}
