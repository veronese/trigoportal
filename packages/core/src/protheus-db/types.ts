/**
 * Conexao DIRETA com o banco do Protheus, em leitura.
 *
 * Existe ao lado da conexao REST, e nao no lugar dela. Cada uma alcanca o que a
 * outra nao alcanca:
 *
 *  - o REST respeita o ambiente do appserver, e por isso recusa empresa que nao
 *    tenha ambiente preparado — foi o que barrou a empresa 09;
 *  - o banco nao tem o conceito de ambiente. `SB1090` e uma tabela como outra
 *    qualquer, no mesmo banco da `SB1020`.
 *
 * O preco e que a responsabilidade muda de lado: filial, `D_E_L_E_T_` e
 * tamanho de campo deixam de ser resolvidos pelo framework e passam a ser
 * escritos por nos, a vista.
 */

/** O que esta configurado. A senha nunca aparece aqui, nem mascarada. */
export interface ProtheusDbConfig {
  host: string
  porta: number
  banco: string
  usuario: string
  /** Se ha senha guardada. O valor em si nunca sai do BFF. */
  senhaConfigurada: boolean
  criptografia: boolean
  certificadoConfiavel: boolean
  timeoutSegundos: number
  /** Falso quando falta host, banco ou credencial. */
  configurado: boolean
  /** O que ainda falta preencher, em linguagem de quem vai preencher. */
  pendencias: string[]
}

/** Uma tabela de produtos e o que foi encontrado nela. */
export interface ProtheusDbTabela {
  empresa: string
  nome: string
  existe: boolean
  /** Nulo quando a tabela nao existe ou a contagem falhou. */
  registros: number | null
  /** Motivo, quando a contagem nao foi possivel. */
  detalhe: string | null
}

/**
 * Resultado do teste de conexao.
 *
 * Responde mais que "conectou": diz em qual banco entrou, com qual login, se
 * esse login consegue ESCREVER — que seria um erro de configuracao — e quais
 * tabelas de produto existem de fato.
 */
export interface ProtheusDbTestResult {
  ok: boolean
  /** Frase pronta para a tela. */
  detalhe: string
  duracaoMs: number
  servidor: string | null
  versaoServidor: string | null
  banco: string | null
  loginEfetivo: string | null
  /**
   * O login consegue gravar? true e ALERTA, nao sucesso: o ETL le, e credencial
   * com escrita transforma um erro de consulta em risco para o ERP.
   */
  podeEscrever: boolean | null
  tabelas: ProtheusDbTabela[]
  /** Primeira linha do erro, quando falha. */
  erro: string | null
}

// ---------------------------------------------------------------------------
// Console de consulta
// ---------------------------------------------------------------------------

/** Uma tabela do banco do Protheus, para navegar antes de escrever a consulta. */
export interface TabelaBanco {
  nome: string
  esquema: string
  /**
   * Estimativa vinda do catalogo, nao um COUNT.
   *
   * Contar de verdade em centenas de tabelas do ERP levaria minutos e ainda
   * seguraria a listagem. Para escolher a tabela, a ordem de grandeza basta.
   *
   * NULO quando o login nao tem permissao de ler as estatisticas. Um login
   * somente leitura costuma nao ter, e a lista de tabelas vale por si — por
   * isso a contagem e opcional e nao derruba a listagem.
   */
  registrosEstimados: number | null
}

/** Uma coluna, como o dicionario fisico a descreve. */
export interface ColunaBanco {
  nome: string
  tipo: string
  tamanho: number | null
  aceitaNulo: boolean
}

/** Resultado de uma consulta do console. */
export interface ConsultaSqlResult {
  ok: boolean
  /** Colunas na ORDEM do SELECT. Objeto JSON nao garante ordem de chave. */
  colunas: string[]
  linhas: Record<string, unknown>[]
  totalLinhas: number
  /** true quando o limite cortou o resultado — a consulta tinha mais. */
  truncado: boolean
  duracaoMs: number
  /** Mensagem pronta para a tela quando a consulta e recusada ou falha. */
  erro: string | null
}
