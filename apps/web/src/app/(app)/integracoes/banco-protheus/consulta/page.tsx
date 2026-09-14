'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ColunaBanco, ConsultaSqlResult, TabelaBanco } from '@trigo/core'
import { PageTitle } from '@/components/page-title'
import { Alert, Badge, Button, CardFlush } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

const LIMITES = [100, 500, 1000, 5000, 10000]

export default function ConsultaSqlPage() {
  const [sql, setSql] = useState("SELECT TOP 100 * FROM SB1020 WHERE D_E_L_E_T_ = ' '")
  const [limite, setLimite] = useState(500)
  const [resultado, setResultado] = useState<ConsultaSqlResult | null>(null)
  const [rodando, setRodando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [tabelas, setTabelas] = useState<TabelaBanco[]>([])
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [colunas, setColunas] = useState<ColunaBanco[]>([])

  const textarea = useRef<HTMLTextAreaElement>(null)

  const carregarTabelas = useCallback(async (termo: string) => {
    try {
      setTabelas(await api.protheusDb.tabelas(termo || undefined))
    } catch (e) {
      setErro(e instanceof ApiError ? e.displayMessage : 'Falha ao listar as tabelas')
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void carregarTabelas(busca), 300)
    return () => clearTimeout(t)
  }, [busca, carregarTabelas])

  async function abrir(nome: string) {
    if (aberta === nome) {
      setAberta(null)
      setColunas([])
      return
    }
    setAberta(nome)
    setColunas([])
    try {
      setColunas(await api.protheusDb.colunas(nome))
    } catch (e) {
      setErro(e instanceof ApiError ? e.displayMessage : 'Falha ao ler as colunas')
    }
  }

  async function executar() {
    setRodando(true)
    setErro(null)
    try {
      setResultado(await api.protheusDb.consultar(sql, limite))
    } catch (e) {
      setErro(e instanceof ApiError ? e.displayMessage : 'Falha ao executar a consulta')
    } finally {
      setRodando(false)
    }
  }

  /** Ctrl+Enter executa: quem escreve SQL nao quer tirar a mao do teclado. */
  function atalho(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void executar()
    }
  }

  function inserir(texto: string) {
    const campo = textarea.current
    if (!campo) return
    const inicio = campo.selectionStart
    const fim = campo.selectionEnd
    setSql(sql.slice(0, inicio) + texto + sql.slice(fim))
    // O cursor volta para depois do que foi inserido, senao cada clique na
    // lista jogaria o cursor para o comeco do texto.
    requestAnimationFrame(() => {
      campo.focus()
      campo.setSelectionRange(inicio + texto.length, inicio + texto.length)
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        icon="database"
        modulo="Integracoes"
        titulo="Consulta SQL"
        descricao="Console de leitura sobre o banco do Protheus, em todas as tabelas. Escrita e recusada: o console executa SELECT, e o login do portal e somente leitura."
        acoes={
          <Link
            href="/integracoes/banco-protheus"
            className="text-sm font-semibold text-ink-500 hover:underline"
          >
            Conexao
          </Link>
        }
      />

      {erro && <Alert>{erro}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        {/* Navegador de tabelas. Vem antes do editor na ordem de leitura porque
            e por ele que se comeca quando nao se sabe o nome da tabela. */}
        <CardFlush className="h-fit lg:sticky lg:top-4">
          <div className="border-b border-border-subtle p-3">
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar tabelas (ex: SB1)"
              aria-label="Filtrar tabelas"
              className="min-h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </div>

          <div className="max-h-[32rem] overflow-y-auto">
            {tabelas.length === 0 && (
              <p className="p-4 text-center text-sm text-ink-500">Nenhuma tabela.</p>
            )}
            <ul>
              {tabelas.map((t) => (
                <li key={`${t.esquema}.${t.nome}`} className="border-b border-border-subtle">
                  <div className="flex items-center gap-1 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void abrir(t.nome)}
                      className="min-w-0 flex-1 text-left"
                      aria-expanded={aberta === t.nome}
                    >
                      <span className="block truncate font-mono text-xs font-semibold text-ink-900">
                        {t.nome}
                      </span>
                      <span className="text-xs text-ink-400">
                        ~{t.registrosEstimados.toLocaleString('pt-BR')} registros
                      </span>
                    </button>
                    <Button variant="ghost" onClick={() => inserir(t.nome)}>
                      usar
                    </Button>
                  </div>

                  {aberta === t.nome && (
                    <ul className="border-t border-border-subtle bg-ink-50/60 px-3 py-2">
                      {colunas.length === 0 && (
                        <li className="text-xs text-ink-500">Carregando colunas...</li>
                      )}
                      {colunas.map((c) => (
                        <li key={c.nome} className="flex items-baseline justify-between gap-2 py-0.5">
                          <button
                            type="button"
                            onClick={() => inserir(c.nome)}
                            className="font-mono text-xs text-ink-700 hover:underline"
                          >
                            {c.nome}
                          </button>
                          <span className="shrink-0 text-xs text-ink-400">
                            {c.tipo}
                            {c.tamanho !== null ? `(${c.tamanho})` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </CardFlush>

        <div className="flex min-w-0 flex-col gap-4">
          <CardFlush>
            <textarea
              ref={textarea}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={atalho}
              spellCheck={false}
              rows={10}
              aria-label="Consulta SQL"
              className="w-full resize-y border-0 bg-transparent p-4 font-mono text-sm text-ink-900 outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle p-3">
              <label className="flex items-center gap-2 text-xs text-ink-500">
                Limite de linhas
                <select
                  value={limite}
                  onChange={(e) => setLimite(Number(e.target.value))}
                  className="min-h-10 rounded-lg border border-border-strong px-2 text-sm outline-none focus:border-brand-500"
                >
                  {LIMITES.map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString('pt-BR')}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-ink-400">Ctrl+Enter executa</span>
                <Button loading={rodando} onClick={executar}>
                  Executar
                </Button>
              </div>
            </div>
          </CardFlush>

          {resultado && <Resultado resultado={resultado} />}
        </div>
      </div>
    </div>
  )
}

function Resultado({ resultado }: { resultado: ConsultaSqlResult }) {
  if (!resultado.ok) return <Alert>{resultado.erro}</Alert>

  return (
    <CardFlush
      title={`${resultado.totalLinhas.toLocaleString('pt-BR')} linha(s)`}
      actions={
        <span className="flex items-center gap-2 text-xs text-ink-500">
          {resultado.truncado && <Badge tone="brand">cortado no limite</Badge>}
          {resultado.duracaoMs} ms
        </span>
      }
    >
      {resultado.totalLinhas === 0 ? (
        <p className="p-6 text-center text-sm text-ink-500">A consulta nao devolveu linhas.</p>
      ) : (
        // O scroll fica NESTE container, nao no body: consulta com 60 colunas
        // da SB1 faria a pagina inteira rolar na horizontal.
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0">
              <tr className="border-b border-border-strong bg-ink-50 text-left">
                {resultado.colunas.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-ink-500"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resultado.linhas.map((linha, i) => (
                <tr key={i} className="border-b border-border-subtle hover:bg-ink-50/60">
                  {resultado.colunas.map((c) => (
                    <td
                      key={c}
                      className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-ink-700"
                    >
                      {formatar(linha[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardFlush>
  )
}

/**
 * Valor do banco em texto.
 *
 * NULL vira um marcador visivel e nao string vazia: no Protheus, campo CHAR
 * vazio e NULL sao coisas diferentes, e confundir os dois na tela levaria a
 * conclusao errada sobre o dado.
 */
function formatar(valor: unknown): string {
  if (valor === null || valor === undefined) return 'NULL'
  if (valor instanceof Date) return valor.toISOString()
  if (typeof valor === 'object') return JSON.stringify(valor)
  if (typeof valor === 'string') return valor.trimEnd() === '' && valor !== '' ? '(espacos)' : valor
  return String(valor)
}
