import { Icon, type IconName } from '@/components/icons'

/**
 * Cabecalho de pagina no padrao Architect UI: icone em quadrado arredondado,
 * modulo acima do titulo, descricao abaixo e area de acoes a direita.
 *
 * Padroniza o topo de toda tela — antes cada pagina montava o seu, e o
 * espacamento variava de uma para outra.
 */
export function PageTitle({
  icon,
  modulo,
  titulo,
  descricao,
  acoes,
}: {
  icon: IconName
  /** Nome do modulo, exibido acima do titulo. Omita em telas de primeiro nivel. */
  modulo?: string
  titulo: string
  descricao?: React.ReactNode
  acoes?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-brand-500 shadow-card">
          <Icon name={icon} className="size-6" />
        </span>
        <div className="min-w-0">
          {modulo && (
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">{modulo}</p>
          )}
          <h1 className="text-xl font-semibold text-ink-900">{titulo}</h1>
          {descricao && <p className="mt-1 max-w-2xl text-sm text-ink-500">{descricao}</p>}
        </div>
      </div>

      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  )
}
