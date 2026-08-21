import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ERROR_CODES } from '@trigo/core'
import { ParametersService } from '../parameters/parameters.service'
import { ProtheusClient } from '../protheus/protheus.client'

/** Um produto como o zWsProdutos devolve: campos CHAR, sem trim. */
interface ZwsProdutoBruto {
  cod?: unknown
  desc?: unknown
  tipo?: unknown
  um?: unknown
  locpad?: unknown
  grupo?: unknown
  bloqueado?: unknown
  ativo?: unknown
  ncm?: unknown
  ccusto?: unknown
  cdespesa?: unknown
  cativo?: unknown
  creceita?: unknown
  modelo?: unknown
}

/** Envelope do get_all. `total_items` e o TAMANHO da pagina, nao a contagem. */
interface ZwsRespostaBruta {
  meta?: {
    total?: unknown
    current_page?: unknown
    total_page?: unknown
    total_items?: unknown
  }
  objects?: unknown
  errorId?: unknown
  error?: unknown
  solution?: unknown
  // Campos de erro da camada REST do Protheus, nao do fonte zWsProdutos.
  errorCode?: unknown
  errorMessage?: unknown
  message?: unknown
  detailedMessage?: unknown
}

export interface ZwsProduto {
  codigo: string
  descricao: string
  tipo: string
  unidade: string
  armazemPadrao: string
  grupo: string
  bloqueado: boolean
  ativo: boolean
  ncm: string
  centroCusto: string
  contaDespesa: string
  contaAtivo: string
  contaReceita: string
  modeloFiscal: string
}

export interface ZwsProdutosPagina {
  itens: ZwsProduto[]
  /** Total de registros na tabela, segundo o proprio endpoint. */
  totalRegistros: number
  /** Pagina que o endpoint DIZ ter devolvido — nem sempre a pedida. */
  paginaDevolvida: number
  totalPaginas: number
}

/** O endpoint sinaliza "consulta sem registro" com este codigo, em HTTP 500. */
const ERRO_SEM_REGISTRO = 'ALL003'

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trimEnd() : '')
const inteiro = (valor: unknown, padrao = 0): number => {
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? Math.trunc(n) : padrao
}

/**
 * B1_MSBLQL: '1' bloqueia. '2' e vazio liberam.
 *
 * Comparo com '1' em vez de "diferente de vazio" porque produto liberado
 * explicitamente vem com '2' — tratar isso como bloqueado esconderia do portal
 * a maior parte do cadastro.
 */
const bloqueadoDe = (valor: unknown): boolean => texto(valor) === '1'

/**
 * B1_ATIVO: dominio S/N.
 *
 * Vazio conta como ATIVO. Em base antiga o campo pode nunca ter sido
 * preenchido, e assumir inativo esconderia produto em uso.
 */
const ativoDe = (valor: unknown): boolean => texto(valor).toUpperCase() !== 'N'

/**
 * Cliente do WSRESTFUL `zWsProdutos`, que ja existia no Protheus do Trigo.
 *
 * O contrato dele nao e o que o portal teria desenhado, e esta classe existe
 * para absorver essas diferencas em um lugar so:
 *
 *  - **500 nao e necessariamente erro.** Consulta sem registro responde 500 com
 *    `errorId: ALL003`. Numa carga paginada isso e o fim da lista. Aqui vira
 *    pagina vazia; o resto do portal nunca ve esse detalhe.
 *  - **Campos vem sem trim.** O fonte le direto do alias, e o Protheus guarda
 *    CHAR de tamanho fixo. Sem `trimEnd` o portal gravaria "PA0001    ".
 *  - **Booleano nao existe no cadastro.** `bloqueado` e `ativo` chegam como
 *    CHAR do Protheus ('1'/'2', 'S'/'N'); a conversao fica aqui, para o resto
 *    do portal so ver boolean.
 *  - **`total_items` engana**: e o tamanho da pagina, nao a contagem. A
 *    contagem real e `meta.total`.
 *  - **Pedir pagina inexistente devolve a pagina 1**, nao vazio (o fonte faz
 *    `If nPagina > nPags -> nPagina := 1`). Por isso a pagina devolvida e
 *    exposta aqui: quem pagina precisa poder detectar o desvio.
 */
