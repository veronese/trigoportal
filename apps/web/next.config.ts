import type { NextConfig } from 'next'

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3333'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Permite compilar sem parar o `pnpm dev`: no Windows o dev server mantem
  // lock no .next, e o build falha com EPERM. Use NEXT_DIST_DIR=.next-build.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // 'standalone' so quando o build for para container: ele cria symlinks, e o
  // Windows nega isso sem Modo de Desenvolvedor, fazendo o build local falhar
  // com EPERM depois de ja ter compilado tudo. Use NEXT_OUTPUT=standalone no CI.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  transpilePackages: ['@trigo/core', '@trigo/api-client'],
  async rewrites() {
    return [
      // O front SEMPRE fala com a propria origem. Isso mantem o cookie httpOnly
      // como same-site e evita CORS/SameSite=None no navegador.
      { source: '/api/bff/:path*', destination: `${BFF_URL}/api/:path*` },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
}

export default nextConfig
