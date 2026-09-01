'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  ROTULO_FASE,
  type EtapaCalculada,
  type ItemCalculado,
  type StatusVersao,
  type VersaoDetalhe,
} from '@trigo/core'
import { useSession } from '@/components/session-provider'
import { PageTitle } from '@/components/page-title'
import { Alert, Badge, Card, CardFlush } from '@/components/ui'
import { ApiError, api } from '@/lib/api'

const ROTULO_STATUS: Record<StatusVersao, string> = {
  rascunho: 'Rascunho',
  em_aprovacao: 'Em aprovacao',
  vigente: 'Vigente',
  obsoleta: 'Obsoleta',
}

const TOM_STATUS: Record<StatusVersao, 'neutral' | 'brand' | 'success' | 'danger'> = {
  rascunho: 'neutral',
  em_aprovacao: 'brand',
  vigente: 'success',
  obsoleta: 'neutral',
}

const ROTULO_AREA: Record<string, string> = {
  pd: 'P&D',
  qualidade: 'Qualidade',
  fabrica: 'Fabrica',
  producao: 'Producao',
}

const ROTULO_MODO: Record<string, string> = {
  fixa: 'Fixa',
  proporcional: 'Proporcional',
  multiplo_lote: 'Multiplo do lote',
  saida_etapa: 'Saida de etapa',
  coef_rend: 'Coef. do rendimento',
  coef_linha: 'Coef. de outro item',
}

const kg = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const brl = (n: number, casas = 2) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas })

