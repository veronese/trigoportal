import type { ParameterType } from '@trigo/core'

export interface ParameterDefinition {
  key: string
  label: string
  description: string
  group: string
  type: ParameterType
  defaultValue: string | null
  isSecret?: boolean
}

/**
 * Catalogo de parametros do sistema.
 *
 * Esta e a fonte de verdade: o seed cria o que falta no banco e NAO sobrescreve
 * valor ja customizado. Parametro novo = uma entrada aqui + rodar `pnpm db:seed`.
 *
 * Regra de escopo: se o processo precisa do valor para SUBIR (string de conexao,
 * segredo do JWT), fica no .env. Se muda comportamento em runtime, fica aqui.
 */
export const PARAMETER_CATALOG: ParameterDefinition[] = [
  // --------------------------------------------------------------- Geral
  {
    key: 'PORTAL_NOME',
    label: 'Nome do portal',
    description: 'Exibido no menu, na tela de login e no titulo da aba.',
    group: 'Geral',
    type: 'STRING',
    defaultValue: 'Portal Trigo',
  },
  {
    key: 'PORTAL_MENSAGEM_LOGIN',
    label: 'Mensagem da tela de login',
    description: 'Texto de apoio abaixo do titulo na tela de acesso.',
    group: 'Geral',
    type: 'STRING',
    defaultValue: 'Entre com suas credenciais corporativas',
  },
  {
    key: 'PORTAL_EMAIL_SUPORTE',
    label: 'E-mail de suporte',
    description: 'Canal exibido ao usuario quando o acesso e recusado.',
    group: 'Geral',
    type: 'STRING',
    defaultValue: '',
  },
  {
    key: 'PORTAL_PAGINACAO_PADRAO',
    label: 'Registros por pagina',
    description: 'Quantidade padrao de linhas nas listagens do portal.',
    group: 'Geral',
    type: 'NUMBER',
    defaultValue: '20',
  },

  // ----------------------------------------------------------- Seguranca
  {
    key: 'SESSAO_DURACAO_HORAS',
    label: 'Duracao da sessao (horas)',
    description:
      'Validade do token de acesso. Alterar afeta apenas os logins seguintes, nao as sessoes ja abertas.',
    group: 'Seguranca',
    type: 'NUMBER',
    defaultValue: '8',
  },
  {
    key: 'SENHA_EXIGE_TROCA_PRIMEIRO_ACESSO',
    label: 'Exigir troca de senha no primeiro acesso',
    description:
      'Quando ativo, o usuario criado por um admin entra com a sessao travada na tela de troca de senha. Redefinicao de senha feita por admin sempre exige a troca, independente deste parametro.',
    group: 'Seguranca',
    type: 'BOOLEAN',
    defaultValue: 'true',
  },
  {
    key: 'SENHA_PROVISORIA_VALIDADE_HORAS',
    label: 'Validade da senha provisoria (horas)',
    description:
      'Prazo para o usuario usar a senha definida por um admin. Passado o prazo, o login e recusado e o admin precisa emitir uma nova. Zero desativa o prazo.',
    group: 'Seguranca',
    type: 'NUMBER',
    defaultValue: '72',
  },
  {
    key: 'LOGIN_TENTATIVAS_MAX',
    label: 'Tentativas de login antes do bloqueio',
    description:
      'Erros consecutivos de senha que bloqueiam a conta temporariamente. O contador zera a cada login bem-sucedido. Zero desativa o bloqueio.',
    group: 'Seguranca',
    type: 'NUMBER',
    defaultValue: '5',
  },
  {
    key: 'LOGIN_BLOQUEIO_MINUTOS',
    label: 'Duracao do bloqueio (minutos)',
    description:
      'Quanto tempo a conta fica bloqueada depois de estourar as tentativas. Um admin pode liberar antes em Cadastros > Usuarios.',
    group: 'Seguranca',
    type: 'NUMBER',
    defaultValue: '15',
  },

  // -------------------------------------------------------- Banco de dados
  //
  // A STRING DE CONEXAO NAO ENTRA AQUI, e nao e escolha de estilo: os
  // parametros ficam gravados no proprio banco, entao ler "onde esta o banco"
  // exigiria estar conectado a ele. DATABASE_URL vive no .env junto do que o
  // processo precisa para subir. O que cabe aqui e o COMPORTAMENTO das
  // consultas, que muda em runtime sem deploy.
  // -------------------------------------------------------- Banco de dados
  //
  // OS DADOS DE CONEXAO NAO ENTRAM AQUI. Servidor, banco, usuario e senha vivem
  // em DATABASE_URL no .env, junto do que o processo precisa antes de existir.
  // Dois motivos:
  //   1. os parametros ficam gravados no proprio banco — ler "onde esta o banco"
  //      a partir dele e circular;
  //   2. conexao editavel por tela e um caminho para trancar todo mundo fora do
  //      sistema com um erro de digitacao, inclusive quem foi corrigir.
  // A tela Configurador > Banco de dados mostra a conexao vigente em leitura.
  //
  // O que cabe aqui e o COMPORTAMENTO das consultas, que muda em runtime.
  {
    key: 'BANCO_LIMITE_REGISTROS_CONSULTA',
    label: 'Limite de registros por consulta',
    description:
      'Teto de linhas que uma listagem pode pedir de uma vez, mesmo que a tela solicite mais. Protege o banco de uma consulta que varre a tabela inteira.',
    group: 'Banco de dados',
    type: 'NUMBER',
    defaultValue: '100',
  },

  // ------------------------------------------------------------- Protheus
  //
  // NAO existe aqui empresa nem filial padrao. Empresa e filial sao obrigatorias
  // em cada chamada ao ERP (ver ProtheusTenant): tenant default em parametro
  // fazia a consulta ler a tabela de OUTRA empresa em silencio quando quem
  // chamava esquecia de informar. O prune do seed apaga PROTHEUS_EMPRESA e
  // PROTHEUS_FILIAL_PADRAO de bancos que ainda os tenham.
  {
    key: 'PROTHEUS_REST_URL',
    label: 'URL do REST do Protheus',
    description: 'Endereco base do appserver com mod_rest habilitado. Ex: http://servidor:8080/rest',
    group: 'Protheus',
    type: 'STRING',
    defaultValue: '',
  },
  {
    key: 'PROTHEUS_TIMEOUT_SEGUNDOS',
    label: 'Timeout das chamadas (segundos)',
    description: 'Tempo maximo de espera por resposta do Protheus antes de abortar.',
    group: 'Protheus',
    type: 'NUMBER',
    defaultValue: '30',
  },
  {
    key: 'PROTHEUS_CACHE_MINUTOS',
    label: 'Cache de consultas (minutos)',
    description:
      'Por quanto tempo o BFF reaproveita a resposta do Protheus. Protege licenca e thread do appserver. Zero desliga o cache.',
    group: 'Protheus',
    type: 'NUMBER',
    defaultValue: '5',
  },
  {
    key: 'PROTHEUS_CREDENCIAL',
    label: 'Credencial de integracao',
    description:
      'Usuario e senha que o portal usa para autenticar no REST do Protheus. Use uma conta de servico dedicada, com acesso apenas as rotinas necessarias — nunca a conta de uma pessoa. O par vai cifrado com AES-256-GCM e a senha nunca e devolvida pela API.',
    group: 'Protheus',
    type: 'CREDENTIAL',
    defaultValue: null,
    isSecret: true,
  },

  // ------------------------------------------------------- Carga de produtos
  {
    key: 'PRODUTOS_ENDPOINT',
    label: 'Rota do endpoint de produtos',
    description:
      'Caminho do WSRESTFUL zWsProdutos no appserver, relativo a URL base do REST. Mudou o nome do servico no Protheus? E aqui que se ajusta, sem deploy.',
    group: 'Carga de produtos',
    type: 'STRING',
    defaultValue: '/zWsProdutos/get_all',
  },
  {
    key: 'PRODUTOS_EMPRESAS',
    label: 'Empresas a carregar',
    description:
      'Codigos de empresa separados por virgula. Cada um vira uma chamada ao Protheus, lendo a tabela SB1 daquela empresa, e o codigo vai para a coluna EMPORI do produto. Ex: 02,09 le SB1020 e SB1090.',
    group: 'Carga de produtos',
    type: 'STRING',
    defaultValue: '02,09',
  },
  {
    key: 'PRODUTOS_PAGINA_TAMANHO',
    label: 'Registros por pagina na carga',
    description:
      'Quantos produtos o Protheus devolve por chamada. Pagina grande faz menos requisicoes mas ocupa a thread do appserver por mais tempo.',
    group: 'Carga de produtos',
    type: 'NUMBER',
    defaultValue: '200',
  },
  {
    key: 'PRODUTOS_PAGINAS_MAXIMO',
    label: 'Limite de paginas por empresa',
    description:
      'Trava de seguranca da carga. O endpoint zWsProdutos devolve a pagina 1 quando se pede pagina inexistente, o que sem limite viraria laco infinito. Zero remove a trava.',
    group: 'Carga de produtos',
    type: 'NUMBER',
    defaultValue: '2000',
  },
]

/** Parametros liberados sem autenticacao, para a tela de login. */
export const PUBLIC_PARAMETER_KEYS = [
  'PORTAL_NOME',
  'PORTAL_MENSAGEM_LOGIN',
  'PORTAL_EMAIL_SUPORTE',
] as const
