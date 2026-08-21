/**
 * Roda a carga de produtos pela linha de comando.
 *
 * Usa o MESMO servico que a rota POST /api/products/sync — nao ha uma segunda
 * implementacao da regra. A diferenca e so a porta de entrada: um contexto
 * Nest sem camada HTTP, o que dispensa sessao de usuario. Serve para carga
 * inicial, para agendamento no servidor e para diagnostico.
 *
 * FICA EM src/ e nao em scripts/ de proposito: o tsx compila com esbuild, que
 * NAO emite `emitDecoratorMetadata`. Sem esse metadata o Nest nao resolve
 * dependencia por tipo de construtor, e o contexto morre em
 * UndefinedDependencyException. Compilado pelo tsc via `nest build`, funciona.
 *
 *   # empresas de PRODUTOS_EMPRESAS, filial vinda de tp_companies
 *   pnpm --filter @trigo/bff carregar-produtos
 *
 *   # tenant explicito, um ou vários
 *   pnpm --filter @trigo/bff carregar-produtos -- --tenant 02,0201 --tenant 09,0901
 *
 *   # so as inclusoes desde uma data (ver ressalva sobre B1_USERLGA)
 *   pnpm --filter @trigo/bff carregar-produtos -- --desde 2026-08-01
 *
 *   # carga de teste: so os 100 primeiros de cada empresa
 *   pnpm --filter @trigo/bff carregar-produtos -- --tamanho 100 --paginas 1
 */
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import process from 'node:process'
import { AppModule } from '../app.module'
import { ProductsSyncService } from './products-sync.service'
import type { ProtheusTenant } from '../protheus/protheus.client'

/** `--tenant 02,0201` repetido vira uma lista. */
function lerTenants(argv: string[]): ProtheusTenant[] {
  const tenants: ProtheusTenant[] = []

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--tenant') continue
    const bruto = argv[i + 1]
    if (!bruto) continue

    const [empresa, filial] = bruto.split(',').map((p) => p.trim())
    if (!empresa || !filial) {
      throw new Error(`--tenant precisa de empresa,filial (recebi "${bruto}")`)
    }
    tenants.push({ empresa, filial })
  }

  return tenants
}

function lerDesde(argv: string[]): string | undefined {
  const i = argv.indexOf('--desde')
  const valor = i >= 0 ? argv[i + 1]?.trim() : undefined
  if (valor && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new Error(`--desde espera YYYY-MM-DD (recebi "${valor}")`)
  }
  return valor || undefined
}

/** Numero opcional de argumento, validado. */
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
  const tenants = lerTenants(argv)
  const desdeData = lerDesde(argv)
  const tamanhoPagina = lerNumero(argv, '--tamanho')
  const maximoPaginas = lerNumero(argv, '--paginas')

  // Contexto sem HTTP: sobe os providers e nada de servidor nem de guards.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  })
  const logger = new Logger('carregar-produtos')

  try {
    const resultado = await app.get(ProductsSyncService).sincronizar({
      tenants: tenants.length > 0 ? tenants : undefined,
      desdeData,
      tamanhoPagina,
      maximoPaginas,
    })

    console.log('')
    console.log('  empresa  filial  EMPORI  tabela    paginas  lidos  gravados')
    console.log('  ' + '-'.repeat(62))
    for (const e of resultado.empresas) {
      console.log(
        `  ${e.empresa.padEnd(9)}${e.filial.padEnd(8)}${(e.empori || '(vazio)').padEnd(8)}` +
          `${e.sourceTable.padEnd(10)}${String(e.paginas).padStart(7)}${String(e.lidos).padStart(7)}` +
          `${String(e.gravados).padStart(10)}`,
      )
      if (e.erro) console.log(`           erro: ${e.erro}`)
    }
    console.log('  ' + '-'.repeat(62))
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
