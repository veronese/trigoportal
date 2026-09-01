'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  ROTULO_FASE,
  type FichaResumo,
  type PastaFichas,
  type StatusVersao,
} from '@trigo/core'
import { PageTitle } from '@/components/page-title'
import { Alert, Badge, Button, CardFlush } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

const PAGINA = 50

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

export default function FichasPage() {
  const [marcas, setMarcas] = useState<PastaFichas[]>([])
  const [linhas, setLinhas] = useState<PastaFichas[]>([])
  const [marca, setMarca] = useState<PastaFichas | null>(null)
  const [linha, setLinha] = useState<PastaFichas | null>(null)

  const [fichas, setFichas] = useState<FichaResumo[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    api.fichas
      .marcas()
      .then(setMarcas)
      .catch((e) => setErro(e instanceof ApiError ? e.displayMessage : 'Falha ao carregar as marcas'))
  }, [])

  // As linhas dependem da marca aberta: mostrar todas as linhas do portal
  // sugeriria que existe ficha onde nao existe.
  useEffect(() => {
    if (!marca) {
      setLinhas([])
      return
    }
    api.fichas.linhas(marca.id).then(setLinhas).catch(() => setLinhas([]))
  }, [marca])

  const carregar = useCallback(
    async (termo: string, restauranteId: string | undefined, linhaId: string | undefined, page: number) => {
      setLoading(true)
      setErro(null)
      try {
        const r = await api.fichas.list({
          busca: termo || undefined,
          restauranteId,
          linhaId,
          page,
          pageSize: PAGINA,
        })
        setFichas(r.data)
        setTotal(r.total)
      } catch (error) {
        setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao carregar as fichas')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    const t = setTimeout(() => void carregar(busca, marca?.id, linha?.id, pagina), 300)
    return () => clearTimeout(t)
  }, [busca, marca, linha, pagina, carregar])

  useEffect(() => {
    setPagina(1)
  }, [busca, marca, linha])

  const ultimaPagina = Math.max(1, Math.ceil(total / PAGINA))

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        icon="flask"
        modulo="Fichas Tecnicas"
        titulo="Fichas de P&D"
        descricao="Formulacao, custo e rendimento por fase de desenvolvimento. A busca alcanca o insumo: procurar por 'Leite em Po' devolve toda ficha que o usa."
      />

      {erro && <Alert>{erro}</Alert>}

      {/* Trilha de pastas. Marca e linha nao sao filtro solto: sao onde a ficha
          mora, e por isso aparecem como caminho e nao como combo. */}
      <nav aria-label="Pastas" className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setMarca(null)
            setLinha(null)
          }}
          className={`rounded-lg px-2 py-1 font-semibold transition ${
            marca ? 'text-ink-500 hover:bg-ink-100' : 'bg-ink-900 text-brand-500'
          }`}
        >
          Todas as marcas
        </button>

        {marca && (
          <>
            <span className="text-ink-300">/</span>
            <button
              type="button"
              onClick={() => setLinha(null)}
              className={`rounded-lg px-2 py-1 font-semibold transition ${
                linha ? 'text-ink-500 hover:bg-ink-100' : 'bg-ink-900 text-brand-500'
              }`}
            >
              {marca.nome}
            </button>
          </>
        )}

        {linha && (
          <>
            <span className="text-ink-300">/</span>
            <span className="rounded-lg bg-ink-900 px-2 py-1 font-semibold text-brand-500">
              {linha.nome}
            </span>
          </>
        )}
      </nav>

      {!marca && marcas.length > 0 && <Pastas pastas={marcas} aoAbrir={setMarca} />}
      {marca && !linha && linhas.length > 0 && <Pastas pastas={linhas} aoAbrir={setLinha} />}

      <CardFlush>
        <div className="border-b border-border-subtle p-4">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por codigo, nome do produto ou insumo"
            aria-label="Buscar fichas"
            className="min-h-11 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </div>

        {loading && fichas.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-500">Carregando...</p>
        )}

        {!loading && fichas.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-500">Nenhuma ficha encontrada.</p>
        )}

        {fichas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-strong bg-ink-50 text-left">
                  <Th className="w-40">Codigo</Th>
                  <Th>Produto</Th>
                  <Th className="w-32">Marca</Th>
                  <Th className="w-28">Linha</Th>
                  <Th className="w-36">Fase</Th>
                  <Th className="w-32">Versao</Th>
                  <Th className="w-28">Atualizada</Th>
                </tr>
              </thead>
              <tbody>
                {fichas.map((f) => (
                  <tr key={f.id} className="border-b border-border-subtle hover:bg-ink-50/60">
                    <Td className="font-mono font-semibold text-ink-900">
                      <Link href={`/fichas/${f.id}`} className="hover:underline">
                        {f.codigo}
                      </Link>
                    </Td>
                    <Td className="text-ink-800">
                      <Link href={`/fichas/${f.id}`} className="hover:underline">
                        {f.nome}
                      </Link>
                    </Td>
                    <Td>{f.restaurante}</Td>
                    <Td>{f.linha}</Td>
                    <Td>
                      <Badge tone="neutral">{ROTULO_FASE[f.faseAtual]}</Badge>
                    </Td>
                    <Td>
                      {f.versaoAtual === null ? (
                        <span className="text-ink-400">—</span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1">
                          <span className="font-mono text-xs">v{f.versaoAtual}</span>
                          {f.status && (
                            <Badge tone={TOM_STATUS[f.status]}>{ROTULO_STATUS[f.status]}</Badge>
                          )}
                        </span>
                      )}
                    </Td>
                    <Td className="text-xs text-ink-500">
                      {new Date(f.atualizadoEm).toLocaleDateString('pt-BR')}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGINA && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle p-3">
            <p className="text-xs text-ink-500">{total.toLocaleString('pt-BR')} ficha(s)</p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={pagina <= 1 || loading}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-ink-500">
                {pagina} / {ultimaPagina}
              </span>
              <Button
                variant="secondary"
                disabled={pagina >= ultimaPagina || loading}
                onClick={() => setPagina((p) => p + 1)}
              >
                Proxima
              </Button>
            </div>
          </div>
        )}
      </CardFlush>
    </div>
  )
}

function Pastas({
  pastas,
  aoAbrir,
}: {
  pastas: PastaFichas[]
  aoAbrir: (pasta: PastaFichas) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {pastas.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => aoAbrir(p)}
          className="flex items-center gap-3 rounded-card border border-border-subtle bg-white p-4 text-left shadow-card transition hover:border-brand-500 hover:shadow-card-hover"
        >
          <span
            aria-hidden
            className="size-10 shrink-0 rounded-lg"
            style={{ backgroundColor: p.cor ?? '#e8e8ea' }}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink-900">{p.nome}</span>
            <span className="text-xs text-ink-500">
              {p.fichas} ficha{p.fichas === 1 ? '' : 's'}
            </span>
          </span>
        </button>
      ))}
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
  return <td className={`px-4 py-2.5 align-top text-ink-700 ${className}`}>{children}</td>
}
