import { Injectable } from '@nestjs/common'
import { NpmRegistryService } from './npm-registry.service'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import type {
  BloqueioAtualizacao,
  DiagnosticoDependencia,
  GrupoAtualizacao,
  PlanoAtualizacao,
  PrecondicaoAtualizacao,
  RiscoAtualizacao,
} from '@trigo/core'

/**
 * Pacotes que precisam subir na MESMA etapa.
 *
 * Atualizar metade de um par acoplado nao compila, e a mensagem de erro que
 * aparece raramente aponta a causa — o desenvolvedor perde a tarde procurando
 * no lugar errado.
 */
const ACOPLAMENTOS: Array<{ nome: string; pacotes: string[]; porQue: string }> = [
  {
    nome: 'Prisma',
    pacotes: ['prisma', '@prisma/client'],
    porQue:
      'A CLI e o client precisam da mesma versao exata. Divergindo, `prisma generate` recusa gerar.',
  },
  {
    nome: 'React + Next',
    pacotes: ['next', 'react', 'react-dom'],
    porQue:
      'Cada major do Next declara uma faixa de React. E react-dom tem que ficar identico ao react.',
  },
  {
    nome: 'NestJS',
    pacotes: [
      '@nestjs/core',
      '@nestjs/common',
      '@nestjs/platform-express',
      '@nestjs/config',
      '@nestjs/jwt',
      '@nestjs/cli',
    ],
    porQue: 'Os pacotes @nestjs/* compartilham interfaces internas e sobem em bloco.',
  },
  {
    nome: 'Tailwind',
    pacotes: ['tailwindcss', '@tailwindcss/postcss'],
    porQue: 'O plugin PostCSS acompanha a versao do Tailwind.',
  },
]

/** Pacote usado em mais de um workspace: todos tem que subir junto. */
const MULTI_WORKSPACE: Record<string, string[]> = {
  zod: ['packages/core', 'apps/bff', 'apps/web'],
  typescript: ['(raiz)', 'apps/bff', 'apps/web', 'packages/core', 'packages/api-client'],
}

/** Verificacao obrigatoria depois de mexer em cada area. */
const VERIFICACOES_POR_AREA: Record<string, string[]> = {
  Prisma: [
    'pnpm --filter @trigo/bff exec prisma generate   # obrigatorio: o client e gerado, nao instalado',
    'pnpm --filter @trigo/bff exec prisma validate',
    'pnpm --filter @trigo/bff db:verificar-script    # o DDL gerado nao pode ter mudado sem revisao',
    'pnpm --filter @trigo/bff typecheck',
  ],
  'React + Next': [
    'pnpm --filter @trigo/web exec tsc --noEmit',
    'pnpm --filter @trigo/web exec next build   # pare o dev server antes, ou veja a nota do script',
    'Abrir o portal e FAZER LOGIN: o proxy /api/bff e o cookie same-site sao o ponto fragil',
    'Acessar uma rota protegida SEM sessao: tem que redirecionar para /login. Major do Next pode',
    '  mexer no middleware, e rota desprotegida nao aparece em build nem em typecheck',
  ],
  NestJS: [
    'pnpm --filter @trigo/bff exec nest build',
    'Subir o BFF e conferir que os dois guards globais continuam na ordem: autentica, depois autoriza',
    'GET http://localhost:3333/api/products sem sessao: tem que responder 401, nao 200',
  ],
  Tailwind: [
    'pnpm --filter @trigo/web exec next build',
    'Conferir as cores da marca: os tokens @theme vivem em apps/web/src/app/globals.css',
  ],
  zod: [
    'pnpm --filter @trigo/core build',
    'pnpm typecheck',
    'Testar um formulario com erro (cadastro de usuario com e-mail invalido): o formato de issue mudou na v4',
  ],
  // `pnpm typecheck` NAO basta: ele roda o `tsc`, que continua existindo. O que
  // quebrou de fato em 21/08/2026 foi o `nest build`, porque o Nest CLI usa a
  // API programatica do compilador — e nenhum typecheck exercita isso.
  typescript: [
    'pnpm typecheck',
    'pnpm --filter @trigo/bff exec nest build   # o passo que pega quebra de API do compilador',
    'pnpm dev e conferir que o BFF sobe: com TypeScript incompativel, ele nem inicia',
  ],
}

