import { Injectable, Logger } from '@nestjs/common'
import { existsSync, readFileSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import type {
  DiagnosticoCaminho,
  DiagnosticoDependencia,
  DiagnosticoRequisito,
  DiagnosticoRuntime,
  SaltoDeVersao,
  SystemDiagnostics,
} from '@trigo/core'
import { DatabaseService } from '../database/database.service'
import { ParametersService } from '../parameters/parameters.service'
import { DEPENDENCIAS, IMPACTOS_REVISADOS_EM } from './dependency-catalog'
import { NpmRegistryService } from './npm-registry.service'

/** Diretorios que o diagnostico inspeciona, com o papel de cada um. */
const DIRETORIOS: Array<Omit<DiagnosticoCaminho, 'existe' | 'tamanhoBytes' | 'modificadoEm'>> = [
  { caminho: 'apps/bff', tipo: 'diretorio', papel: 'BFF: a unica parte que fala com banco e com o Protheus.', obrigatorio: true },
  { caminho: 'apps/bff/src', tipo: 'diretorio', papel: 'Codigo do BFF, um diretorio por dominio.', obrigatorio: true },
  { caminho: 'apps/bff/dist', tipo: 'diretorio', papel: 'Build do BFF. E o que roda em producao.', gerado: true, naoVersionado: true },
  { caminho: 'apps/bff/prisma', tipo: 'diretorio', papel: 'Schema, seed, SQL manual e o banco local.', obrigatorio: true },
  { caminho: 'apps/bff/prisma/sql', tipo: 'diretorio', papel: 'Objetos T-SQL que o Prisma nao declara (indice filtrado).' },
  { caminho: 'apps/bff/prisma/sql-sqlite', tipo: 'diretorio', papel: 'Equivalentes dos anteriores para o banco local em arquivo.' },
  { caminho: 'apps/bff/deploy', tipo: 'diretorio', papel: 'Script de criacao do banco para instancia nova.' },
  { caminho: 'apps/bff/scripts', tipo: 'diretorio', papel: 'Ferramentas de banco: geracao de script, renomeacao, migracao.' },
  { caminho: 'apps/web', tipo: 'diretorio', papel: 'Front Next.js. E a unica porta exposta ao usuario.', obrigatorio: true },
  { caminho: 'apps/web/src/app', tipo: 'diretorio', papel: 'Rotas do App Router: uma pasta por tela.', obrigatorio: true },
  { caminho: 'apps/web/.next', tipo: 'diretorio', papel: 'Build do front.', gerado: true, naoVersionado: true },
  { caminho: 'packages/core', tipo: 'diretorio', papel: 'Dominio compartilhado: tipos, schemas Zod e permissoes.', obrigatorio: true },
  { caminho: 'packages/api-client', tipo: 'diretorio', papel: 'Cliente HTTP tipado, usado pela tela e futuramente pelo app.', obrigatorio: true },
  { caminho: 'protheus', tipo: 'diretorio', papel: 'Fontes AdvPL/TLPP versionados junto do contrato que servem.' },
  { caminho: 'node_modules', tipo: 'diretorio', papel: 'Dependencias instaladas pelo pnpm.', gerado: true, naoVersionado: true, obrigatorio: true },
]

/** Arquivos sem os quais o portal nao sobe, ou que definem seu comportamento. */
const ARQUIVOS: Array<Omit<DiagnosticoCaminho, 'existe' | 'tamanhoBytes' | 'modificadoEm'>> = [
  { caminho: 'apps/bff/.env', tipo: 'arquivo', papel: 'Banco, segredo do JWT e chave de cifragem. O que o processo precisa ANTES de existir banco.', naoVersionado: true, obrigatorio: true },
  { caminho: 'apps/web/.env.local', tipo: 'arquivo', papel: 'URL interna do BFF usada pelo proxy do Next.', naoVersionado: true },
  { caminho: 'apps/bff/src/main.ts', tipo: 'arquivo', papel: 'Entrada do BFF: prefixo /api, CORS, helmet e porta.', obrigatorio: true },
  { caminho: 'apps/bff/src/app.module.ts', tipo: 'arquivo', papel: 'Registro dos modulos e dos dois guards globais.', obrigatorio: true },
  { caminho: 'apps/bff/prisma/schema.prisma', tipo: 'arquivo', papel: 'Fonte de verdade do banco (SQL Server). Todo o resto deriva daqui.', obrigatorio: true },
  { caminho: 'apps/bff/prisma/schema.sqlite.prisma', tipo: 'arquivo', papel: 'Schema do banco local, GERADO do anterior.', gerado: true },
  { caminho: 'apps/bff/prisma/dev.db', tipo: 'arquivo', papel: 'Banco local em arquivo, para desenvolvimento.', naoVersionado: true },
  { caminho: 'apps/bff/prisma/seed.ts', tipo: 'arquivo', papel: 'Cria o administrador inicial e sincroniza o catalogo de parametros.' },
  { caminho: 'apps/bff/deploy/criar-banco.sql', tipo: 'arquivo', papel: 'Cria o banco do zero em outra instancia. GERADO do schema.', gerado: true },
  { caminho: 'apps/bff/nest-cli.json', tipo: 'arquivo', papel: 'Configuracao de build do BFF (deleteOutDir).' },
  { caminho: 'apps/bff/prisma.config.ts', tipo: 'arquivo', papel: 'Config do Prisma CLI: schema padrao e comando de seed. Substitui package.json#prisma, removido na versao 7.' },
  { caminho: 'apps/web/next.config.ts', tipo: 'arquivo', papel: 'Proxy /api/bff, cabecalhos de seguranca e modo de build.', obrigatorio: true },
  { caminho: 'apps/web/src/middleware.ts', tipo: 'arquivo', papel: 'Protecao de rota e redirecionamento de rota legada.', obrigatorio: true },
  { caminho: 'apps/web/src/app/globals.css', tipo: 'arquivo', papel: 'Tokens @theme: a identidade visual do Grupo Trigo.', obrigatorio: true },
  { caminho: 'pnpm-workspace.yaml', tipo: 'arquivo', papel: 'Declara os pacotes do monorepo.', obrigatorio: true },
  { caminho: 'tsconfig.base.json', tipo: 'arquivo', papel: 'Regras de TypeScript herdadas por todos os pacotes.', obrigatorio: true },
  { caminho: 'protheus/GTRWSRPT.tlpp', tipo: 'arquivo', papel: 'Web service REST de cadastros no Protheus.' },
]

@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name)

  constructor(
    private readonly registry: NpmRegistryService,
    private readonly database: DatabaseService,
    private readonly parameters: ParametersService,
  ) {}

  /**
   * @param comAtualizacoes quando true, consulta o registry do npm. Fica
   *   opcional porque e a unica parte que sai para a internet, e servidor
   *   corporativo costuma nao ter essa saida.
   */
  async diagnosticar(comAtualizacoes: boolean): Promise<SystemDiagnostics> {
    const raiz = this.acharRaiz()

    const dependencias = this.lerDependencias(raiz)
    let erroAtualizacoes: string | null = null

    if (comAtualizacoes) {
      const { versoes, falhas } = await this.registry.ultimasVersoes(
        dependencias.map((d) => d.nome),
      )
      for (const dep of dependencias) {
        dep.versaoMaisRecente = versoes.get(dep.nome) ?? null
        dep.salto = this.compararVersoes(dep.versaoInstalada, dep.versaoMaisRecente)
      }
      if (falhas > 0) {
        erroAtualizacoes = `${falhas} de ${dependencias.length} pacote(s) nao responderam no registry do npm. Verifique a saida para a internet no servidor.`
      }
    }

    return {
      geradoEm: new Date().toISOString(),
      runtime: this.runtime(raiz),
      requisitos: await this.requisitos(raiz),
      diretorios: DIRETORIOS.map((d) => this.inspecionar(raiz, d)),
      arquivos: ARQUIVOS.map((a) => this.inspecionar(raiz, a)),
      dependencias,
      impactosRevisadosEm: IMPACTOS_REVISADOS_EM,
      atualizacoesConsultadas: comAtualizacoes,
      erroAtualizacoes,
    }
  }

  /** Exposto para o planejador de atualizacao usar a mesma raiz. */
  raizDoProjeto(): string | null {
    return this.acharRaiz()
  }

  /** Reaproveitado pelo planejador: uma so leitura de package.json. */
  dependenciasInstaladas(): DiagnosticoDependencia[] {
    return this.lerDependencias(this.acharRaiz())
  }

  /**
   * Sobe do diretorio de trabalho ate achar o pnpm-workspace.yaml.
   *
   * Nao da para assumir a raiz: em desenvolvimento o processo roda em
   * apps/bff; empacotado, pode rodar de qualquer lugar. Null quando nao acha —
   * e ai a tela mostra os caminhos como indisponiveis em vez de mentir.
   */
  private acharRaiz(): string | null {
    let atual = process.cwd()
    for (let i = 0; i < 6; i++) {
      if (existsSync(path.join(atual, 'pnpm-workspace.yaml'))) return atual
      const pai = path.dirname(atual)
      if (pai === atual) break
      atual = pai
    }
    this.logger.warn('Nao encontrei a raiz do monorepo a partir de ' + process.cwd())
    return null
  }

  private runtime(raiz: string | null): DiagnosticoRuntime {
    const memoria = process.memoryUsage()
    return {
      node: process.version,
      nodeMinimoExigido: this.nodeExigido(raiz),
      plataforma: `${process.platform} ${os.release()}`,
      arquitetura: process.arch,
      ambiente: process.env.NODE_ENV ?? '',
      uptimeSegundos: Math.round(process.uptime()),
      memoriaProcessoMb: Math.round(memoria.rss / 1024 / 1024),
      memoriaSistemaMb: Math.round(os.totalmem() / 1024 / 1024),
      cpus: os.cpus().length,
      diretorioDeTrabalho: process.cwd(),
      raizDoProjeto: raiz,
      fusoHorario: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  }

  private nodeExigido(raiz: string | null): string | null {
    if (!raiz) return null
    const pacote = this.lerJson(path.join(raiz, 'package.json'))
    const engines = pacote?.engines as Record<string, string> | undefined
    return engines?.node ?? null
  }

  private async requisitos(raiz: string | null): Promise<DiagnosticoRequisito[]> {
    const lista: DiagnosticoRequisito[] = []

    // 1. Node
    const exigido = this.nodeExigido(raiz)
    const minimo = exigido ? Number(exigido.replace(/[^\d.]/g, '').split('.')[0]) : null
    const atual = Number(process.version.replace('v', '').split('.')[0])
    lista.push({
      nome: 'Node.js',
      situacao: minimo === null ? 'desconhecido' : atual >= minimo ? 'ok' : 'falha',
      detalhe:
        `Em execucao: ${process.version}` + (exigido ? ` — exigido ${exigido}` : ' — minimo nao declarado'),
      porQue: 'E o runtime do BFF e do servidor do Next. Abaixo do minimo, o processo nao sobe.',
    })

    // 2. Banco
    const banco = await this.database.status().catch(() => null)
    lista.push({
      nome: 'Banco de dados',
      situacao: banco === null ? 'falha' : banco.conectado ? 'ok' : 'falha',
      detalhe:
        banco === null
          ? 'Nao foi possivel consultar a situacao do banco.'
          : banco.conectado
            ? `${banco.provider} em ${banco.servidor || 'arquivo local'} — ${banco.banco}${banco.latenciaMs !== null ? `, ${banco.latenciaMs}ms` : ''}`
            : `Sem conexao: ${banco.detalheErro ?? 'motivo nao informado'}`,
      porQue:
        'Sem banco nao ha sessao, parametro nem cadastro. E a dependencia mais critica do portal.',
    })

    // 3. Segredos do .env
    for (const [chave, papel] of [
      ['JWT_SECRET', 'Assina o token de sessao. Ausente, ninguem consegue entrar.'],
      [
        'PARAMETER_ENCRYPTION_KEY',
        'Cifra os parametros SECRET e CREDENTIAL, incluindo a credencial do Protheus. Ausente, eles nao podem ser gravados nem lidos.',
      ],
    ] as const) {
      const valor = process.env[chave] ?? ''
      lista.push({
        nome: chave,
        situacao: valor.trim() === '' ? 'falha' : 'ok',
        detalhe: valor.trim() === '' ? 'Nao definida' : 'Definida',
        porQue: papel,
      })
    }

    // 4. Protheus — configuracao, sem chamar o ERP: diagnostico nao deve
    //    consumir licenca nem thread do appserver a cada abertura de tela.
    const url = await this.parameters.getString('PROTHEUS_REST_URL')
    const credencial = await this.parameters.getCredential('PROTHEUS_CREDENCIAL')
    const configurado = url.trim() !== '' && Boolean(credencial?.usuario)
    lista.push({
      nome: 'Integracao Protheus',
      situacao: configurado ? 'ok' : 'atencao',
      detalhe: configurado
        ? `Configurada para ${url} (usuario ${credencial?.usuario})`
        : 'URL ou credencial ausente em Configurador > Parametros',
      porQue:
        'Necessaria para a carga de cadastros. O portal funciona sem ela, mas os espelhos ficam parados. ' +
        'Esta tela NAO testa a conexao de proposito — use Configurador > Conexao Protheus para isso.',
    })

    return lista
  }

  private inspecionar(
    raiz: string | null,
    item: Omit<DiagnosticoCaminho, 'existe' | 'tamanhoBytes' | 'modificadoEm'>,
  ): DiagnosticoCaminho {
    if (!raiz) {
      return { ...item, existe: false, tamanhoBytes: null, modificadoEm: null }
    }

    const completo = path.join(raiz, item.caminho)
    try {
      const info = statSync(completo)
      return {
        ...item,
        existe: true,
        // Tamanho de diretorio nao diz nada util e custa varredura recursiva.
        tamanhoBytes: info.isDirectory() ? null : info.size,
        modificadoEm: info.mtime.toISOString(),
      }
    } catch {
      return { ...item, existe: false, tamanhoBytes: null, modificadoEm: null }
    }
  }

  /**
   * Cruza o catalogo com o que esta declarado no package.json e instalado em
   * node_modules. Faixa declarada e versao instalada sao coisas diferentes:
   * `^15.5.3` pode estar instalado como 15.5.23.
   */
  private lerDependencias(raiz: string | null): DiagnosticoDependencia[] {
    return DEPENDENCIAS.map((dep) => {
      const workspaceDir = dep.workspace === '(raiz)' ? '' : dep.workspace
      const pacote = raiz ? this.lerJson(path.join(raiz, workspaceDir, 'package.json')) : null

      const declaradas = {
        ...((pacote?.dependencies as Record<string, string>) ?? {}),
        ...((pacote?.devDependencies as Record<string, string>) ?? {}),
      }

      const instalado = raiz
        ? this.lerJson(path.join(raiz, workspaceDir, 'node_modules', dep.nome, 'package.json'))
        : null

      return {
        nome: dep.nome,
        workspace: dep.workspace,
        tipo: dep.tipo,
        papel: dep.papel,
        faixaDeclarada: declaradas[dep.nome] ?? '(nao declarada)',
        versaoInstalada: typeof instalado?.version === 'string' ? instalado.version : null,
        versaoMaisRecente: null,
        salto: 'desconhecido' as SaltoDeVersao,
        impacto: dep.impactoMajor,
      }
    })
  }

  private lerJson(caminho: string): Record<string, unknown> | null {
    try {
      return JSON.parse(readFileSync(caminho, 'utf8')) as Record<string, unknown>
    } catch {
      return null
    }
  }

  /**
   * Compara duas versoes semver e devolve a maior diferenca.
   *
   * Escrito a mao em vez de instalar um pacote de semver: sao 15 linhas, e
   * acrescentar dependencia para alimentar a tela que inventaria dependencias
   * seria uma ironia caro de manter.
   */
  private compararVersoes(instalada: string | null, recente: string | null): SaltoDeVersao {
    if (!instalada || !recente) return 'desconhecido'

    const partes = (v: string) => {
      const numeros = v.split('-')[0]!.split('.').map((n) => Number(n))
      return [numeros[0] ?? 0, numeros[1] ?? 0, numeros[2] ?? 0] as const
    }

    const [aMaior, aMenor, aPatch] = partes(instalada)
    const [bMaior, bMenor, bPatch] = partes(recente)

    if (bMaior > aMaior) return 'major'
    if (bMaior < aMaior) return 'igual'
    if (bMenor > aMenor) return 'minor'
    if (bMenor < aMenor) return 'igual'
    if (bPatch > aPatch) return 'patch'
    return 'igual'
  }
}
