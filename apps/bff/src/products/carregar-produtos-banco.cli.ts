/**
 * Carga de produtos pelo BANCO do Protheus, pela linha de comando.
 *
 * Usa o MESMO servico da rota, e o mesmo `espelhar()` da carga REST — a regra
 * do EMPORI existe em um lugar so.
 *
 * FICA EM src/ e nao em scripts/ pelo mesmo motivo do carregar-produtos: o tsx
 * compila com esbuild, que nao emite `emitDecoratorMetadata`, e sem esse
 * metadata o Nest nao resolve dependencia por tipo de construtor.
 *
 *   # empresas de PRODUTOS_EMPRESAS
 *   pnpm --filter @trigo/bff carregar-produtos-banco
 *
 *   # empresas explicitas
 *   pnpm --filter @trigo/bff carregar-produtos-banco -- --empresa 02 --empresa 09
 *
 *   # pagina maior, para carga inicial
 *   pnpm --filter @trigo/bff carregar-produtos-banco -- --tamanho 2000
 */
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import process from 'node:process'
import { AppModule } from '../app.module'
import { ProductsDbSyncService } from './products-db-sync.service'

function lerEmpresas(argv: string[]): string[] {
  const empresas: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--empresa') continue
    const valor = argv[i + 1]?.trim()
    if (valor) empresas.push(valor)
  }
  return empresas
}

function lerNumero(argv: string[], nome: string): number | undefined {
  const i = argv.indexOf(nome)
  if (i < 0) return undefined
  const n = Number(argv[i + 1])
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${nome} espera um inteiro positivo (recebi "${argv[i + 1]}")`)
  }
  return n
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const empresas = lerEmpresas(argv)
  const tamanhoPagina = lerNumero(argv, '--tamanho')

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  })
  const logger = new Logger('carregar-produtos-banco')

  try {
    const resultado = await app.get(ProductsDbSyncService).sincronizar({
      empresas: empresas.length > 0 ? empresas : undefined,
      tamanhoPagina,
    })

    console.log('')
    console.log('  empresa  EMPORI  tabela    paginas  lidos   gravados')
    console.log('  ' + '-'.repeat(54))
    for (const e of resultado.empresas) {
      console.log(
        `  ${e.empresa.padEnd(9)}${(e.empori || '(vazio)').padEnd(8)}${e.sourceTable.padEnd(10)}` +
          `${String(e.paginas).padStart(7)}${String(e.lidos).padStart(8)}${String(e.gravados).padStart(10)}`,
      )
      if (e.duplicados) {
        console.log(
          `           ${e.duplicados} codigo(s) colidiram no espelho e ficaram com o ultimo lido.`,
        )
      }
      if (e.erro) console.log(`           erro: ${e.erro}`)
    }
    console.log('  ' + '-'.repeat(54))
    console.log(
      `  total: ${resultado.gravados} gravado(s) de ${resultado.lidos} lido(s) em ${resultado.duracaoMs}ms`,
    )

    // Erro em qualquer empresa vira exit != 0: agendador precisa perceber.
    if (resultado.empresas.some((e) => e.erro)) process.exitCode = 1
  } catch (erro) {
    logger.error(erro instanceof Error ? erro.message : String(erro))
    process.exitCode = 1
  } finally {
    await app.close()
  }
}

void main()
