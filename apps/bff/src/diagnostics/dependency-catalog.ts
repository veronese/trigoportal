/**
 * Catalogo dos programas e bibliotecas de que o portal depende.
 *
 * POR QUE UM CATALOGO A MAO, e nao apenas ler o package.json: o package.json
 * diz o QUE esta instalado, nunca PARA QUE serve nem o que quebra ao subir de
 * versao. Essas duas colunas sao as uteis num diagnostico, e nenhuma
 * ferramenta as deduz.
 *
 * A lista tambem e um filtro: `@types/*` e transitivas nao entram, senao a tela
 * viraria um `pnpm list` — informacao verdadeira e imprestavel.
 *
 * MANTER: ao adicionar dependencia de runtime, acrescente aqui. O diagnostico
 * avisa quando o package.json tem algo que o catalogo nao conhece.
 */

/** Data da ultima revisao dos textos de impacto. Aparece na tela. */
export const IMPACTOS_REVISADOS_EM = '2026-08-21'

export interface DependenciaCatalogada {
  nome: string
  /** Pasta do workspace, relativa a raiz. */
  workspace: string
  tipo: 'runtime' | 'desenvolvimento'
  papel: string
  /**
   * O que uma subida de MAJOR implica para este projeto especificamente.
   * Null quando nao ha nada relevante a dizer alem de reler o changelog.
   */
  impactoMajor: string | null
}