@Injectable()
export class UpdatePlannerService {
  constructor(private readonly registry: NpmRegistryService) {}

  /**
   * Monta o plano para os pacotes escolhidos.
   *
   * NAO EXECUTA NADA, e essa e a decisao central deste servico. Ver
   * `porQueNaoExecutamos` no resultado: o resumo vai para a tela, para quem
   * clicar entender por que recebeu um script em vez de um botao.
   *
   * A RESOLUCAO DE VERSAO E DAQUI, nao de quem chama. Quando era do chamador,
   * o companheiro arrastado por acoplamento (react junto do next) saia no
   * script como `@latest` — um comando que instala coisa diferente amanha, e
   * justamente o que este servico existe para evitar. E o salto de versao,
   * calculado fora, vinha como desconhecido e classificava major como risco
   * baixo.
   */
  async planejar(
    solicitados: string[],
    dependencias: DiagnosticoDependencia[],
    raiz: string | null,
  ): Promise<PlanoAtualizacao> {
    // O conjunto real inclui os acoplados, mesmo nao marcados na tela.
    const alvos = new Set(solicitados)
    for (const acoplamento of ACOPLAMENTOS) {
      if (acoplamento.pacotes.some((p) => alvos.has(p))) {
        for (const p of acoplamento.pacotes) {
          if (dependencias.some((d) => d.nome === p)) alvos.add(p)
        }
      }
    }

    const { versoes } = await this.registry.ultimasVersoes([...alvos])
    for (const dep of dependencias) {
      const recente = versoes.get(dep.nome)
      if (!recente) continue
      dep.versaoMaisRecente = recente
      dep.salto = this.salto(dep.versaoInstalada, recente)
    }

    const escolhidas = dependencias.filter((d) => solicitados.includes(d.nome))

    const bloqueios = this.bloqueios(escolhidas, dependencias)
    const permitidas = escolhidas.filter((d) => !bloqueios.some((b) => b.pacote === d.nome))
    const grupos = this.agrupar(permitidas, dependencias)


    return {
      geradoEm: new Date().toISOString(),
      solicitados,
      bloqueios,
      precondicoes: this.precondicoes(raiz, escolhidas),
      grupos,
      rollback: this.rollback(raiz),
      script: this.script(grupos, raiz),
      porQueNaoExecutamos:
        'O portal monta o plano mas nao executa. Atualizar as proprias dependencias significa ' +
        'reescrever node_modules sob o processo que esta atendendo a requisicao: no Windows o ' +
        '`prisma generate` falha com EPERM porque o BFF mantem lock na DLL do engine, e a nova ' +
        'versao so passa a valer depois de reiniciar — ou seja, o processo tem que se derrubar ' +
        'para concluir o proprio trabalho. Se algo quebrar, o botao para desfazer estaria dentro ' +
        'do portal que caiu. Por isso o resultado e um script revisavel, executado por uma pessoa ' +
        'com terminal no servidor.',
    }
  }

