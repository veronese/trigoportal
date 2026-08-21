import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@trigo/core'

const PUBLIC_PATHS = ['/login']

/**
 * Rotas que mudaram de lugar na reorganizacao em modulos.
 * Mantidas aqui, e nao como pagina de redirect, para nao carregar componente
 * so para redirecionar — e para o link antigo continuar valendo indefinidamente.
 */
const LEGACY_ROUTES: Record<string, string> = {
  '/usuarios': '/cadastros/usuarios',
  '/parametros': '/configurador/parametros',
}

/**
 * Gate de navegacao. Verifica apenas a PRESENCA do cookie, para evitar tela
 * branca em rota protegida. A validacao real da assinatura, do usuario ativo
 * e das permissoes acontece sempre no BFF.
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value)
  const { pathname } = request.nextUrl

  const legacyTarget = LEGACY_ROUTES[pathname]
  if (legacyTarget) {
    // 308: permanente, e preserva o metodo. Cai de novo no middleware ja no
    // caminho novo, onde o gate de sessao se aplica normalmente.
    return NextResponse.redirect(new URL(legacyTarget, request.url), 308)
  }

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    if (hasSession) return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.next()
  }

  // Troca de senha: exige sessao (cai no gate abaixo se nao houver), mas nao
  // passa pelo shell do portal. Quem decide se a troca e obrigatoria e o BFF.
  if (pathname === '/trocar-senha' && hasSession) return NextResponse.next()

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Ignora o proxy do BFF, assets do Next e QUALQUER arquivo com extensao
    // (icones, manifest, sw.js, offline.html). Listar arquivo por arquivo ja
    // deixou os icones do PWA tomando redirect uma vez.
    '/((?!api/|_next/|.*\\..*).*)',
  ],
}
