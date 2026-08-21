export type RiscoAtualizacao = 'baixo' | 'medio' | 'alto'

/** Atualizacao que NAO deve ser feita ainda, e o que falta antes. */
export interface BloqueioAtualizacao {
  pacote: string
  motivo: string
  comoResolver: string
}

/**
 * Condicao do ambiente verificada antes de gerar o plano.
 *
 * Nao sao comandos: sao leituras locais que o portal faz para avisar do que
 * costuma dar errado — a mais importante delas e a existencia de rollback.
 */
export interface PrecondicaoAtualizacao {
  nome: string
  atendida: boolean
  detalhe: string
  porQue: string
  /** Nao atendida, impede o plano de ser executado com seguranca. */
  critica: boolean
}

/**
 * Pacotes que sobem JUNTOS, numa unica etapa.
 *
 * Existe porque atualizar metade de um par acoplado (react sem react-dom,
 * prisma sem @prisma/client) nao compila — e o erro que aparece nao aponta a
 * causa.
 */
export interface GrupoAtualizacao {
  nome: string
  pacotes: Array<{ nome: string; workspace: string; de: string; para: string }>
  risco: RiscoAtualizacao
  /** Null quando o grupo tem um pacote so. */
  porQueJuntos: string | null
  /** Comandos na ordem de execucao. */
  comandos: string[]
  /** O que conferir antes de seguir para o proximo grupo. */
  verificacoes: string[]
  /** Nota de impacto do catalogo de dependencias. */
  impacto: string | null
}

export interface PlanoAtualizacao {
  geradoEm: string
  solicitados: string[]
  bloqueios: BloqueioAtualizacao[]
  precondicoes: PrecondicaoAtualizacao[]
  grupos: GrupoAtualizacao[]
  /** Como voltar atras. Vazio quando nao existe caminho de volta. */
  rollback: string[]
  /** Script completo, na ordem, pronto para copiar. */
  script: string
  /** Por que o portal nao executa isso sozinho. */
  porQueNaoExecutamos: string
}