  /**
   * Atualizacoes que nao devem sair ainda.
   *
   * Diferente de "risco alto": bloqueio e quando existe uma pendencia concreta
   * e conhecida que faria a atualizacao falhar.
   */
  private bloqueios(
    escolhidas: DiagnosticoDependencia[],
    todas: DiagnosticoDependencia[],
  ): BloqueioAtualizacao[] {
    const lista: BloqueioAtualizacao[] = []
    const usaNestCli = todas.some((d) => d.nome === '@nestjs/cli')

    for (const dep of escolhidas) {
      const paraMajor = this.major(dep.versaoMaisRecente)
      const deMajor = this.major(dep.versaoInstalada)

      // APRENDIDO NA PRATICA, em 21/08/2026: o TypeScript 7.0 foi instalado
      // aqui e o BFF parou de INICIAR. A 7.0 entrega apenas o executavel `tsc`,
      // sem a API programatica de compilacao que o Nest CLI usa — e sem o Nest
      // CLI nao existe `nest build` nem `nest start`. A 7.0 tambem removeu
      // `moduleResolution: node10`, que este monorepo usava.
      //
      // Isto e bloqueio, nao risco: typecheck e build passam a falhar de
      // imediato, e o front sobe sozinho dando ECONNREFUSED no proxy — o que
      // parece problema de rede e nao de versao de compilador.
      if (dep.nome === 'typescript' && paraMajor >= 7 && deMajor < 7 && usaNestCli) {
        lista.push({
          pacote: dep.nome,
          motivo:
            'O TypeScript 7.0 nao expoe a API programatica de compilacao, e o Nest CLI depende ' +
            'dela: com a 7.0 instalada o BFF nao inicia. A 7.0 tambem removeu ' +
            '`moduleResolution: node10`, usado por packages/core e packages/api-client.',
          comoResolver:
            'Esperar a 7.1, que segundo a mensagem do proprio Nest devolve a API. Enquanto isso, ' +
            'a faixa segura e 5.9 (a versao em uso) — ou a 6, se houver necessidade de recurso ' +
            'novo de linguagem. Antes de subir, confirme na release do @nestjs/cli que a versao ' +
            'de TypeScript passou a ser suportada.',
        })
      }

      if ((dep.nome === 'prisma' || dep.nome === '@prisma/client') && paraMajor >= 7 && deMajor < 7) {
        lista.push({
          pacote: dep.nome,
          motivo:
            'A versao 7 remove a configuracao `package.json#prisma`, que este projeto ainda usa ' +
            'para apontar o seed. O aviso de depreciacao ja aparece em todo comando prisma.',
          comoResolver:
            'Criar apps/bff/prisma.config.ts declarando o seed, remover a chave "prisma" do ' +
            'package.json e conferir que `pnpm --filter @trigo/bff db:seed` continua rodando. ' +
            'Isso pode ser feito ANTES da atualizacao, ainda na versao 6.',
        })
      }
    }

    return lista
  }

  private precondicoes(
    raiz: string | null,
    escolhidas: DiagnosticoDependencia[],
  ): PrecondicaoAtualizacao[] {
    const lista: PrecondicaoAtualizacao[] = []

    const temGit = raiz !== null && existsSync(path.join(raiz, '.git'))
    lista.push({
      nome: 'Repositorio git',
      atendida: temGit,
      critica: true,
      detalhe: temGit ? 'Presente' : 'AUSENTE — o projeto nao esta versionado',
      porQue:
        'Sem git nao existe rollback. Se a atualizacao quebrar o build, nao ha comando para voltar ' +
        'ao estado anterior: package.json e pnpm-lock.yaml ja foram reescritos. Versionar o ' +
        'projeto e pre-requisito de qualquer atualizacao, nao um cuidado extra.',
    })

    const temLock = raiz !== null && existsSync(path.join(raiz, 'pnpm-lock.yaml'))
    lista.push({
      nome: 'pnpm-lock.yaml',
      atendida: temLock,
      critica: true,
      detalhe: temLock ? 'Presente' : 'AUSENTE',
      porQue:
        'E o arquivo que registra as versoes exatas, inclusive das transitivas. Sem ele, dois ' +
        'ambientes instalam arvores diferentes a partir do mesmo package.json.',
    })

    const producao = (process.env.NODE_ENV ?? '') === 'production'
    lista.push({
      nome: 'Ambiente',
      atendida: !producao,
      critica: producao,
      detalhe: producao ? 'PRODUCAO' : 'Desenvolvimento',
      porQue: producao
        ? 'Atualizar dependencia no lugar, em producao, faz o servidor divergir do repositorio — e ' +
          'o proximo deploy reverte tudo em silencio. O caminho correto e atualizar em ' +
          'desenvolvimento, testar, comitar e implantar o artefato.'
        : 'Atualizar aqui e testar antes de levar para o servidor e o caminho correto.',
    })

    if (process.platform === 'win32' && escolhidas.some((d) => d.nome.includes('prisma'))) {
      lista.push({
        nome: 'BFF parado (Windows)',
        atendida: false,
        critica: true,
        detalhe: 'Verifique manualmente: nao consigo saber daqui se o processo esta no ar',
        porQue:
          'No Windows o `prisma generate` falha com EPERM se o BFF estiver rodando, porque o ' +
          'processo mantem lock em query_engine-windows.dll.node. Pare o `pnpm dev` antes.',
      })
    }

    return lista
  }

