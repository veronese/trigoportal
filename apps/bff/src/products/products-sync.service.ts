import { Injectable, Logger } from '@nestjs/common'
import type { ProductSyncCompanyResult, ProductSyncResult } from '@trigo/core'
import { ParametersService } from '../parameters/parameters.service'
import { PrismaService } from '../prisma/prisma.service'
import type { ProtheusTenant } from '../protheus/protheus.client'
import { ZwsProdutosClient, type ZwsProduto } from './zws-produtos.client'

/** Empresa a carregar. `filial` nula = nao foi possivel resolver o tenant. */
interface Alvo {
  empresa: string
  filial: string | null
}

/**
 * Carga do cadastro unificado de produtos, a partir do endpoint zWsProdutos.
 *
 * A REGRA DO EMPORI vive aqui, e nao no Protheus, de proposito: mudar regra de
 * negocio no portal e um deploy do BFF; mudar no RPO e recompilar e reiniciar
 * o appserver. Fica do lado mais barato de mudar.
 *
 *   empresa 02  ->  EMPORI '02'   (tabela SB1020)
 *   empresa 09  ->  EMPORI '09'   (tabela SB1090)
 *
 * EMPORI recebe SEMPRE o codigo da empresa de origem, sem excecao: o portal
 * quer poder dizer de onde cada produto veio, e um valor vazio para uma das
 * empresas tornaria "vazio" ambiguo entre "empresa X" e "origem desconhecida".
 *
 * O endpoint nao informa de qual tabela leu — ele resolve pelo `tenantId` que
 * recebe. Portanto quem sabe a origem e o portal, que escolheu a empresa da
 * chamada. Por isso EMPORI e sourceTable saem do laco, nao da resposta.
 *
 * SOBRE O TENANT: empresa e filial nunca saem de um parametro "padrao". Ou vem
 * de quem pediu a carga, ou de `tp_companies` — que e o proprio cadastro do
 * ERP. Empresa cuja filial nao se resolve FALHA, com mensagem dizendo o que
 * fazer; nao passa com uma filial chutada, que leria a tabela errada calada.
 */
@Injectable()
export class ProductsSyncService {
  private readonly logger = new Logger(ProductsSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
    private readonly zws: ZwsProdutosClient,
  ) {}

