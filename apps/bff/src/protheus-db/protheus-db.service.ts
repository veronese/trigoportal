import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import sql from 'mssql'
import type { ProtheusDbConfig, ProtheusDbTabela, ProtheusDbTestResult } from '@trigo/core'
import { ParametersService } from '../parameters/parameters.service'

/** O que o BFF precisa para abrir a conexao. Fica no processo, nunca sai. */
interface ConexaoProtheusDb {
  host: string
  porta: number
  banco: string
  usuario: string
  senha: string
  criptografia: boolean
  certificadoConfiavel: boolean
  timeoutMs: number
}

/**
 * Conexao direta com o SQL Server do Protheus, em LEITURA.
 *
 * POR QUE EXISTE, ao lado do REST: o appserver recusa empresa sem ambiente
 * preparado — foi o que barrou a empresa 09 em todas as tentativas. O banco nao
 * tem esse conceito: `SB1090` e uma tabela como outra qualquer, no mesmo banco
 * da `SB1020`.
 *
 * O QUE ESTE SERVICO NAO FAZ: escrever. Nao ha metodo de escrita aqui, e nao e
 * esquecimento. Gravar no Protheus por SQL pula validacao, gatilho e log do
 * framework — e assim que se corrompe um ERP em silencio. Inclusao e alteracao
 * continuam pelo REST, com ExecAuto.
 */
@Injectable()
export class ProtheusDbService {
  private readonly logger = new Logger(ProtheusDbService.name)

  constructor(private readonly parameters: ParametersService) {}

  /** O que esta configurado hoje, sem a senha. Alimenta a tela. */
  async config(): Promise<ProtheusDbConfig> {
    const [host, porta, banco, credencial, criptografia, certificado, timeout] = await Promise.all([
      this.parameters.getString('PROTHEUS_DB_HOST'),
      this.parameters.getNumber('PROTHEUS_DB_PORTA', 1433),
      this.parameters.getString('PROTHEUS_DB_BANCO'),
      this.parameters.getCredential('PROTHEUS_DB_CREDENCIAL'),
      this.parameters.getBoolean('PROTHEUS_DB_CRIPTOGRAFIA', true),
      this.parameters.getBoolean('PROTHEUS_DB_CERTIFICADO_CONFIAVEL', true),
      this.parameters.getNumber('PROTHEUS_DB_TIMEOUT_SEGUNDOS', 15),
    ])

    // Cada pendencia diz o que fazer, e nao so o que falta: "configurado: false"
    // sozinho manda a pessoa procurar qual dos sete campos esta vazio.
    const pendencias: string[] = []
    if (!host.trim()) pendencias.push('Informe o servidor do banco em Configurador > Parametros.')
    if (!banco.trim()) pendencias.push('Informe o nome do banco de dados.')
    if (!credencial?.usuario) pendencias.push('Informe a credencial do banco (login e senha).')

    return {
      host: host.trim(),
      porta,
      banco: banco.trim(),
      usuario: credencial?.usuario ?? '',
      senhaConfigurada: Boolean(credencial?.senha),
      criptografia,
      certificadoConfiavel: certificado,
      timeoutSegundos: timeout,
      configurado: pendencias.length === 0,
      pendencias,
    }
  }

  /** A conexao completa, com senha. Recusa quando falta configuracao. */
  private async conexao(): Promise<ConexaoProtheusDb> {
    const config = await this.config()
    const credencial = await this.parameters.getCredential('PROTHEUS_DB_CREDENCIAL')

    if (!config.configurado || !credencial) {
      throw new ServiceUnavailableException({
        message: `A conexao com o banco do Protheus nao esta configurada. ${config.pendencias.join(' ')}`,
      })
    }

    return {
      host: config.host,
      porta: config.porta,
      banco: config.banco,
      usuario: credencial.usuario,
      senha: credencial.senha,
      criptografia: config.criptografia,
      certificadoConfiavel: config.certificadoConfiavel,
      timeoutMs: Math.max(1, config.timeoutSegundos) * 1000,
    }
  }

