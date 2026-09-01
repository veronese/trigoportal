/**
 * Icones inline, no estilo de traco do Architect UI.
 *
 * Escritos a mao em vez de instalar uma biblioteca: sao poucos, entram no
 * bundle apenas os usados, e nao criamos dependencia para desenhar retangulo
 * com canto arredondado.
 */
export type IconName =
  | 'home'
  | 'users'
  | 'settings'
  | 'sliders'
  | 'plug'
  | 'database'
  | 'account'
  | 'menu'
  | 'chevronLeft'
  | 'box'
  | 'pulse'
  | 'flask'

const PATHS: Record<IconName, React.ReactNode> = {
  // Linha de monitoramento: diagnostico do sistema.
  pulse: (
    <>
      <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
    </>
  ),
  // Erlenmeyer: fichas tecnicas de P&D.
  flask: (
    <>
      <path d="M9.5 3h5" />
      <path d="M10.5 3v6.2L5.6 17.4A2 2 0 0 0 7.3 20.5h9.4a2 2 0 0 0 1.7-3.1L13.5 9.2V3" />
      <path d="M8 15h8" />
    </>
  ),
  // Caixa em perspectiva: cadastro de produto.
  box: (
    <>
      <path d="M21 8.5 12 3.5 3 8.5v7L12 20.5l9-5v-7Z" />
      <path d="M3 8.5 12 13.5l9-5" />
      <path d="M12 13.5v7" />
    </>
  ),
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 14.6c1.9.6 3 2.2 3 4.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2" />
      <path d="M4 12h4M12 12h8" />
      <path d="M4 17h12M20 17h0" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="17" r="2" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5M15 3v5" />
      <path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 16.5V21" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18.5a6.5 6.5 0 0 1 11 0" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  chevronLeft: (
    <>
      <path d="M14.5 6 9 12l5.5 6" />
    </>
  ),
}

export function Icon({
  name,
  className = 'size-5',
}: {
  name: IconName
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  )
}
