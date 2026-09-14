import { Injectable, Logger } from '@nestjs/common'
import type { ProductSyncCompanyResult, ProductSyncResult } from '@trigo/core'
import { ParametersService } from '../parameters/parameters.service'
import { ProtheusDbService } from '../protheus-db/protheus-db.service'
import { ProductsSyncService } from './products-sync.service'
import { ativoDe, bloqueadoDe, textoDe, type ZwsProduto } from './zws-produtos.client'

/**
 * Carga de produtos pelo BANCO do Protheus, em vez do REST.
 *
 * POR QUE EXISTE, tendo ja uma carga: o REST recusa empresa sem ambiente
 * preparado no appserver. A empresa 09 bateu nessa parede em todas as
 * tentativas — e a tabela SB1090 estava la o tempo todo, com 41.861 registros.
 * Por banco nao ha ambiente: e uma tabela como outra qualquer.
 *
 * O QUE ELA NAO REFAZ: a regra do EMPORI e a gravacao no espelho. As duas
 * moram no ProductsSyncService.espelhar(), e sao chamadas daqui. Duplicar a
 * regra faria as duas cargas divergirem no dia em que uma fosse corrigida.
 */
@Injectable()
export class ProductsDbSyncService {
  private readonly logger = new Logger(ProductsDbSyncService.name)

  constructor(
    private readonly db: ProtheusDbService,
    private readonly sync: ProductsSyncService,
    private readonly parameters: ParametersService,
  ) {}

  /**
   * Le as empresas indicadas direto do banco e grava no espelho.
   *
   * Falha de UMA empresa nao aborta as outras: o relatorio traz o erro por
   * empresa. Carga parcial e melhor que carga nenhuma, desde que fique claro
   * o que ficou de fora.
   */
  async sincronizar(
    opcoes: { empresas?: string[]; tamanhoPagina?: number } = {},
  ): Promise<ProductSyncResult> {
    const inicio = Date.now()

    const empresas =
      opcoes.empresas && opcoes.empresas.length > 0
        ? opcoes.empresas.map((e) => e.trim()).filter(Boolean)
        : await this.empresasDoParametro()

    const tamanho = Math.max(
      1,
      Math.min(
        5000,
        opcoes.tamanhoPagina ?? (await this.parameters.getNumber('PRODUTOS_PAGINA_TAMANHO', 200)),
      ),
    )

    const resultados: ProductSyncCompanyResult[] = []

    for (const empresa of empresas) {
      const parcial: ProductSyncCompanyResult = {
        empresa,
        // A filial nao participa: a leitura e da tabela fisica, e a SB1 e
        // compartilhada. Fica vazia para nao sugerir um tenant que nao existe.
        filial: '',
        // EMPORI e a empresa de origem, direto. Sem traducao, sem excecao.
        empori: empresa,
        sourceTable: `SB1${empresa}0`,
        paginas: 0,
        lidos: 0,
        gravados: 0,
      }

      try {
        await this.carregarEmpresa(parcial, tamanho)
      } catch (erro) {
        parcial.erro = erro instanceof Error ? erro.message : String(erro)
        this.logger.error(`Carga por banco da empresa ${empresa} falhou: ${parcial.erro}`)
      }

      resultados.push(parcial)
    }

    const resultado: ProductSyncResult = {
      empresas: resultados,
      lidos: resultados.reduce((s, r) => s + r.lidos, 0),
      gravados: resultados.reduce((s, r) => s + r.gravados, 0),
      duracaoMs: Date.now() - inicio,
    }

    this.logger.log(
      `Carga de produtos por banco: ${resultado.gravados} gravado(s) de ${resultado.lidos} lido(s) em ${resultado.duracaoMs}ms.`,
    )
    return resultado
  }

  /**
   * Percorre a empresa inteira em UMA conexao, gravando pagina a pagina.
   *
   * A gravacao acontece DENTRO da travessia: esperar o fim para gravar tudo
   * significaria perder 41 mil produtos ja lidos se a ultima pagina falhasse.
   */
  private async carregarEmpresa(
    parcial: ProductSyncCompanyResult,
    tamanho: number,
  ): Promise<void> {
    const sincronizadoEm = new Date()

    const resumo = await this.db.percorrerProdutos(parcial.empresa, tamanho, async (linhas) => {
      const itens = linhas
        .map((linha) => this.converter(linha))
        .filter((item): item is ZwsProduto => item !== null)

      if (itens.length !== linhas.length) {
        this.logger.warn(
          `${linhas.length - itens.length} produto(s) da empresa ${parcial.empresa} vieram sem codigo e foram ignorados.`,
        )
      }

      parcial.gravados += await this.sync.espelhar(parcial.empresa, itens, sincronizadoEm)
    })

    parcial.lidos = resumo.lidos
    parcial.paginas = resumo.paginas
  }

  /**
   * Linha do banco para o formato do espelho.
   *
   * As MESMAS conversoes do caminho REST, importadas e nao reescritas: '1'
   * bloqueia, e B1_ATIVO vazio conta como ativo. Se essas regras mudarem,
   * mudam para as duas cargas de uma vez.
   */
  private converter(linha: Record<string, unknown>): ZwsProduto | null {
    const codigo = textoDe(linha.B1_COD)
    // Produto sem codigo nao tem chave: nao ha o que gravar nem atualizar.
    if (codigo === '') return null

    return {
      codigo,
      descricao: textoDe(linha.B1_DESC),
      tipo: textoDe(linha.B1_TIPO),
      unidade: textoDe(linha.B1_UM),
      armazemPadrao: textoDe(linha.B1_LOCPAD),
      grupo: textoDe(linha.B1_GRUPO),
      bloqueado: bloqueadoDe(linha.B1_MSBLQL),
      ativo: ativoDe(linha.B1_ATIVO),
      ncm: textoDe(linha.B1_POSIPI),
      centroCusto: textoDe(linha.B1_XCTACUS),
      contaDespesa: textoDe(linha.B1_XCTADES),
      contaAtivo: textoDe(linha.B1_XCONTA),
      contaReceita: textoDe(linha.B1_CONTA),
      modeloFiscal: textoDe(linha.B1_MODELO),
    }
  }

  private async empresasDoParametro(): Promise<string[]> {
    const bruto = await this.parameters.getString('PRODUTOS_EMPRESAS', '02,09')
    return [...new Set(bruto.split(',').map((e) => e.trim()).filter(Boolean))]
  }
}