  /**
   * Le as empresas indicadas e grava no espelho `tp_products`.
   *
   * @param opcoes.tenants empresa e filial explicitas. Quando vem preenchido,
   *   manda: e o caminho para carregar uma empresa/filial especifica sem
   *   depender do que esta cadastrado no portal.
   * @param opcoes.desdeData 'YYYY-MM-DD' repassada ao endpoint. Ver a ressalva
   *   sobre B1_USERLGA no ZwsProdutosClient.
   *
   * Falha de UMA empresa nao aborta as outras: o resultado traz o erro por
   * empresa. Carga parcial e melhor que carga nenhuma, e o relatorio diz
   * exatamente o que ficou de fora.
   */
  async sincronizar(
    opcoes: {
      desdeData?: string
      tenants?: ProtheusTenant[]
      /** Sobrepoe PRODUTOS_PAGINA_TAMANHO apenas nesta execucao. */
      tamanhoPagina?: number
      /** Sobrepoe PRODUTOS_PAGINAS_MAXIMO apenas nesta execucao. */
      maximoPaginas?: number
    } = {},
  ): Promise<ProductSyncResult> {
    const inicio = Date.now()

    const alvos: Alvo[] =
      opcoes.tenants && opcoes.tenants.length > 0
        ? opcoes.tenants.map((t) => ({ empresa: t.empresa.trim(), filial: t.filial.trim() }))
        : await this.alvosDoCadastro()

    // Limite de UMA execucao (carga de teste, diagnostico) vem por argumento.
    // Mexer no parametro para isso limitaria toda carga futura em silencio.
    const tamanho = this.limitar(
      opcoes.tamanhoPagina ?? (await this.parameters.getNumber('PRODUTOS_PAGINA_TAMANHO', 200)),
      1,
      1000,
    )
    const maximoPaginas = Math.max(
      0,
      opcoes.maximoPaginas ?? (await this.parameters.getNumber('PRODUTOS_PAGINAS_MAXIMO', 2000)),
    )

    const resultados: ProductSyncCompanyResult[] = []

    for (const alvo of alvos) {
      const parcial: ProductSyncCompanyResult = {
        empresa: alvo.empresa,
        filial: alvo.filial ?? '',
        // EMPORI e a empresa de origem, direto. Sem traducao, sem excecao.
        empori: alvo.empresa,
        sourceTable: this.tabelaFisica(alvo.empresa),
        paginas: 0,
        lidos: 0,
        gravados: 0,
      }

      if (!alvo.filial) {
        parcial.erro =
          `Nao sei em qual filial ler a empresa ${alvo.empresa}: ela nao esta em tp_companies. ` +
          'Rode a carga de empresas primeiro, ou informe empresa e filial na chamada.'
        this.logger.warn(parcial.erro)
        resultados.push(parcial)
        continue
      }

      try {
        await this.carregarEmpresa(parcial, {
          tamanho,
          maximoPaginas,
          desdeData: opcoes.desdeData,
        })
      } catch (erro) {
        parcial.erro = erro instanceof Error ? erro.message : String(erro)
        this.logger.error(`Carga de produtos da empresa ${alvo.empresa} falhou: ${parcial.erro}`)
      }

      resultados.push(parcial)
    }

    const resultado: ProductSyncResult = {
      empresas: resultados,
      lidos: resultados.reduce((soma, r) => soma + r.lidos, 0),
      gravados: resultados.reduce((soma, r) => soma + r.gravados, 0),
      duracaoMs: Date.now() - inicio,
    }

    this.logger.log(
      `Carga de produtos: ${resultado.gravados} gravado(s) de ${resultado.lidos} lido(s) em ${resultado.duracaoMs}ms.`,
    )
    return resultado
  }

  /** Pagina uma empresa ate o fim, acumulando o progresso em `parcial`. */
  private async carregarEmpresa(
    parcial: ProductSyncCompanyResult,
    opcoes: { tamanho: number; maximoPaginas: number; desdeData?: string },
  ): Promise<void> {
    const sincronizadoEm = new Date()
    let pagina = 1

    for (;;) {
      const resposta = await this.zws.buscarPagina({
        empresa: parcial.empresa,
        filial: parcial.filial,
        pagina,
        tamanho: opcoes.tamanho,
        desdeData: opcoes.desdeData,
      })

      if (resposta.itens.length === 0) break

      // Pedir pagina inexistente NAO devolve vazio: o fonte do zWsProdutos faz
      // `If nPagina > nPags -> nPagina := 1`. Sem esta guarda, a carga releria
      // a primeira pagina para sempre.
      if (pagina > 1 && resposta.paginaDevolvida !== pagina) {
        this.logger.warn(
          `Empresa ${parcial.empresa}: pedimos a pagina ${pagina} e o Protheus devolveu a ${resposta.paginaDevolvida}. Encerrando a carga aqui.`,
        )
        break
      }

      parcial.paginas++
      parcial.lidos += resposta.itens.length
      parcial.gravados += await this.espelhar(parcial.empresa, resposta.itens, sincronizadoEm)

      if (resposta.totalPaginas > 0 && pagina >= resposta.totalPaginas) break

      pagina++

      if (opcoes.maximoPaginas > 0 && pagina > opcoes.maximoPaginas) {
        this.logger.warn(
          `Empresa ${parcial.empresa}: parei em ${opcoes.maximoPaginas} paginas por causa de PRODUTOS_PAGINAS_MAXIMO. Pode haver produto nao carregado.`,
        )
        break
      }
    }
  }