export const DEPENDENCIAS: DependenciaCatalogada[] = [
  // ------------------------------------------------------------------- Web
  {
    nome: 'next',
    workspace: 'apps/web',
    tipo: 'runtime',
    papel: 'Framework do front: App Router, renderizacao no servidor e o proxy /api/bff.',
    impactoMajor:
      'Major do Next costuma mexer em App Router, em next.config e na versao minima do React. ' +
      'O ponto sensivel aqui e o `rewrites` que faz o proxy do BFF: se ele mudar de contrato, ' +
      'o cookie de sessao deixa de ser same-site e o login para de funcionar. Exige testar login ' +
      'e navegacao entre modulos antes de subir.',
  },
  {
    nome: 'react',
    workspace: 'apps/web',
    tipo: 'runtime',
    papel: 'Biblioteca de interface.',
    impactoMajor:
      'Anda casado com o Next: subir um sem o outro normalmente nao compila. ' +
      'Atualize os dois na mesma mudanca.',
  },
  {
    nome: 'react-dom',
    workspace: 'apps/web',
    tipo: 'runtime',
    papel: 'Renderizador do React para navegador.',
    impactoMajor: 'Tem que ficar na MESMA versao do react.',
  },
  {
    nome: 'tailwindcss',
    workspace: 'apps/web',
    tipo: 'desenvolvimento',
    papel: 'CSS utilitario. A identidade visual do Trigo vive nos tokens @theme do globals.css.',
    impactoMajor:
      'A v4 trocou a configuracao de arquivo JS para diretiva @theme no CSS. ' +
      'Outro major desse porte exigiria reescrever globals.css, onde estao as cores da marca.',
  },
  {
    nome: '@tailwindcss/postcss',
    workspace: 'apps/web',
    tipo: 'desenvolvimento',
    papel: 'Plugin PostCSS do Tailwind.',
    impactoMajor: 'Tem que acompanhar a versao do tailwindcss.',
  },

  // ------------------------------------------------------------------- BFF
  {
    nome: '@nestjs/core',
    workspace: 'apps/bff',
    tipo: 'runtime',
    papel: 'Nucleo do BFF: injecao de dependencia, modulos e ciclo de vida.',
    impactoMajor:
      'Major do Nest costuma exigir subir @nestjs/* em bloco, na mesma versao. ' +
      'Atencao aos dois guards globais (JwtAuthGuard e PermissionsGuard): mudanca na ordem de ' +
      'execucao de guard afeta autenticacao e autorizacao de TODAS as rotas.',
  },
  {
    nome: '@nestjs/common',
    workspace: 'apps/bff',
    tipo: 'runtime',
    papel: 'Decoradores, pipes, guards e excecoes HTTP.',
    impactoMajor: 'Subir junto com @nestjs/core.',
  },
  {
    nome: '@nestjs/platform-express',
    workspace: 'apps/bff',
    tipo: 'runtime',
    papel: 'Adaptador HTTP (Express) do Nest.',
    impactoMajor:
      'Traz consigo a major do Express. Express 5 mudou tratamento de rota e de erro assincrono.',
  },
  {
    nome: '@nestjs/config',
    workspace: 'apps/bff',
    tipo: 'runtime',
    papel: 'Leitura do .env, usada para o que o processo precisa ANTES de existir banco.',
    impactoMajor: 'Subir junto com @nestjs/core.',
  },
  {
    nome: '@nestjs/jwt',
    workspace: 'apps/bff',
    tipo: 'runtime',
    papel: 'Assinatura e verificacao do token de sessao gravado no cookie httpOnly.',
    impactoMajor:
      'Encapsula o jsonwebtoken. Mudanca na tipagem de `expiresIn` ja custou tempo aqui ' +
      '(ver parseDuration em auth/session-cookie.ts). Token emitido antes da subida continua ' +
      'valido, mas vale invalidar sessoes por precaucao.',
  },
  {
    nome: '@prisma/client',
    workspace: 'apps/bff',
    tipo: 'runtime',
    papel: 'Acesso ao banco. Cliente gerado a partir do schema.prisma.',
    impactoMajor:
      'ATENCAO ESPECIFICA: a versao 7 remove a configuracao `package.json#prisma`, que este ' +
      'projeto ainda usa para o seed — o aviso de depreciacao ja aparece em todo comando. ' +
      'Antes de subir para a 7 e preciso migrar para prisma.config.ts. Depois de qualquer ' +
      'atualizacao, `prisma generate` e obrigatorio, e no Windows ele falha com EPERM se o BFF ' +
      'estiver rodando (lock na DLL do engine).',
  },
  {
    nome: 'prisma',
    workspace: 'apps/bff',
    tipo: 'desenvolvimento',
    papel: 'CLI do Prisma: generate, db push, seed e o diff que gera o script de implantacao.',
    impactoMajor: 'Tem que ficar na MESMA versao do @prisma/client, senao o client nao gera.',
  },
  {
    nome: 'helmet',
    workspace: 'apps/bff',
    tipo: 'runtime',
    papel: 'Cabecalhos de seguranca HTTP no BFF.',
    impactoMajor: 'Major muda cabecalhos padrao. Conferir CSP e HSTS depois de subir.',
  },
  {
    nome: 'cookie-parser',
    workspace: 'apps/bff',
    tipo: 'runtime',
    papel: 'Leitura do cookie de sessao.',
    impactoMajor: null,
  },
  {
    nome: 'reflect-metadata',
    workspace: 'apps/bff',
    tipo: 'runtime',
    papel: 'Metadados de decorador — e o que permite a injecao de dependencia do Nest funcionar.',
    impactoMajor:
      'Sem ele o Nest nao resolve dependencia por tipo. E a mesma razao pela qual o CLI de carga ' +
      'de produtos vive em src/ e nao em scripts/: o tsx nao emite esse metadado.',
  },
  {
    nome: 'rxjs',
    workspace: 'apps/bff',
    tipo: 'runtime',
    papel: 'Exigida pelo Nest em interceptors e guards.',
    impactoMajor: 'Subir junto com o Nest, que dita a faixa suportada.',
  },
  {
    nome: 'tsx',
    workspace: 'apps/bff',
    tipo: 'desenvolvimento',
    papel: 'Executa TypeScript direto nos scripts de banco (seed, geracao de script, carga).',
    impactoMajor:
      'Compila com esbuild, que NAO emite emitDecoratorMetadata. Qualquer script que precise ' +
      'de injecao de dependencia do Nest tem que ser compilado pelo tsc, nao rodado por aqui.',
  },
  {
    nome: '@nestjs/cli',
    workspace: 'apps/bff',
    tipo: 'desenvolvimento',
    papel: 'build e start --watch do BFF.',
    impactoMajor:
      'Usa deleteOutDir. Junto com incremental do tsc, isso ja causou build que passa em ' +
      'silencio sem gerar dist/main.js — por isso tsBuildInfoFile aponta para dentro do dist.',
  },

  // -------------------------------------------------------- Compartilhados
  {
    nome: 'zod',
    workspace: 'packages/core',
    tipo: 'runtime',
    papel: 'Validacao. O MESMO schema roda na tela e no BFF, entao a regra nunca divergir.',
    impactoMajor:
      'A v4 mudou a API de validacao de string e o formato de issue. Como o schema e ' +
      'compartilhado, front e back tem que subir na MESMA mudanca — e o tratamento de erro de ' +
      'formulario (que le issue.path) precisa ser revisto.',
  },
  {
    nome: 'typescript',
    workspace: '(raiz)',
    tipo: 'desenvolvimento',
    papel: 'Linguagem e verificacao de tipos de todo o monorepo.',
    impactoMajor:
      'TypeScript nao usa semver como o resto do ecossistema: toda minor pode introduzir erro ' +
      'novo em codigo que compilava. Subir com `pnpm typecheck` a mao antes de comitar.',
  },
]
