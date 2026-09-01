'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  ORDEM_DAS_FASES,
  ROTULO_FASE,
  type AvaliacaoPromocao,
  type FaseFicha,
  type FaseResumo,
  type FichaDetalhe,
  type StatusVersao,
} from '@trigo/core'
import { PageTitle } from '@/components/page-title'
import { Alert, Badge, CardFlush } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

const TOM_STATUS: Record<StatusVersao, 'neutral' | 'brand' | 'success' | 'danger'> = {
  rascunho: 'neutral',
  em_aprovacao: 'brand',
  vigente: 'success',
  obsoleta: 'neutral',
}

const ROTULO_STATUS: Record<StatusVersao, string> = {
  rascunho: 'Rascunho',
  em_aprovacao: 'Em aprovacao',
  vigente: 'Vigente',
  obsoleta: 'Obsoleta',
}

export default function FichaPage() {
  const params = useParams<{ id: string }>()
  const [ficha, setFicha] = useState<FichaDetalhe | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!params?.id) return
    api.fichas
      .get(params.id)
      .then(setFicha)
      .catch((e) => setErro(e instanceof ApiError ? e.displayMessage : 'Falha ao carregar a ficha'))
  }, [params?.id])

  if (erro) return <Alert>{erro}</Alert>
  if (!ficha) return <p className="text-sm text-ink-500">Carregando...</p>

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        icon="flask"
        modulo="Fichas Tecnicas"
        titulo={ficha.nome}
        descricao={
          <>
            <span className="font-mono font-semibold text-ink-700">{ficha.codigo}</span>
            {' · '}
            {ficha.restaurante.nome} · {ficha.linha.nome}
            {ficha.categoria ? ` · ${ficha.categoria}` : ''}
          </>
        }
        acoes={
          <Link href="/fichas" className="text-sm font-semibold text-ink-500 hover:underline">
            Voltar as fichas
          </Link>
        }
      />

      <Trilha fases={ficha.fases} />

      {ficha.fases.map((fase) => (
        <FaseCard key={fase.id} fase={fase} />
      ))}
    </div>
  )
}

/**
 * A trilha das tres fases, com as ausentes visiveis em cinza.
 *
 * Mostrar o que NAO existe e o ponto: uma ficha que so tem FT Producao veio de
 * fora do portal, e esconder as fases anteriores faria parecer que ela passou
 * por elas.
 */
function Trilha({ fases }: { fases: FaseResumo[] }) {
  const existentes = new Set(fases.map((f) => f.fase))

  return (
    <ol className="flex flex-wrap items-center gap-2">
      {ORDEM_DAS_FASES.map((fase: FaseFicha, i) => {
        const tem = existentes.has(fase)
        return (
          <li key={fase} className="flex items-center gap-2">
            <span
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                tem
                  ? 'border-ink-900 bg-ink-900 text-brand-500'
                  : 'border-dashed border-border-strong bg-white text-ink-400'
              }`}
            >
              {ROTULO_FASE[fase]}
              {!tem && <span className="ml-1 text-xs font-normal">(nao percorrida)</span>}
            </span>
            {i < ORDEM_DAS_FASES.length - 1 && <span className="text-ink-300">→</span>}
          </li>
        )
      })}
    </ol>
  )
}

function FaseCard({ fase }: { fase: FaseResumo }) {
  const [promocao, setPromocao] = useState<AvaliacaoPromocao | null>(null)

  // O que impede promover vem do BFF e nao de regra repetida na tela: a mesma
  // avaliacao que bloqueia a chamada explica o bloqueio aqui.
  useEffect(() => {
    api.fichas.avaliarPromocao(fase.id).then(setPromocao).catch(() => setPromocao(null))
  }, [fase.id])

  return (
    <CardFlush
      title={ROTULO_FASE[fase.fase]}
      actions={
        <span className="text-xs text-ink-500">
          {fase.quantidadeAlvoKg !== null
            ? `${fase.quantidadeAlvoKg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
            : 'sem quantidade alvo'}
          {fase.linhaProducao ? ` · ${fase.linhaProducao}` : ''}
        </span>
      }
    >
      {fase.origem && (
        <p className="border-b border-border-subtle px-5 py-3 text-xs text-ink-500 sm:px-6">
          Promovida de {ROTULO_FASE[fase.origem.faseOrigem]}, versao {fase.origem.versaoFormula}.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-strong bg-ink-50 text-left">
              <Th className="w-24">Versao</Th>
              <Th className="w-28">Revisao doc.</Th>
              <Th>Motivo</Th>
              <Th className="w-32">Situacao</Th>
              <Th className="w-32 text-right">Rendimento</Th>
              <Th className="w-32 text-right">Custo / kg</Th>
              <Th className="w-28">Congelada</Th>
            </tr>
          </thead>
          <tbody>
            {fase.versoes.map((v) => (
              <tr key={v.id} className="border-b border-border-subtle hover:bg-ink-50/60">
                <Td className="font-mono font-semibold text-ink-900">
                  <Link href={`/fichas/versoes/${v.id}`} className="hover:underline">
                    v{v.versaoFormula}
                  </Link>
                </Td>
                {/* A revisao do documento e independente do contador interno:
                    v1 pode ser revisao "000". As duas aparecem lado a lado
                    justamente para nao serem confundidas. */}
                <Td className="font-mono text-xs">{v.revisaoDocumental ?? '—'}</Td>
                <Td className="text-ink-700">{v.nome ?? v.motivo ?? '—'}</Td>
                <Td>
                  <Badge tone={TOM_STATUS[v.status]}>{ROTULO_STATUS[v.status]}</Badge>
                </Td>
                <Td className="text-right font-mono text-xs">
                  {v.rendimentoKg === null
                    ? '—'
                    : `${v.rendimentoKg.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`}
                </Td>
                <Td className="text-right font-mono text-xs">
                  {v.custoKg === null
                    ? '—'
                    : v.custoKg.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                        minimumFractionDigits: 4,
                      })}
                </Td>
                <Td className="text-xs text-ink-500">
                  {v.congeladoEm ? new Date(v.congeladoEm).toLocaleDateString('pt-BR') : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {promocao && (
        <div className="border-t border-border-subtle px-5 py-4 sm:px-6">
          {promocao.destino === null ? (
            <p className="text-xs text-ink-500">Ultima fase do desenvolvimento.</p>
          ) : promocao.permitido ? (
            <p className="text-xs font-semibold text-success-600">
              Pronta para promover para {ROTULO_FASE[promocao.destino]}.
            </p>
          ) : (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
                Falta para promover para {ROTULO_FASE[promocao.destino]}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {promocao.impedimentos.map((i) => (
                  <li key={i.motivo} className="text-sm text-ink-700">
                    {i.motivo}{' '}
                    <span className="text-ink-500">{i.comoResolver}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </CardFlush>
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
  return <td className={`px-4 py-2.5 align-top text-ink-700 ${className}`}>{children}</td>
}