  /**
   * Grava produtos no espelho `tp_products`.
   *
   * Publico porque a inclusao pela tela tambem precisa espelhar o produto
   * recem-criado — e a regra de EMPORI e de tabela fisica tem que existir em um
   * lugar so, nao duplicada entre carga e inclusao.
   *
   * `upsert` por (EMPORI, codigo), que e a chave do cadastro unificado.
   *
   * `salePrice` fica de fora: o endpoint nao devolve B1_PRV1, e sobrescrever
   * com nulo apagaria dado que outra fonte venha a preencher. Todo o resto que
   * o zWsProdutos entrega e atualizado — inclusive para nulo, porque ai o nulo
   * E a informacao vinda do ERP.
   */
  async espelhar(
    empresa: string,
    itens: ZwsProduto[],
    sincronizadoEm: Date = new Date(),
  ): Promise<number> {
    const empori = empresa
    const sourceTable = this.tabelaFisica(empresa)
    let gravados = 0

    for (const item of itens) {
      const campos = {
        sourceTable,
        description: item.descricao,
        type: item.tipo || null,
        unit: item.unidade || null,
        group: item.grupo || null,
        defaultWarehouse: item.armazemPadrao || null,
        ncm: item.ncm || null,
        fiscalModel: item.modeloFiscal || null,
        isBlocked: item.bloqueado,
        isActive: item.ativo,
        costCenter: item.centroCusto || null,
        expenseAccount: item.contaDespesa || null,
        assetAccount: item.contaAtivo || null,
        revenueAccount: item.contaReceita || null,
        syncedAt: sincronizadoEm,
      }

      await this.prisma.product.upsert({
        where: { empori_code: { empori, code: item.codigo } },
        update: campos,
        create: { ...campos, empori, code: item.codigo },
      })
      gravados++
    }

    return gravados
  }

  /**
   * Nome fisico da tabela de produtos da empresa.
   *
   * O padrao do Protheus e <alias><empresa><0>: empresa '02' le SB1020,
   * empresa '09' le SB1090. Atencao a essa ultima — o codigo e 09, nao 90.
   */
  private tabelaFisica(empresa: string): string {
    return `SB1${empresa}0`
  }

  /**
   * Empresas de `PRODUTOS_EMPRESAS`, com a filial vinda de `tp_companies`.
   *
   * A filial sai do espelho do proprio ERP — nao de parametro nem de constante
   * no codigo. Quando a empresa nao esta la, a filial volta nula e a carga
   * daquela empresa falha com mensagem explicando o que fazer.
   */
  private async alvosDoCadastro(): Promise<Alvo[]> {
    const bruto = await this.parameters.getString('PRODUTOS_EMPRESAS', '02,09')
    const empresas = [
      ...new Set(
        bruto
          .split(',')
          .map((e) => e.trim())
          .filter((e) => e !== ''),
      ),
    ]

    if (empresas.length === 0) {
      this.logger.warn('PRODUTOS_EMPRESAS esta vazio: nenhuma empresa a carregar.')
      return []
    }

    const cadastradas = await this.prisma.company.findMany({
      where: { code: { in: empresas } },
      orderBy: [{ code: 'asc' }, { branch: 'asc' }],
      select: { code: true, branch: true },
    })

    // Primeira filial de cada empresa: a chamada precisa de UMA filial valida
    // para abrir o ambiente, e SB1 e compartilhada entre filiais.
    const primeiraFilial = new Map<string, string>()
    for (const registro of cadastradas) {
      if (!primeiraFilial.has(registro.code)) primeiraFilial.set(registro.code, registro.branch)
    }

    return empresas.map((empresa) => ({
      empresa,
      filial: primeiraFilial.get(empresa) ?? null,
    }))
  }

  private limitar(valor: number, minimo: number, maximo: number): number {
    return Math.max(minimo, Math.min(maximo, Math.trunc(valor)))
  }
}
