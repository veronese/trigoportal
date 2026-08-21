/**
 * Marca do portal.
 *
 * O simbolo e o logo institucional do Grupo Trigo (espiga + anel segmentado
 * com as cores das marcas do grupo), em `public/logo-mark.png` com mascara
 * circular. Os icones do PWA e o favicon saem do mesmo arquivo de origem.
 *
 * Para trocar por um arquivo de maior qualidade, substitua os assets em
 * `public/` — nenhum componente precisa mudar.
 */

export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
    />
  )
}

export function Logo({
  size = 'md',
  inverted = false,
}: {
  size?: 'md' | 'lg'
  inverted?: boolean
}) {
  const markSize = size === 'lg' ? 52 : 36
  const textSize = size === 'lg' ? 'text-lg' : 'text-sm'

  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={markSize} />
      <span className={`${textSize} leading-none tracking-tight`}>
        <span className={inverted ? 'font-medium text-ink-200' : 'font-medium text-ink-500'}>
          Portal{' '}
        </span>
        <span className={inverted ? 'font-bold text-white' : 'font-bold text-ink-900'}>Trigo</span>
      </span>
    </span>
  )
}