export default function VersaoPage() {
  const params = useParams<{ versaoId: string }>()
  const { hasPermission } = useSession()
  const veCusto = hasPermission('fichas:custo')

  const [versao, setVersao] = useState<VersaoDetalhe | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!params?.versaoId) return
    api.fichas
      .versao(params.versaoId)
      .then(setVersao)
      .catch((e) => setErro(e instanceof ApiError ? e.displayMessage : 'Falha ao carregar a versao'))
  }, [params?.versaoId])

  if (erro) return <Alert>{erro}</Alert>
  if (!versao) return <p className="text-sm text-ink-500">Carregando...</p>

  const c = versao.calculo
  const erros = c.validacoes.filter((v) => v.nivel === 'erro')
  const avisos = c.validacoes.filter((v) => v.nivel === 'aviso')

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        icon="flask"
        modulo={`Fichas Tecnicas · ${ROTULO_FASE[versao.fase]}`}
        titulo={`${versao.fichaNome} — v${versao.versaoFormula}`}
        descricao={
          <>
            <span className="font-mono font-semibold text-ink-700">{versao.fichaCodigo}</span>
            {versao.revisaoDocumental ? ` · revisao documental ${versao.revisaoDocumental}` : ''}
            {versao.revisaoProtheus ? ` · revisao Protheus ${versao.revisaoProtheus}` : ''}
            {versao.motivo ? ` · ${versao.motivo}` : ''}
          </>
        }
        acoes={
          <>
            <Badge tone={TOM_STATUS[versao.status]}>{ROTULO_STATUS[versao.status]}</Badge>
            <Link
              href={`/fichas/${versao.fichaId}`}
              className="text-sm font-semibold text-ink-500 hover:underline"
            >
              Voltar a ficha
            </Link>
          </>
        }
      />

      {erros.map((v) => (
        <Alert key={v.mensagem}>{v.mensagem}</Alert>
      ))}

      {/* De onde vem o numero. Uma versao congelada responde o custo DA EPOCA,
          e nao o de hoje — sem dizer isso, um custo desatualizado pareceria
          erro de calculo. */}
      <p className="text-xs text-ink-500">
        {versao.calculoCongelado
          ? `Numeros congelados em ${versao.congeladoEm ? new Date(versao.congeladoEm).toLocaleDateString('pt-BR') : 'data nao registrada'}. Mudanca no custo do insumo nao altera esta versao.`
          : 'Rascunho: os numeros sao recalculados a cada abertura, com os precos atuais dos insumos.'}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rotulo="Rendimento da batida" valor={`${kg(c.rendimentoFinal)} kg`} />
        <Kpi
          rotulo="Unidades por batida"
          valor={c.unidadesPorBatida.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
          nota={versao.pesoUnitario ? `${kg(versao.pesoUnitario)} kg por unidade` : undefined}
        />
        {veCusto && <Kpi rotulo="Custo da batida" valor={brl(c.custoBatida)} />}
        {veCusto && (
          <Kpi
            rotulo="Custo por kg"
            valor={brl(c.custoKg, 4)}
            nota={`${brl(c.custoUnidade, 4)} por unidade`}
          />
        )}
      </div>

      {veCusto && c.precoVenda !== null && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi rotulo="Preco de venda" valor={brl(c.precoVenda)} />
          <Kpi rotulo="CMV" valor={c.cmv === null ? '—' : `${(c.cmv * 100).toFixed(2)}%`} />
          <Kpi
            rotulo="Margem"
            valor={c.margemReais === null ? '—' : brl(c.margemReais)}
            nota={c.margemPct === null ? undefined : `${(c.margemPct * 100).toFixed(2)}%`}
          />
        </div>
      )}

      {avisos.length > 0 && (
        <Card title="Avisos do calculo">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-700">
            {avisos.map((v) => (
              <li key={v.mensagem}>{v.mensagem}</li>
            ))}
          </ul>
        </Card>
      )}

      {c.etapas.map((etapa) => (
        <EtapaCard key={etapa.id} etapa={etapa} veCusto={veCusto} />
      ))}

      {c.embalagens.map((emb) => (
        <CardFlush
          key={emb.id}
          title={emb.nome}
          actions={veCusto ? <span className="text-xs text-ink-500">{brl(emb.custo)}</span> : null}
        >
          <TabelaItens itens={emb.itens} veCusto={veCusto} mostrarPercentual={false} />
        </CardFlush>
      ))}

      {versao.aprovacoes.length > 0 && (
        <Card title="Aprovacoes">
          <ul className="flex flex-col gap-2">
            {versao.aprovacoes.map((a) => (
              <li key={a.area} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 font-semibold text-ink-900">
                  {ROTULO_AREA[a.area] ?? a.area}
                </span>
                <Badge
                  tone={
                    a.status === 'aprovado'
                      ? 'success'
                      : a.status === 'reprovado'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {a.status}
                </Badge>
                {a.decididoPor && (
                  <span className="text-ink-600">
                    {a.decididoPor}
                    {a.decididoEm ? ` · ${new Date(a.decididoEm).toLocaleDateString('pt-BR')}` : ''}
                  </span>
                )}
                {a.comentario && <span className="text-ink-500">{a.comentario}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function EtapaCard({ etapa, veCusto }: { etapa: EtapaCalculada; veCusto: boolean }) {
  return (
    <CardFlush
      title={etapa.nome}
      actions={
        <span className="text-xs text-ink-500">
          {kg(etapa.total)} kg insumidos → {kg(etapa.rendimento)} kg
          {veCusto ? ` · ${brl(etapa.custo)} · ${brl(etapa.custoKg, 4)}/kg` : ''}
        </span>
      }
    >
      <TabelaItens itens={etapa.itens} veCusto={veCusto} mostrarPercentual={etapa.usaPercentual} />

      {etapa.perdas.length > 0 && (
        <div className="border-t border-border-subtle px-5 py-4 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Perdas</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-700">
            {etapa.perdas.map((p) => (
              <li key={p.nome} className="flex flex-wrap justify-between gap-2">
                <span>
                  {p.nome}
                  {/* Rateada nao e detalhe cosmetico: ela e dividida pela media
                      de batidas, e sem a marca o numero parece errado. */}
                  {p.rateada && <span className="ml-1 text-xs text-ink-400">(rateada)</span>}
                </span>
                <span className="font-mono text-xs">
                  {kg(p.valorKg)} {p.unidade} · {(p.pct * 100).toFixed(2)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardFlush>
  )
}

function TabelaItens({
  itens,
  veCusto,
  mostrarPercentual,
}: {
  itens: ItemCalculado[]
  veCusto: boolean
  mostrarPercentual: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-strong bg-ink-50 text-left">
            <Th className="w-28">Codigo</Th>
            <Th>Insumo</Th>
            <Th className="w-16">UM</Th>
            <Th className="w-40">Modo</Th>
            <Th className="w-28 text-right">Quantidade</Th>
            {mostrarPercentual && <Th className="w-20 text-right">%</Th>}
            {veCusto && <Th className="w-28 text-right">Preco</Th>}
            {veCusto && <Th className="w-28 text-right">Valor</Th>}
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id} className="border-b border-border-subtle">
              <Td className="font-mono text-xs text-ink-900">{item.codigo}</Td>
              <Td className="text-ink-800">
                {item.descricao}
                {item.provisorio && (
                  <span className="ml-2">
                    <Badge tone="brand">provisorio</Badge>
                  </span>
                )}
              </Td>
              <Td className="text-xs">{item.unidade}</Td>
              <Td className="text-xs text-ink-500">{ROTULO_MODO[item.modo] ?? item.modo}</Td>
              <Td className="text-right font-mono text-xs">
                {item.qtdResolvida.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
              </Td>
              {mostrarPercentual && (
                <Td className="text-right font-mono text-xs">{(item.pct * 100).toFixed(2)}%</Td>
              )}
              {veCusto && (
                <Td className="text-right font-mono text-xs">{brl(item.preco, 4)}</Td>
              )}
              {veCusto && <Td className="text-right font-mono text-xs">{brl(item.valor)}</Td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-white p-4 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wider text-ink-400">{rotulo}</p>
      <p className="mt-1 text-lg font-semibold text-ink-900">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-ink-500">{nota}</p>}
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