  /**
   * Abre uma conexao, roda o trabalho e fecha.
   *
   * SEM POOL de proposito, por enquanto: o portal ainda nao tem carga que
   * justifique, e conexao aberta contra o banco do ERP e coisa que se abre
   * quando precisa. Se a carga passar a ser frequente, e aqui que um pool
   * entra — em um lugar so.
   */
  private async comConexao<T>(trabalho: (pool: sql.ConnectionPool) => Promise<T>): Promise<T> {
    const c = await this.conexao()

    const pool = new sql.ConnectionPool({
      server: c.host,
      port: c.porta,
      database: c.banco,
      user: c.usuario,
      password: c.senha,
      connectionTimeout: c.timeoutMs,
      requestTimeout: c.timeoutMs,
      options: {
        encrypt: c.criptografia,
        trustServerCertificate: c.certificadoConfiavel,
        // O ETL le dados do ERP em producao. Sem isso, uma consulta pesada
        // pode esperar bloqueio de quem esta faturando do outro lado.
        readOnlyIntent: true,
      },
      pool: { max: 4, min: 0, idleTimeoutMillis: 5000 },
    })

    try {
      await pool.connect()
      return await trabalho(pool)
    } finally {
      await pool.close().catch(() => undefined)
    }
  }

  /**
   * Exercita a conexao de verdade e conta o que encontrou.
   *
   * Responde mais que "conectou": diz em qual banco entrou, com qual login, se
   * esse login consegue escrever, e quais tabelas de produto existem. E esta
   * ultima pergunta que decide se o ETL da empresa 09 tem o que ler.
   */
  async testar(): Promise<ProtheusDbTestResult> {
    const inicio = Date.now()
    const vazio: ProtheusDbTestResult = {
      ok: false,
      detalhe: '',
      duracaoMs: 0,
      servidor: null,
      versaoServidor: null,
      banco: null,
      loginEfetivo: null,
      podeEscrever: null,
      tabelas: [],
      erro: null,
    }

    let empresas: string[] = []
    try {
      const bruto = await this.parameters.getString('PRODUTOS_EMPRESAS', '02,09')
      empresas = [...new Set(bruto.split(',').map((e) => e.trim()).filter(Boolean))]
    } catch {
      empresas = []
    }

    try {
      return await this.comConexao(async (pool) => {
        const identidade = await pool.request().query<{
          servidor: string
          versao: string
          banco: string
          login: string
        }>(`
          SELECT
            CONVERT(varchar(200), SERVERPROPERTY('MachineName'))      AS servidor,
            CONVERT(varchar(400), @@VERSION)                          AS versao,
            DB_NAME()                                                 AS banco,
            SUSER_SNAME()                                             AS login
        `)

        const linha = identidade.recordset[0]

        // Escrita e ALERTA, nao recurso. Perguntado ao proprio SQL Server em
        // vez de deduzido do nome da role: permissao negada pontualmente ou
        // concedida por outro caminho nao apareceria numa checagem de role.
        const permissao = await pool.request().query<{ insere: number; altera: number }>(`
          SELECT
            CONVERT(int, ISNULL(HAS_PERMS_BY_NAME(NULL, NULL, 'INSERT'), 0)) AS insere,
            CONVERT(int, ISNULL(HAS_PERMS_BY_NAME(NULL, NULL, 'UPDATE'), 0)) AS altera
        `)
        const podeEscrever =
          permissao.recordset[0]?.insere === 1 || permissao.recordset[0]?.altera === 1

        const tabelas = await this.conferirTabelas(pool, empresas)
        const duracaoMs = Date.now() - inicio

        const encontradas = tabelas.filter((t) => t.existe)
        const detalhe =
          `Conectado em ${linha?.banco ?? '?'} como ${linha?.login ?? '?'}. ` +
          (tabelas.length === 0
            ? 'Nenhuma empresa configurada em PRODUTOS_EMPRESAS para conferir.'
            : `${encontradas.length} de ${tabelas.length} tabela(s) de produto encontrada(s).`) +
          (podeEscrever
            ? ' ATENCAO: este login tem permissao de escrita. Use um login somente leitura.'
            : '')

        return {
          ok: true,
          detalhe,
          duracaoMs,
          servidor: linha?.servidor ?? null,
          versaoServidor: this.primeiraLinha(linha?.versao ?? null),
          banco: linha?.banco ?? null,
          loginEfetivo: linha?.login ?? null,
          podeEscrever,
          tabelas,
          erro: null,
        }
      })
    } catch (error) {
      const erro = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Teste do banco do Protheus falhou: ${erro}`)
      return {
        ...vazio,
        duracaoMs: Date.now() - inicio,
        detalhe: this.explicar(erro),
        erro: this.primeiraLinha(erro),
      }
    }
  }

  /**
   * Existe a tabela de produtos de cada empresa, e quantos registros tem.
   *
   * Uma tabela ausente NAO derruba o teste: a resposta util e "a 02 tem 30 mil
   * e a 09 nao existe", e nao um erro que esconde as duas informacoes.
   */
  private async conferirTabelas(
    pool: sql.ConnectionPool,
    empresas: string[],
  ): Promise<ProtheusDbTabela[]> {
    const resultado: ProtheusDbTabela[] = []

    for (const empresa of empresas) {
      // Padrao do Protheus: <alias><empresa>0. Empresa 02 le SB1020, empresa 09
      // le SB1090 — atencao que o codigo e 09, e nao 90.
      const nome = `SB1${empresa}0`
      const parcial: ProtheusDbTabela = {
        empresa,
        nome,
        existe: false,
        registros: null,
        detalhe: null,
      }

      try {
        // Nome de tabela nao entra como parametro em nenhum banco, entao a
        // existencia e perguntada ao catalogo COM parametro, e a contagem so
        // acontece depois que o proprio SQL Server confirmou o nome.
        const existe = await pool
          .request()
          .input('nome', sql.VarChar(128), nome)
          .query<{ total: number }>(
            `SELECT COUNT(*) AS total FROM sys.tables WHERE name = @nome`,
          )

        parcial.existe = (existe.recordset[0]?.total ?? 0) > 0

        if (!parcial.existe) {
          parcial.detalhe = `A tabela ${nome} nao existe neste banco.`
        } else {
          const contagem = await pool
            .request()
            .query<{ total: number }>(
              `SELECT COUNT(*) AS total FROM [${nome}] WITH (NOLOCK) WHERE D_E_L_E_T_ = ' '`,
            )
          parcial.registros = contagem.recordset[0]?.total ?? 0
        }
      } catch (error) {
        parcial.detalhe = this.primeiraLinha(
          error instanceof Error ? error.message : String(error),
        )
      }

      resultado.push(parcial)
    }

    return resultado
  }

  /**
   * Traduz o erro do driver para o que a pessoa precisa fazer.
   *
   * "ESOCKET" e "ELOGIN" nao dizem nada a quem esta preenchendo a tela, e as
   * duas causas mais comuns aqui — porta fechada e login errado — pedem acoes
   * completamente diferentes.
   */
  private explicar(erro: string): string {
    const texto = erro.toLowerCase()

    // Falta de configuracao nao e falha de conexao: a mensagem ja diz o que
    // preencher, e prefixar com "Falha ao conectar" sugere problema de rede.
    if (texto.includes('nao esta configurada')) return erro

    // ORDEM IMPORTA: o driver prefixa quase tudo com "Failed to connect to
    // host:porta", inclusive o nome que nao resolveu. A causa especifica vem
    // antes da generica, senao toda falha vira "sem resposta no tempo limite".
    if (texto.includes('getaddrinfo') || texto.includes('enotfound')) {
      return 'O nome do servidor nao foi resolvido. Confira o host, ou use o IP.'
    }
    if (texto.includes('elogin') || texto.includes('login failed')) {
      return 'O servidor respondeu, mas recusou o login. Confira usuario e senha da credencial.'
    }
    if (texto.includes('cannot open database') || texto.includes('não pode ser aberto')) {
      return 'O login foi aceito, mas o banco informado nao existe ou o login nao tem acesso a ele.'
    }
    if (texto.includes('certificate') || texto.includes('self signed') || texto.includes('self-signed')) {
      return (
        'A conexao foi recusada pelo certificado do servidor. Ligue "Aceitar certificado nao ' +
        'verificado" se o SQL Server usa certificado autoassinado.'
      )
    }
    // 'Could not connect (sequence)' e como o tedious relata conexao recusada.
    if (texto.includes('econnrefused') || texto.includes('could not connect')) {
      return (
        'O servidor respondeu recusando a conexao na porta informada. Confira a porta e se a ' +
        'instancia do SQL Server esta ouvindo nela.'
      )
    }
    // "Failed to connect to host:porta in NNNNms" e a forma que o driver usa
    // para porta filtrada ou host inalcancavel — a causa mais comum aqui.
    if (
      texto.includes('esocket') ||
      texto.includes('etimeout') ||
      texto.includes('timeout') ||
      /failed to connect to .+ in \d+ms/.test(texto)
    ) {
      return (
        'Nao houve resposta do servidor no tempo limite. Confira IP e porta, e se este servidor ' +
        'alcanca o banco pela rede — o banco do Protheus normalmente so responde na rede interna ' +
        'ou por VPN.'
      )
    }

    return `Falha ao conectar: ${this.primeiraLinha(erro)}`
  }

  private primeiraLinha(valor: string | null): string | null {
    if (!valor) return null
    return valor.split('\n')[0]!.trim()
  }
}
