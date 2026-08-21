import type { Metadata, Viewport } from 'next'
import { Montserrat } from 'next/font/google'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'
import './globals.css'

// Montserrat e a tipografia do site institucional (Regular/SemiBold/Bold).
// O next/font baixa e serve local: sem request para o Google em runtime.
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-montserrat',
})

export const metadata: Metadata = {
  title: 'Portal Trigo',
  description: 'Portal corporativo do Grupo Trigo integrado ao Protheus',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Portal Trigo',
  },
  icons: {
    // Favicon usa o recorte da espiga: a 16px o anel segmentado vira ruido.
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  // Grafite (--cinza-escuro): a barra do navegador nao pode ser amarela,
  // o contraste com os icones do sistema fica ruim.
  themeColor: '#2f3237',
  width: 'device-width',
  initialScale: 1,
  // Deixa o usuario dar zoom: requisito de acessibilidade.
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={montserrat.variable}>
      <body className="min-h-full antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
