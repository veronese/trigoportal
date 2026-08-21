/**
 * Gera todos os assets de marca a partir de UM arquivo de origem.
 *
 * Uso:
 *   pnpm add -D sharp --filter @trigo/web
 *   node apps/web/scripts/gerar-icones.mjs caminho/para/logo.png
 *
 * A origem deve ser o simbolo quadrado (espiga + anel), no maior tamanho
 * disponivel. Quando o arquivo do manual de marca estiver em maos, rode este
 * script com ele e todos os icones sao regerados de uma vez.
 *
 * Saidas em apps/web/public/:
 *   icon-192.png / icon-512.png     icones do PWA (purpose "any")
 *   icon-maskable-512.png           marca a 68%, para o recorte do Android
 *   apple-touch-icon.png            180x180, iOS
 *   favicon-32.png / favicon-16.png recorte da espiga (o anel nao le a 16px)
 *   logo-mark.png                   144x144 com mascara circular, uso no app
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
let sharp
try {
  sharp = require('sharp')
} catch {
  console.error('sharp nao encontrado. Rode: pnpm add -D sharp --filter @trigo/web')
  process.exit(1)
}

const SRC = process.argv[2]
if (!SRC) {
  console.error('Informe o arquivo de origem. Ex: node scripts/gerar-icones.mjs logo.png')
  process.exit(1)
}

const OUT = path.join(import.meta.dirname, '..', 'public')

// Descobre a cor de fundo (pixel do canto) e o bounding box real da marca,
// para o recorte nao serrar o anel nem deixar margem sobrando.
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width, height, channels } = info
const px = (x, y) => {
  const i = (y * width + x) * channels
  return [data[i], data[i + 1], data[i + 2]]
}
const bg = px(2, 2)
const diff = (c) => Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2])

let minX = width
let minY = height
let maxX = -1
let maxY = -1
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (diff(px(x, y)) > 40) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}

const side = Math.max(maxX - minX, maxY - minY) + 4
const crop = {
  left: Math.max(0, Math.round((minX + maxX) / 2 - side / 2)),
  top: Math.max(0, Math.round((minY + maxY) / 2 - side / 2)),
  width: Math.min(width, Math.round(side)),
  height: Math.min(height, Math.round(side)),
}
const BEGE = '#' + bg.map((v) => v.toString(16).padStart(2, '0')).join('')
const marca = () => sharp(SRC).extract(crop)

console.log(`origem ${width}x${height} | fundo ${BEGE} | recorte ${crop.width}x${crop.height}`)

for (const [size, name] of [
  [512, 'icon-512.png'],
  [192, 'icon-192.png'],
  [180, 'apple-touch-icon.png'],
]) {
  await marca()
    .resize(size, size, { kernel: 'lanczos3' })
    .flatten({ background: BEGE })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, name))
  console.log('gerado', name)
}

// Maskable: o Android recorta em circulo dentro da zona segura de 80%.
{
  const size = 512
  const inner = Math.round(size * 0.68)
  const buf = await marca().resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: BEGE } })
    .composite([{ input: buf, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, 'icon-maskable-512.png'))
  console.log('gerado icon-maskable-512.png')
}

// Favicon: so a espiga. O anel segmentado nao se le a 16px.
{
  const inner = Math.round(crop.width * 0.56)
  const espiga = {
    left: crop.left + Math.round((crop.width - inner) / 2),
    top: crop.top + Math.round((crop.height - inner) / 2),
    width: inner,
    height: inner,
  }
  for (const size of [32, 16]) {
    await sharp(SRC)
      .extract(espiga)
      .resize(size, size, { kernel: 'lanczos3' })
      .flatten({ background: BEGE })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, `favicon-${size}.png`))
    console.log('gerado', `favicon-${size}.png`)
  }
}

// Marca do app: mascara circular, canto transparente.
{
  const size = 144
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  )
  await marca()
    .resize(size, size, { kernel: 'lanczos3' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, 'logo-mark.png'))
  console.log('gerado logo-mark.png')
}
