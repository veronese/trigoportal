/** Situacao de um item do diagnostico. */
export type DiagnosticoSituacao = 'ok' | 'atencao' | 'falha' | 'desconhecido'

/** Distancia entre a versao instalada e a mais recente publicada. */
export type SaltoDeVersao = 'igual' | 'patch' | 'minor' | 'major' | 'desconhecido'

export interface DiagnosticoRuntime {
  /** Versao do Node que esta EXECUTANDO o BFF agora. */
  node: string
  /** Minimo declarado em package.json#engines. */
  nodeMinimoExigido: string | null
  plataforma: string
  arquitetura: string
  /** NODE_ENV. Vazio significa desenvolvimento. */
  ambiente: string
  uptimeSegundos: number
  memoriaProcessoMb: number
  memoriaSistemaMb: number
  cpus: number
  diretorioDeTrabalho: string
  /** Raiz do monorepo, quando encontrada a partir do diretorio de trabalho. */
  raizDoProjeto: string | null
  fusoHorario: string
}

/**
 * Recurso de que o portal DEPENDE para funcionar. Nao e inventario de
 * biblioteca — e o que precisa existir no servidor ou na rede.
 */
export interface DiagnosticoRequisito {
  nome: string
  situacao: DiagnosticoSituacao
  /** O que foi observado. */
  detalhe: string
  /** Por que isso importa — o que quebra sem ele. */
  porQue: string
}

export interface DiagnosticoCaminho {
  /** Relativo a raiz do projeto. */
  caminho: string
  tipo: 'diretorio' | 'arquivo'
  papel: string
  existe: boolean
  tamanhoBytes: number | null
  modificadoEm: string | null
  /** Gerado por build ou ferramenta: nao editar, nao versionar. */
  gerado?: boolean
  /** Fora do versionamento: precisa ser recriado em cada ambiente. */
  naoVersionado?: boolean
  /** Ausencia deste item impede o portal de subir. */
  obrigatorio?: boolean
}

export interface DiagnosticoDependencia {
  nome: string
  /** Em qual pacote do monorepo ela e declarada. */
  workspace: string
  tipo: 'runtime' | 'desenvolvimento'
  /** Para que serve, em uma linha. */
  papel: string
  /** Faixa declarada no package.json (ex: ^15.5.3). */
  faixaDeclarada: string
  /** Versao realmente instalada em node_modules. */
  versaoInstalada: string | null
  /** Ultima publicada no registry. Null quando nao foi consultado. */
  versaoMaisRecente: string | null
  salto: SaltoDeVersao
  /**
   * O que uma atualizacao implica. Texto CURADO por quem mantem o portal, nao
   * calculado — por isso vem com a data da ultima revisao.
   */
  impacto: string | null
}

export interface SystemDiagnostics {
  geradoEm: string
  runtime: DiagnosticoRuntime
  requisitos: DiagnosticoRequisito[]
  diretorios: DiagnosticoCaminho[]
  arquivos: DiagnosticoCaminho[]
  dependencias: DiagnosticoDependencia[]
  /** Data da ultima revisao manual dos textos de impacto. */
  impactosRevisadosEm: string
  /** true quando as versoes mais recentes foram buscadas no registry. */
  atualizacoesConsultadas: boolean
  /** Preenchido quando a consulta ao registry falhou, total ou parcialmente. */
  erroAtualizacoes: string | null
}
