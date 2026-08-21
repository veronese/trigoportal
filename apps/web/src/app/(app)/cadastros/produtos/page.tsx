'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { can, type ProductSyncResult, type PublicProduct, type Role } from '@trigo/core'
import { PageTitle } from '@/components/page-title'
import { Alert, Badge, Button, CardFlush } from '@/components/ui'
import { useSession } from '@/components/session-provider'
import { ApiError, api } from '@/lib/api'

/** Empresas que o portal espelha. Vazio = sem filtro. */
const FILTROS_EMPRESA = [
  { valor: '', rotulo: 'Todas as empresas' },
  { valor: '02', rotulo: 'Empresa 02 — SB1020' },
  { valor: '09', rotulo: 'Empresa 09 — SB1090' },
]

const PAGINA = 50

export default function ProdutosPage() {
  const { user } = useSession()
  const role = user?.role as Role | undefined
  const podeCarregar = role ? can(role, 'products:sync') : false

  const [produtos, setProdutos] = useState<PublicProduct[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [search, setSearch] = useState('')
  const [empori, setEmpori] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const load = useCallback(async (termo: string, empresa: string, page: number) => {
    setLoading(true)
    setErro(null)
    try {
      const r = await api.products.list({
        search: termo || undefined,
        // String vazia e um EMPORI valido, entao "Todas" precisa virar
        // undefined — senao filtraria por empresa de codigo vazio.
        empori: empresa || undefined,
        page,
        pageSize: PAGINA,
      })
      setProdutos(r.data)
      setTotal(r.total)
    } catch (error) {
      setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao carregar produtos')
    } finally {
      setLoading(false)
    }
  }, [])

  // Busca com atraso: sem isso, cada tecla dispara uma consulta.
  useEffect(() => {
    const t = setTimeout(() => void load(search, empori, pagina), 300)
    return () => clearTimeout(t)
  }, [search, empori, pagina, load])

  // Trocar filtro com a pagina 7 aberta mostraria "nenhum resultado" mesmo
  // havendo registros. Volta para a primeira.
  useEffect(() => {
    setPagina(1)
    setAberto(null)
  }, [search, empori])

  async function carregarDoProtheus() {
    setCarregando(true)
    setErro(null)
    setAviso(null)
    try {
      const r: ProductSyncResult = await api.products.sync()
      const falhas = r.empresas.filter((e) => e.erro)
      setAviso(
        `Carga concluida: ${r.gravados} produto(s) de ${r.lidos} lido(s).` +
          (falhas.length > 0
            ? ` ${falhas.length} empresa(s) nao carregaram — ${falhas.map((f) => `${f.empresa}: ${f.erro}`).join(' | ')}`
            : ''),
      )
      await load(search, empori, pagina)
    } catch (error) {
      setErro(error instanceof ApiError ? error.displayMessage : 'Falha ao carregar do Protheus')
    } finally {
      setCarregando(false)
    }
  }

  const ultimaPagina = Math.max(1, Math.ceil(total / PAGINA))
  const primeiroDaPagina = total === 0 ? 0 : (pagina - 1) * PAGINA + 1
  const ultimoDaPagina = Math.min(pagina * PAGINA, total)

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        icon="box"
        modulo="Cadastros"
        titulo="Produtos"
        descricao="Consulta do cadastro unificado das empresas, espelhado do Protheus. A coluna EMPORI identifica a empresa de origem."
        acoes={
          podeCarregar && (
            <Button variant="secondary" loading={carregando} onClick={carregarDoProtheus}>
              Carregar do Protheus
            </Button>
          )
        }
      />

      {erro && <Alert>{erro}</Alert>}
      {aviso && <Alert tone="success">{aviso}</Alert>}

      <CardFlush>
        <div className="flex flex-wrap gap-3 border-b border-border-subtle p-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por codigo ou descricao"
            aria-label="Buscar produtos"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
          <select
            value={empori}
            onChange={(e) => setEmpori(e.target.value)}
            aria-label="Filtrar por empresa de origem"
            className="min-h-11 rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          >
            {FILTROS_EMPRESA.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>

        {loading && produtos.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-500">Carregando...</p>
        )}

        {!loading && produtos.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-sm text-ink-500">Nenhum produto encontrado.</p>
            {total === 0 && search === '' && empori === '' && podeCarregar && (
              <p className="mt-1 text-xs text-ink-400">
                O espelho esta vazio. Use &ldquo;Carregar do Protheus&rdquo;.
              </p>
            )}
          </div>
        )}

        {produtos.length > 0 && (
          // A tabela tem 8 colunas e nao cabe em tela de celular. O scroll fica
          // NESTE container, nao no body: a pagina inteira rolando na
          // horizontal e o efeito que se quer evitar.
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-strong bg-ink-50 text-left">
                  <Th className="w-32">Codigo</Th>
                  <Th>Descricao</Th>
                  <Th className="w-16">Tipo</Th>
                  <Th className="w-16">UM</Th>
                  <Th className="w-20">Grupo</Th>
                  <Th className="w-32">NCM</Th>
                  <Th className="w-24">Origem</Th>
                  <Th className="w-28">Situacao</Th>
                  <Th className="w-24 text-right">&nbsp;</Th>
                </tr>
              </thead>

              <tbody>
                {produtos.map((item) => {
                  const expandido = aberto === item.id
                  return (
                    <Fragment key={item.id}>
                      <tr
                        className={`border-b border-border-subtle align-top ${
                          expandido ? 'bg-brand-50/60' : 'hover:bg-ink-50/60'
                        }`}
                      >
                        <Td className="font-mono font-semibold text-ink-900">{item.code}</Td>
                        <Td className="text-ink-800">{item.description}</Td>
                        <Td>{item.type ?? '—'}</Td>
                        <Td>{item.unit ?? '—'}</Td>
                        <Td className="font-mono text-xs">{item.group ?? '—'}</Td>
                        <Td className="font-mono text-xs">{item.ncm ?? '—'}</Td>
                        <Td>
                          <Badge tone="neutral">{item.empori || '(vazio)'}</Badge>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {item.isBlocked && <Badge tone="danger">Bloqueado</Badge>}
                            {!item.isActive && <Badge tone="neutral">Inativo</Badge>}
                            {!item.isBlocked && item.isActive && (
                              <Badge tone="success">Liberado</Badge>
                            )}
                          </div>
                        </Td>
                        <Td className="text-right">
                          <Button
                            variant="ghost"
                            onClick={() => setAberto(expandido ? null : item.id)}
                            aria-expanded={expandido}
                          >
                            {expandido ? 'Fechar' : 'Detalhes'}
                          </Button>
                        </Td>
                      </tr>

                      {expandido && (
                        <tr className="border-b border-border-subtle">
                          <td colSpan={9} className="bg-brand-50/30 px-4 py-4">
                            <Detalhes produto={item} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle p-3">
            <p className="text-xs text-ink-500">
              {primeiroDaPagina}–{ultimoDaPagina} de {total.toLocaleString('pt-BR')} produto(s)
            </p>
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

/** Somente leitura: o Protheus e o dono do cadastro. */
function Detalhes({ produto }: { produto: PublicProduct }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <Campo rotulo="Tabela de origem" valor={produto.sourceTable} mono />
      <Campo rotulo="Modelo fiscal" valor={produto.fiscalModel} />
      <Campo rotulo="Armazem padrao" valor={produto.defaultWarehouse} />
      <Campo rotulo="Centro de custo" valor={produto.costCenter} mono />
      <Campo rotulo="Conta de receita" valor={produto.revenueAccount} mono />
      <Campo rotulo="Conta de despesa" valor={produto.expenseAccount} mono />
      <Campo rotulo="Conta do ativo" valor={produto.assetAccount} mono />
      <Campo rotulo="Sincronizado em" valor={new Date(produto.syncedAt).toLocaleString('pt-BR')} />
    </dl>
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
