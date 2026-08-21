/**
 * Imprime o diagnostico do sistema no terminal.
 *
 * Usa o MESMO servico da tela — nao ha uma segunda implementacao. Existe porque
 * durante uma implantacao a interface pode ainda nao subir, e e exatamente
 * nesse momento que se precisa saber qual arquivo falta ou qual variavel de
 * ambiente esta vazia.
 *
 * Fica em src/ e nao em scripts/ pelo mesmo motivo do CLI de produtos: o tsx
 * compila com esbuild, que nao emite emitDecoratorMetadata, e sem isso a
 * injecao de dependencia do Nest nao resolve.
 *
 *   pnpm --filter @trigo/bff diagnostico
 *   pnpm --filter @trigo/bff diagnostico -- --atualizacoes
 *   pnpm --filter @trigo/bff diagnostico -- --plano prisma,@prisma/client
 */
import { NestFactory } from '@nestjs/core'
import process from 'node:process'
import { AppModule } from '../app.module'
import { DiagnosticsService } from './diagnostics.service'
import { UpdatePlannerService } from './update-planner.service'

const SITUACAO: Record<string, string> = {
  ok: '[ ok ]',
  atencao: '[aten]',
  falha: '[FALHA]',
  desconhecido: '[ ?  ]',
}

function titulo(texto: string): void {
  console.log('')
  console.log('  ' + texto)
  console.log('  ' + '-'.repeat(texto.length))
}

async function main(): Promise<void> {
  const comAtualizacoes = process.argv.includes('--atualizacoes')
  const iPlano = process.argv.indexOf('--plano')
  const pacotesDoPlano =
    iPlano >= 0
      ? (process.argv[iPlano + 1] ?? '').split(',').map((p) => p.trim()).filter(Boolean)
      : []

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] })
  try {
    if (pacotesDoPlano.length > 0) {
      await imprimirPlano(app, pacotesDoPlano)
      return
    }
    const d = await app.get(DiagnosticsService).diagnosticar(comAtualizacoes)

    titulo('Runtime')
    console.log(`  Node             ${d.runtime.node}  (exigido ${d.runtime.nodeMinimoExigido ?? 'nao declarado'})`)
    console.log(`  Plataforma       ${d.runtime.plataforma} ${d.runtime.arquitetura}`)
    console.log(`  Ambiente         ${d.runtime.ambiente || 'desenvolvimento (NODE_ENV vazio)'}`)
    console.log(`  Memoria          ${d.runtime.memoriaProcessoMb} MB no processo, ${d.runtime.memoriaSistemaMb} MB na maquina`)
    console.log(`  CPUs             ${d.runtime.cpus}`)
    console.log(`  Raiz do projeto  ${d.runtime.raizDoProjeto ?? 'NAO ENCONTRADA'}`)

    titulo('Recursos exigidos')
    for (const r of d.requisitos) {
      console.log(`  ${SITUACAO[r.situacao]} ${r.nome.padEnd(26)} ${r.detalhe}`)
    }

    titulo('Diretorios')
    for (const c of d.diretorios) {
      const marca = c.existe ? '     ' : c.obrigatorio ? 'FALTA' : '  -  '
      console.log(`  ${marca} ${c.caminho}`)
    }

    titulo('Arquivos principais')
    for (const c of d.arquivos) {
      const marca = c.existe ? '     ' : c.obrigatorio ? 'FALTA' : '  -  '
      const tam = c.tamanhoBytes !== null ? `${(c.tamanhoBytes / 1024).toFixed(1)} KB` : ''
      console.log(`  ${marca} ${c.caminho.padEnd(44)} ${tam}`)
    }

    titulo('Dependencias')
    console.log('  situacao  pacote                        declarado      instalado    mais recente')
    for (const dep of d.dependencias) {
      const marca =
        dep.salto === 'major' ? '[MAJOR]' : dep.salto === 'igual' ? '[ ok  ]' : `[${dep.salto.padEnd(5)}]`
      console.log(
        `  ${comAtualizacoes ? marca : '       '} ${dep.nome.padEnd(29)} ${dep.faixaDeclarada.padEnd(14)} ` +
          `${(dep.versaoInstalada ?? '?').padEnd(12)} ${dep.versaoMaisRecente ?? '-'}`,
      )
    }

    if (comAtualizacoes) {
      const majors = d.dependencias.filter((x) => x.salto === 'major')
      if (majors.length > 0) {
        titulo(`Impacto das ${majors.length} atualizacao(oes) de major`)
        for (const m of majors) {
          console.log(`  ${m.nome} ${m.versaoInstalada} -> ${m.versaoMaisRecente}`)
          console.log(`    ${m.impacto ?? 'Sem nota registrada: leia o changelog antes de subir.'}`)
          console.log('')
        }
      }
      if (d.erroAtualizacoes) console.log(`  AVISO: ${d.erroAtualizacoes}`)
    }

    const falhas = d.requisitos.filter((r) => r.situacao === 'falha').length
    const faltando = [...d.diretorios, ...d.arquivos].filter((c) => c.obrigatorio && !c.existe).length
    console.log('')
    console.log(
      falhas + faltando === 0
        ? '  Nenhum problema critico encontrado.'
        : `  ${falhas} requisito(s) com falha e ${faltando} item(ns) obrigatorio(s) ausente(s).`,
    )
    if (falhas + faltando > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

void main()

/** Plano de atualizacao no terminal, com o mesmo servico que a tela usa. */
async function imprimirPlano(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  pacotes: string[],
): Promise<void> {
  const diagnostics = app.get(DiagnosticsService)
  const plano = await app
    .get(UpdatePlannerService)
    .planejar(pacotes, diagnostics.dependenciasInstaladas(), diagnostics.raizDoProjeto())

  titulo('Precondicoes')
  for (const p of plano.precondicoes) {
    console.log(`  ${p.atendida ? '[ ok ]' : p.critica ? '[BLOQ]' : '[aten]'} ${p.nome.padEnd(24)} ${p.detalhe}`)
  }

  if (plano.bloqueios.length > 0) {
    titulo('Bloqueios')
    for (const b of plano.bloqueios) {
      console.log(`  ${b.pacote}`)
      console.log(`    motivo:   ${b.motivo}`)
      console.log(`    resolver: ${b.comoResolver}`)
    }
  }

  titulo(`Grupos (${plano.grupos.length})`)
  for (const g of plano.grupos) {
    console.log(`  ${g.nome}  [risco ${g.risco}]  ${g.pacotes.map((p) => `${p.nome} ${p.de}->${p.para}`).join(', ')}`)
  }

  titulo('Script')
  console.log(plano.script)

  titulo('Rollback')
  for (const r of plano.rollback) console.log('  ' + r)
}
