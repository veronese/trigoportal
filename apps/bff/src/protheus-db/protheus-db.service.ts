import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import sql from 'mssql'
import {
  analisarSqlLeitura,
  type ColunaBanco,
  type ConsultaSqlResult,
  type ProtheusDbConfig,
  type ProtheusDbTabela,
  type ProtheusDbTestResult,
  type TabelaBanco,
} from '@trigo/core'
import { ParametersService } from '../parameters/parameters.service'

/**
 * Teto da listagem de tabelas.
 *
 * O banco do Protheus tem 59.015 tabelas. Devolver todas trava o navegador
 * antes de a pessoa conseguir ler a primeira — e quem procura uma tabela sabe
 * ao menos o comeco do nome. O filtro e a ferramenta; a lista sem filtro e so
 * um ponto de partida.
 */
const TETO_TABELAS = 300

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
   * UMA CONEXAO POR CHAMADA, para operacao avulsa: consulta do console, teste,
   * listagem de tabelas. Conexao contra o banco do ERP e coisa que se abre
   * quando precisa.
   *
   * Para PERCORRER, use percorrerProdutos(). Paginar chamando este metodo uma
   * vez por pagina custou uma carga: 37 handshakes TCP+TLS contra um servidor
   * remoto, e a carga da empresa 09 morreu na quinta pagina com timeout de
   * conexao depois de 8.000 dos 41.861 registros.
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
   * Uma pagina do cadastro de produtos, direto da tabela fisica.
   *
   * SEM FILTRO DE FILIAL de proposito. A SB1 e compartilhada, e a contagem por
   * `D_E_L_E_T_` sozinha deu exatamente os 30.393 que a carga REST trouxe da
   * empresa 02 — o filtro de filial nao mudaria nada e so poderia zerar o
   * resultado se o dicionario mudasse.
   *
   * ORDER BY R_E_C_N_O_ porque OFFSET exige ordenacao e o RECNO e a unica
   * estavel: por B1_COD, um produto incluido no meio da carga deslocaria a
   * paginacao e sumiria de uma pagina ja lida.
   */
  async lerProdutos(opcoes: {
    empresa: string
    pulo: number
    tamanho: number
  }): Promise<Record<string, unknown>[]> {
    const tabela = this.tabelaProdutos(opcoes.empresa)

    return this.comConexao(async (pool) => {
      // O nome da tabela nao entra como parametro em banco nenhum, entao e
      // montado a partir da empresa JA validada e conferido no catalogo antes
      // de ser concatenado.
      await this.exigirTabela(pool, tabela)

      const resultado = await pool
        .request()
        .input('pulo', sql.Int, Math.max(0, Math.trunc(opcoes.pulo)))
        .input('tamanho', sql.Int, Math.max(1, Math.trunc(opcoes.tamanho)))
        .query<Record<string, unknown>>(`
          SELECT
            TAB.B1_COD, TAB.B1_DESC, TAB.B1_TIPO, TAB.B1_UM,
            TAB.B1_LOCPAD, TAB.B1_GRUPO, TAB.B1_MSBLQL, TAB.B1_ATIVO,
            TAB.B1_POSIPI, TAB.B1_XCTACUS, TAB.B1_XCTADES, TAB.B1_XCONTA,
            TAB.B1_CONTA, TAB.B1_MODELO
          FROM [${tabela}] TAB WITH (NOLOCK)
          WHERE TAB.D_E_L_E_T_ = ' '
          ORDER BY TAB.R_E_C_N_O_
          OFFSET @pulo ROWS FETCH NEXT @tamanho ROWS ONLY
        `)

      return resultado.recordset
    })
  }

  /**
   * Percorre o cadastro de produtos de uma empresa em UMA conexao so.
   *
   * POR QUE NAO E `lerProdutos` EM LACO: era, e nao funcionou. Abrir e fechar
   * conexao por pagina fez 37 handshakes contra o banco remoto, e a carga da
   * empresa 09 caiu com timeout na quinta pagina. Aqui a conexao abre uma vez,
   * pagina inteira por dentro, e fecha no fim.
   *
   * Entrega por callback em vez de devolver tudo: 41.861 produtos com 14 campos
   * na memoria do BFF antes de gravar qualquer um seria desperdicio, e o
   * chamador ja grava pagina a pagina.
   */
  async percorrerProdutos(
    empresa: string,
    tamanho: number,
    aoLer: (linhas: Record<string, unknown>[]) => Promise<void>,
  ): Promise<{ lidos: number; paginas: number }> {
    const tabela = this.tabelaProdutos(empresa)
    const passo = Math.max(1, Math.min(5000, Math.trunc(tamanho)))

    return this.comConexao(async (pool) => {
      await this.exigirTabela(pool, tabela)

      let pulo = 0
      let paginas = 0

      for (;;) {
        const r = await pool
          .request()
          .input('pulo', sql.Int, pulo)
          .input('tamanho', sql.Int, passo)
          .query<Record<string, unknown>>(`
            SELECT
              TAB.B1_COD, TAB.B1_DESC, TAB.B1_TIPO, TAB.B1_UM,
              TAB.B1_LOCPAD, TAB.B1_GRUPO, TAB.B1_MSBLQL, TAB.B1_ATIVO,
              TAB.B1_POSIPI, TAB.B1_XCTACUS, TAB.B1_XCTADES, TAB.B1_XCONTA,
              TAB.B1_CONTA, TAB.B1_MODELO
            FROM [${tabela}] TAB WITH (NOLOCK)
            WHERE TAB.D_E_L_E_T_ = ' '
            ORDER BY TAB.R_E_C_N_O_
            OFFSET @pulo ROWS FETCH NEXT @tamanho ROWS ONLY
          `)

        const linhas = r.recordset
        // Pagina vazia e o fim. Nao ha COUNT previo de proposito: o total
        // poderia mudar entre a contagem e a leitura, e a pagina vazia e a
        // condicao de parada que nao depende disso.
        if (linhas.length === 0) break

        await aoLer(linhas)

        paginas++
        pulo += linhas.length

        if (linhas.length < passo) break
      }

      return { lidos: pulo, paginas }
    })
  }

  /** Quantos produtos vivos a empresa tem. */
  async contarProdutos(empresa: string): Promise<number> {
    const tabela = this.tabelaProdutos(empresa)

    return this.comConexao(async (pool) => {
      await this.exigirTabela(pool, tabela)
      const r = await pool
        .request()
        .query<{ total: number }>(
          `SELECT COUNT(*) AS total FROM [${tabela}] WITH (NOLOCK) WHERE D_E_L_E_T_ = ' '`,
        )
      return r.recordset[0]?.total ?? 0
    })
  }

  /**
   * Nome fisico da tabela de produtos, com a empresa validada.
   *
   * Padrao do Protheus: <alias><empresa>0. Empresa 02 le SB1020, empresa 09 le
   * SB1090 — atencao que o codigo e 09, e nao 90.
   */
  private tabelaProdutos(empresa: string): string {
    const limpo = empresa.trim()
    if (!/^[A-Za-z0-9]{2}$/.test(limpo)) {
      throw new BadRequestException(
        `Empresa invalida: "${empresa}". Espero dois caracteres alfanumericos, como 02 ou 09.`,
      )
    }
    return `SB1${limpo}0`
  }

  /** Recusa antes de concatenar um nome que o catalogo nao conhece. */
  private async exigirTabela(pool: sql.ConnectionPool, tabela: string): Promise<void> {
    const r = await pool
      .request()
      .input('nome', sql.VarChar(128), tabela)
      .query<{ total: number }>(`SELECT COUNT(*) AS total FROM sys.tables WHERE name = @nome`)

    if ((r.recordset[0]?.total ?? 0) === 0) {
      throw new BadRequestException(`A tabela ${tabela} nao existe neste banco.`)
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

  // ------------------------------------------------------------------ console

  /**
   * Todas as tabelas do banco, para navegar antes de escrever a consulta.
   *
   * A contagem vem de `sys.dm_db_partition_stats`, que e ESTIMATIVA das
   * estatisticas. Um COUNT em cada tabela de um ERP levaria minutos e ainda
   * seguraria a tela — para escolher a tabela, a ordem de grandeza basta, e a
   * consulta que a pessoa vai escrever conta de verdade.
   */
  async listarTabelas(busca?: string): Promise<TabelaBanco[]> {
    const filtro = (busca ?? '').trim()
    const like = filtro === '' ? null : `%${filtro}%`
    const prefixo = filtro === '' ? null : `${filtro}%`

    return this.comConexao(async (pool) => {
      // PRIMEIRO com a contagem. `sys.partitions` e catalogo, e nao a DMV
      // dm_db_partition_stats, que exige VIEW DATABASE STATE — permissao que um
      // login somente leitura normalmente nao tem, e cuja falta derrubava a
      // listagem inteira em vez de so a contagem.
      try {
        const r = await pool
          .request()
          .input('busca', sql.VarChar(128), like)
          .input('prefixo', sql.VarChar(128), prefixo)
          .input('teto', sql.Int, TETO_TABELAS)
          .query<{ nome: string; esquema: string; registros: number }>(`
            SELECT TOP (@teto)
              t.name AS nome,
              s.name AS esquema,
              CONVERT(int, ISNULL(SUM(p.rows), 0)) AS registros
            FROM sys.tables t
            JOIN sys.schemas s ON s.schema_id = t.schema_id
            LEFT JOIN sys.partitions p
                   ON p.object_id = t.object_id AND p.index_id IN (0, 1)
            WHERE (@busca IS NULL OR t.name LIKE @busca)
            GROUP BY t.name, s.name
            -- Prefixo primeiro: quem digita "SB1" quer SB1010 antes de CSB100.
            ORDER BY CASE WHEN @prefixo IS NULL OR t.name LIKE @prefixo THEN 0 ELSE 1 END, t.name
          `)

        return r.recordset.map((linha) => ({
          nome: linha.nome,
          esquema: linha.esquema,
          registrosEstimados: linha.registros,
        }))
      } catch (error) {
        this.logger.warn(
          'Nao foi possivel estimar o tamanho das tabelas (o login nao le as estatisticas). ' +
            `Listando sem contagem. Detalhe: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      // A lista de tabelas vale por si: sem ela a tela fica vazia e a pessoa
      // nao tem por onde comecar. A contagem e conveniencia.
      const r = await pool
        .request()
        .input('busca', sql.VarChar(128), like)
        .input('prefixo', sql.VarChar(128), prefixo)
        .input('teto', sql.Int, TETO_TABELAS)
        .query<{ nome: string; esquema: string }>(`
          SELECT TOP (@teto) t.name AS nome, s.name AS esquema
          FROM sys.tables t
          JOIN sys.schemas s ON s.schema_id = t.schema_id
          WHERE (@busca IS NULL OR t.name LIKE @busca)
          ORDER BY CASE WHEN @prefixo IS NULL OR t.name LIKE @prefixo THEN 0 ELSE 1 END, t.name
        `)

      return r.recordset.map((linha) => ({
        nome: linha.nome,
        esquema: linha.esquema,
        registrosEstimados: null,
      }))
    })
  }

  /** Colunas de uma tabela, com tipo e tamanho do dicionario fisico. */
  async descreverTabela(tabela: string): Promise<ColunaBanco[]> {
    const nome = tabela.trim()
    if (!/^[A-Za-z0-9_$#]{1,128}$/.test(nome)) {
      throw new BadRequestException(`Nome de tabela invalido: "${tabela}".`)
    }

    return this.comConexao(async (pool) => {
      const r = await pool
        .request()
        .input('nome', sql.VarChar(128), nome)
        .query<{ nome: string; tipo: string; tamanho: number; nulo: boolean }>(`
          SELECT
            c.name                AS nome,
            ty.name               AS tipo,
            c.max_length          AS tamanho,
            c.is_nullable         AS nulo
          FROM sys.columns c
          JOIN sys.tables t  ON t.object_id = c.object_id
          JOIN sys.types ty  ON ty.user_type_id = c.user_type_id
          WHERE t.name = @nome
          ORDER BY c.column_id
        `)

      return r.recordset.map((linha) => ({
        nome: linha.nome,
        tipo: linha.tipo,
        tamanho: linha.tamanho === -1 ? null : linha.tamanho,
        aceitaNulo: Boolean(linha.nulo),
      }))
    })
  }

  /**
   * Executa uma consulta escrita a mao.
   *
   * DUAS TRAVAS, e as duas precisam existir:
   *
   *  - `analisarSqlLeitura` recusa o que nao for SELECT/WITH. Ela e a que
   *    produz mensagem util; sozinha, seria contornavel por alguem que
   *    conheca SQL melhor que a lista.
   *  - o LOGIN somente leitura e quem de fato impede a escrita, no servidor.
   *    Sozinho, devolveria um erro do driver que ninguem entende.
   *
   * `SET ROWCOUNT` limita no BANCO, e nao no Node. Cortar depois de receber
   * significaria materializar milhoes de linhas de uma SD1 na memoria do BFF
   * antes de jogar fora.
   */
  async consultar(sqlBruto: string, limite: number, autor: string): Promise<ConsultaSqlResult> {
    const inicio = Date.now()
    const teto = Math.max(1, Math.min(10000, Math.trunc(limite)))

    const analise = analisarSqlLeitura(sqlBruto)
    if (!analise.permitido) {
      return {
        ok: false,
        colunas: [],
        linhas: [],
        totalLinhas: 0,
        truncado: false,
        duracaoMs: Date.now() - inicio,
        erro: analise.motivo,
      }
    }

    // Consulta livre contra a producao do ERP fica registrada com o autor. Nao
    // e auditoria formal, mas responde "quem rodou aquilo" sem adivinhacao.
    this.logger.log(`Consulta ao banco do Protheus por ${autor}: ${this.resumir(sqlBruto)}`)

    try {
      return await this.comConexao(async (pool) => {
        const request = pool.request()
        // +1 para saber se havia mais linhas alem do limite, sem contar duas vezes.
        const resultado = await request.query(
          `SET ROWCOUNT ${teto + 1};
${sqlBruto};
SET ROWCOUNT 0;`,
        )

        const recordset = resultado.recordset ?? []
        const truncado = recordset.length > teto
        const linhas = (truncado ? recordset.slice(0, teto) : recordset) as Record<
          string,
          unknown
        >[]

        // A ordem das colunas vem do metadata, e nao das chaves do objeto:
        // JSON nao garante ordem, e a tela precisa das colunas como no SELECT.
        const colunas = Object.keys(resultado.recordset?.columns ?? {})

        return {
          ok: true,
          colunas: colunas.length > 0 ? colunas : Object.keys(linhas[0] ?? {}),
          linhas,
          totalLinhas: linhas.length,
          truncado,
          duracaoMs: Date.now() - inicio,
          erro: null,
        }
      })
    } catch (error) {
      const erro = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        colunas: [],
        linhas: [],
        totalLinhas: 0,
        truncado: false,
        duracaoMs: Date.now() - inicio,
        erro: this.explicar(erro),
      }
    }
  }

  /** Uma linha do SQL para o log, sem despejar a consulta inteira. */
  private resumir(sqlBruto: string): string {
    const linha = sqlBruto.replace(/\s+/g, ' ').trim()
    return linha.length > 200 ? `${linha.slice(0, 200)}...` : linha
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