  private agrupar(
    permitidas: DiagnosticoDependencia[],
    todas: DiagnosticoDependencia[],
  ): GrupoAtualizacao[] {
    const grupos: GrupoAtualizacao[] = []
    const jaTratados = new Set<string>()

    for (const acoplamento of ACOPLAMENTOS) {
      const doGrupo = permitidas.filter((d) => acoplamento.pacotes.includes(d.nome))
      if (doGrupo.length === 0) continue

      // Um acoplado escolhido arrasta os companheiros, mesmo nao marcados: e o
      // ponto do acoplamento.
      const completo = todas.filter((d) => acoplamento.pacotes.includes(d.nome))
      for (const d of completo) jaTratados.add(d.nome)

      grupos.push(this.montarGrupo(acoplamento.nome, completo, acoplamento.porQue))
    }

    for (const dep of permitidas) {
      if (jaTratados.has(dep.nome)) continue
      jaTratados.add(dep.nome)
      grupos.push(this.montarGrupo(dep.nome, [dep], null))
    }

    // Menor risco primeiro: se algo vai falhar, que falhe cedo e barato, antes
    // de a arvore ja ter varias mudancas empilhadas.
    const peso: Record<RiscoAtualizacao, number> = { baixo: 0, medio: 1, alto: 2 }
    return grupos.sort((a, b) => peso[a.risco] - peso[b.risco])
  }

  private montarGrupo(
    nome: string,
    deps: DiagnosticoDependencia[],
    porQueJuntos: string | null,
  ): GrupoAtualizacao {
    const comandos: string[] = []

    for (const dep of deps) {
      const versao = dep.versaoMaisRecente ?? 'latest'
      // Pacote presente em vários workspaces: um comando por workspace, senao
      // sobra uma versao antiga em algum canto e o monorepo fica com duas.
      const destinos = MULTI_WORKSPACE[dep.nome] ?? [dep.workspace]
      for (const ws of destinos) {
        comandos.push(this.comandoAdd(ws, dep.nome, versao, dep.tipo === 'desenvolvimento'))
      }
    }

    comandos.push('pnpm install')
    comandos.push('pnpm build:packages')

    const verificacoes = VERIFICACOES_POR_AREA[nome] ?? ['pnpm typecheck']

    // Risco sai do salto REAL de versao. Antes vinha de `salto`, que era
    // calculado fora e chegava como desconhecido: major virava risco baixo.
    const temMajor = deps.some(
      (d) => this.salto(d.versaoInstalada, d.versaoMaisRecente) === 'major',
    )
    const risco: RiscoAtualizacao = !temMajor
      ? 'baixo'
      : nome === 'React + Next' || nome === 'Prisma'
        ? 'alto'
        : 'medio'

    return {
      nome,
      pacotes: deps.map((d) => ({
        nome: d.nome,
        workspace: d.workspace,
        de: d.versaoInstalada ?? '?',
        para: d.versaoMaisRecente ?? 'latest',
      })),
      risco,
      porQueJuntos,
      comandos,
      verificacoes,
      impacto: deps.find((d) => d.impacto)?.impacto ?? null,
    }
  }

  private comandoAdd(workspace: string, pacote: string, versao: string, dev: boolean): string {
    const flag = dev ? ' -D' : ''
    if (workspace === '(raiz)') return `pnpm add${flag} -w ${pacote}@${versao}`

    // O filtro por nome do pacote e mais estavel que por caminho.
    const filtro =
      workspace === 'apps/bff'
        ? '@trigo/bff'
        : workspace === 'apps/web'
          ? '@trigo/web'
          : workspace === 'packages/core'
            ? '@trigo/core'
            : workspace === 'packages/api-client'
              ? '@trigo/api-client'
              : workspace
    return `pnpm --filter ${filtro} add${flag} ${pacote}@${versao}`
  }