@Injectable()
export class ZwsProdutosClient {
  private readonly logger = new Logger(ZwsProdutosClient.name)

  constructor(
    private readonly protheus: ProtheusClient,
    private readonly parameters: ParametersService,
  ) {}

  async rota(): Promise<string> {
    const rota = (await this.parameters.getString('PRODUTOS_ENDPOINT')).trim()
    return rota || '/ZWSPRODUTOS/get_all'
  }





  /** Junta o que houver de mensagem, do endpoint ou da camada REST. */
  private detalhar(payload: ZwsRespostaBruta | null, status: number): string {
    const doEndpoint = [texto(payload?.error), texto(payload?.solution)].filter(Boolean).join(' — ')
    const daCamadaRest = [
      texto(payload?.errorMessage),
      texto(payload?.message),
      texto(payload?.detailedMessage),
    ]
      .filter(Boolean)
      .join(' — ')
    return doEndpoint || daCamadaRest || `HTTP ${status} sem corpo reconhecivel`
  }

  /**
   * Uma pagina de produtos da empresa indicada.
   *
   * @param desdeData opcional, 'YYYY-MM-DD'. O endpoint filtra por B1_USERLGA,
   *   e o proprio autor do fonte anota que esse campo pode divergir desde maio
   *   de 2023 — por isso a carga do portal e completa por padrao.
   */
  async buscarPagina(opcoes: {
    empresa: string
    filial: string
    pagina: number
    tamanho: number
    desdeData?: string
  }): Promise<ZwsProdutosPagina> {
    const rota = await this.rota()

    const { status, ok, payload } = await this.protheus.requestRaw<ZwsRespostaBruta>(rota, {
      tenant: { empresa: opcoes.empresa, filial: opcoes.filial },
      query: {
        page: opcoes.pagina,
        limit: opcoes.tamanho,
        updated_at: opcoes.desdeData,
      },
    })

    const vazia: ZwsProdutosPagina = {
      itens: [],
      totalRegistros: 0,
      paginaDevolvida: opcoes.pagina,
      totalPaginas: 0,
    }

    if (!ok) {
      if (texto(payload?.errorId) === ERRO_SEM_REGISTRO) return vazia

      const detalhe = this.detalhar(payload, status)
      throw new ServiceUnavailableException({
        message: `O endpoint de produtos (${rota}) falhou para a empresa ${opcoes.empresa}: ${detalhe}`,
        code: ERROR_CODES.PROTHEUS_UNAVAILABLE,
      })
    }

    const objetos = Array.isArray(payload?.objects) ? payload.objects : []
    const itens = objetos
      .map((bruto) => this.converter(bruto as ZwsProdutoBruto))
      .filter((item): item is ZwsProduto => item !== null)

    if (itens.length !== objetos.length) {
      this.logger.warn(
        `${objetos.length - itens.length} produto(s) da empresa ${opcoes.empresa} vieram sem codigo e foram ignorados.`,
      )
    }

    return {
      itens,
      totalRegistros: inteiro(payload?.meta?.total),
      paginaDevolvida: inteiro(payload?.meta?.current_page, opcoes.pagina),
      totalPaginas: inteiro(payload?.meta?.total_page),
    }
  }

  /** Produto sem codigo nao tem chave: nao ha o que gravar nem atualizar. */
  private converter(bruto: ZwsProdutoBruto): ZwsProduto | null {
    const codigo = texto(bruto.cod)
    if (codigo === '') return null

    return {
      codigo,
      descricao: texto(bruto.desc),
      tipo: texto(bruto.tipo),
      unidade: texto(bruto.um),
      armazemPadrao: texto(bruto.locpad),
      grupo: texto(bruto.grupo),
      bloqueado: bloqueadoDe(bruto.bloqueado),
      ativo: ativoDe(bruto.ativo),
      ncm: texto(bruto.ncm),
      centroCusto: texto(bruto.ccusto),
      contaDespesa: texto(bruto.cdespesa),
      contaAtivo: texto(bruto.cativo),
      contaReceita: texto(bruto.creceita),
      modeloFiscal: texto(bruto.modelo),
    }
  }
}
