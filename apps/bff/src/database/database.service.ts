import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { DatabaseStatus, DatabaseTable } from '@trigo/core'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Diagnostico da conexao com o banco, para a tela do Configurador.
 *
 * SOMENTE LEITURA, por decisao de projeto. A conexao vive em DATABASE_URL no
 * .env e nao e editavel pelo portal: os parametros ficam gravados no proprio
 * banco (ler "onde esta o banco" a partir dele e circular), e conexao editavel
 * por tela e um caminho para trancar todo mundo fora com um erro de digitacao.
 * Este servico traz a configuracao vigente para dentro do portal sem nunca
 * expor a senha.
 */
@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async status(): Promise<DatabaseStatus> {
    const conexao = this.lerConexao()

    let conectado = false
    let latenciaMs: number | null = null
    let versaoServidor: string | null = null
    let detalheErro: string | null = null
    let tabelas: DatabaseTable[] = []

    const inicio = Date.now()
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1 AS ok')
      latenciaMs = Date.now() - inicio
      conectado = true
    } catch (erro) {
      detalheErro = this.mensagemCurta(erro)
      this.logger.warn(`Banco inacessivel: ${detalheErro}`)
      return { ...conexao, conectado, latenciaMs, versaoServidor, tabelas, detalheErro }
    }

    // Cada leitura extra e opcional: falta de permissao em uma nao deve
    // derrubar o diagnostico inteiro.
    versaoServidor = await this.versao()
    tabelas = await this.contagens()

    return { ...conexao, conectado, latenciaMs, versaoServidor, tabelas, detalheErro }
  }

  /**
   * Provider REALMENTE em uso, e nao o que o .env sugere.
   *
   * Existe porque o projeto tem dois schemas: SQL Server (producao) e SQLite
   * (desenvolvimento local em arquivo). Quem decide qual vale e o schema com
   * que o client foi gerado, nao a variavel de ambiente — as duas convivem no
   * .env. Assumir sqlserver fazia a tela reportar o servidor do Azure enquanto
   * consultava o arquivo local: diagnostico que mente e pior que diagnostico
   * nenhum.
   *
   * `_activeProvider` e interno do client gerado; por isso o acesso e
   * defensivo, com fallback pela URL.
   */
  private providerAtivo(): string {
    const interno = this.prisma as unknown as Record<string, unknown>
    const doClient = interno._activeProvider
    if (typeof doClient === 'string' && doClient !== '') return doClient

    const url = this.config.get<string>('DATABASE_URL') ?? ''
    return url.startsWith('sqlserver://') ? 'sqlserver' : 'desconhecido'
  }

  /**
   * Extrai servidor, banco e usuario da conexao ativa. A senha e descartada
   * aqui, no ponto de leitura — nao existe caminho em que ela chegue a resposta.
   */
  private lerConexao(): Omit<
    DatabaseStatus,
    'conectado' | 'latenciaMs' | 'versaoServidor' | 'tabelas' | 'detalheErro'
  > {
    const provider = this.providerAtivo()

    if (provider === 'sqlite') {
      // Banco em arquivo: nao ha servidor, porta, usuario nem TLS. O "banco" e
      // o caminho do arquivo, que e a informacao util aqui.
      const arquivo = (this.config.get<string>('DATABASE_URL_SQLITE') ?? '').replace(/^file:/, '')
      return {
        provider,
        servidor: '',
        porta: null,
        banco: arquivo || 'dev.db',
        usuario: '',
        criptografado: false,
      }
    }

    const url = this.config.get<string>('DATABASE_URL') ?? ''
    const vazio = {
      provider,
      servidor: '',
      porta: null,
      banco: '',
      usuario: '',
      criptografado: false,
    }

    if (!url.startsWith('sqlserver://')) return vazio

    const [enderecoEPorta = '', ...pares] = url.slice('sqlserver://'.length).split(';')
    const [servidor = '', portaTexto] = enderecoEPorta.split(':')

    const campos = new Map<string, string>()
    for (const par of pares) {
      const separador = par.indexOf('=')
      if (separador === -1) continue
      campos.set(par.slice(0, separador).trim().toLowerCase(), par.slice(separador + 1).trim())
    }

    return {
      provider,
      servidor,
      porta: portaTexto ? Number(portaTexto) : null,
      banco: campos.get('database') ?? '',
      usuario: campos.get('user') ?? '',
      criptografado: (campos.get('encrypt') ?? '').toLowerCase() === 'true',
    }
  }

  private async versao(): Promise<string | null> {
    try {
      const linhas = await this.prisma.$queryRawUnsafe<{ versao: string }[]>(
        'SELECT @@VERSION AS versao',
      )
      // O @@VERSION do SQL Server vem em varias linhas; a primeira identifica.
      return linhas[0]?.versao?.split('\n')[0]?.trim() ?? null
    } catch (erro) {
      this.logger.warn(`Nao foi possivel ler a versao do servidor: ${this.mensagemCurta(erro)}`)
      return null
    }
  }

  private async contagens(): Promise<DatabaseTable[]> {
    try {
      const [usuarios, parametros] = await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.parameter.count(),
      ])
      // Nome real no banco, nao o do modelo Prisma: quem abre a tela vai
      // procurar por tp_users no SSMS, nao por User.
      return [
        { nome: 'tp_users', registros: usuarios },
        { nome: 'tp_parameters', registros: parametros },
      ]
    } catch (erro) {
      this.logger.warn(`Nao foi possivel contar registros: ${this.mensagemCurta(erro)}`)
      return []
    }
  }

  /** Primeira linha da mensagem: o erro do Prisma vem com stack e dica longa. */
  private mensagemCurta(erro: unknown): string {
    const texto = erro instanceof Error ? erro.message : String(erro)
    return texto.split('\n')[0]?.trim().slice(0, 300) ?? 'erro desconhecido'
  }
}