  private rollback(raiz: string | null): string[] {
    const temGit = raiz !== null && existsSync(path.join(raiz, '.git'))
    if (!temGit) {
      return [
        '# NAO HA ROLLBACK: o projeto nao esta em um repositorio git.',
        '# Antes de atualizar qualquer coisa, faca uma das duas:',
        '#   1. git init && git add -A && git commit -m "estado antes da atualizacao"',
        '#   2. copiar package.json de todos os workspaces + pnpm-lock.yaml para um lugar seguro',
      ]
    }
    return [
      'git checkout -- package.json apps/*/package.json packages/*/package.json pnpm-lock.yaml',
      'pnpm install',
      'pnpm --filter @trigo/bff exec prisma generate',
      'pnpm build:packages',
    ]
  }

  /**
   * Script na ordem dos grupos.
   *
   * NEUTRO DE SHELL de proposito: nenhuma linha usa construcao exclusiva de
   * bash. A versao anterior tinha `NEXT_DIST_DIR=.next-build pnpm ...`, que e
   * atribuicao inline de variavel — sintaxe que NAO existe no PowerShell, o
   * shell padrao do Windows, onde este script e executado. `#`, `cd` e `pnpm`
   * funcionam igual nos dois, entao basta nao usar mais nada.
   */
  private script(grupos: GrupoAtualizacao[], raiz: string | null): string {
    const linhas: string[] = [
      '# Plano de atualizacao do Portal Trigo',
      '# Gerado pelo proprio portal. Execute UM GRUPO por vez, conferindo as',
      '# verificacoes antes de seguir. Se uma verificacao falhar, pare e use o rollback.',
      '#',
      '# Funciona em PowerShell e em bash: nenhuma linha usa sintaxe especifica.',
      '#',
      '# PARE O DEV SERVER antes de comecar. Com ele no ar, no Windows:',
      '#   - `prisma generate` falha com EPERM (lock na DLL do engine)',
      '#   - o `next build` disputa lock com o .next',
      '# Se precisar buildar com o dev rodando, use um diretorio de saida separado:',
      '#   PowerShell:  $env:NEXT_DIST_DIR=".next-build"; pnpm --filter @trigo/web exec next build',
      '#   bash:        NEXT_DIST_DIR=.next-build pnpm --filter @trigo/web exec next build',
      '',
      `cd ${raiz ?? '<raiz do projeto>'}`,
      '',
    ]

    grupos.forEach((g, i) => {
      linhas.push(`# ${'='.repeat(70)}`)
      linhas.push(`# GRUPO ${i + 1} de ${grupos.length}: ${g.nome}  (risco ${g.risco})`)
      for (const p of g.pacotes) linhas.push(`#   ${p.nome}  ${p.de} -> ${p.para}`)
      linhas.push(`# ${'='.repeat(70)}`)
      linhas.push(...g.comandos)
      linhas.push('')
      linhas.push('# Verificar antes de seguir:')
      for (const v of g.verificacoes) linhas.push(`#   ${v}`)
      linhas.push('')
    })

    return linhas.join('\n')
  }

  /** Mesma regra do diagnostico: maior diferenca entre as duas versoes. */
  private salto(instalada: string | null, recente: string | null) {
    if (!instalada || !recente) return 'desconhecido' as const
    const partes = (v: string) => v.split('-')[0]!.split('.').map((n) => Number(n) || 0)
    const [aM = 0, am = 0, ap = 0] = partes(instalada)
    const [bM = 0, bm = 0, bp = 0] = partes(recente)
    if (bM > aM) return 'major' as const
    if (bM < aM) return 'igual' as const
    if (bm > am) return 'minor' as const
    if (bm < am) return 'igual' as const
    return bp > ap ? ('patch' as const) : ('igual' as const)
  }

  private major(versao: string | null): number {
    if (!versao) return 0
    return Number(versao.split('.')[0]) || 0
  }
}
