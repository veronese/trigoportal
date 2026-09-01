import { z } from 'zod'
import { ORDEM_DAS_FASES, ROTULO_FASE, proximaFase, type FaseFicha } from './types'

/**
 * Validacao das transicoes de uma ficha.
 *
 * O MESMO schema roda na tela e no BFF. A tela usa para desabilitar botao e
 * mostrar o motivo; o BFF usa porque e ele a autoridade — regra que so existe
 * no frontend e regra que a API nao tem, e qualquer cliente contorna.
 */

const texto = (max: number) => z.string().trim().max(max)

export const criarFichaSchema = z.object({
  codigo: texto(30).min(1, 'Informe o codigo do produto'),
  nome: texto(200).min(1, 'Informe o nome do produto'),
  restauranteId: z.string().min(1, 'Escolha a marca ou loja'),
  linhaId: z.string().min(1, 'Escolha a linha'),
  categoria: texto(80).optional(),
  /**
   * A ficha SEMPRE comeca na bancada. Nao ha campo de fase na criacao de
   * proposito: deixar escolher permitiria nascer em producao sem nunca ter
   * passado por teste.
   */
  quantidadeAlvoKg: z.number().positive('A quantidade de bancada tem que ser maior que zero'),
})
export type CriarFichaInput = z.infer<typeof criarFichaSchema>

export const gerarVersaoSchema = z.object({
  nome: texto(120).optional(),
  motivo: texto(500).min(1, 'Explique por que esta versao esta sendo gerada'),
  /** Numeracao do documento, independente do contador interno. */
  revisaoDocumental: texto(20).optional(),
})
export type GerarVersaoInput = z.infer<typeof gerarVersaoSchema>

export const promoverFaseSchema = z.object({
  versaoOrigemId: z.string().min(1, 'Escolha a versao de origem'),
  destino: z.enum(['batida_teste', 'ft_producao']),
  quantidadeAlvoKg: z.number().positive('Informe a quantidade da nova fase'),
  linhaProducaoId: z.string().optional(),
})
export type PromoverFaseInput = z.infer<typeof promoverFaseSchema>

export const decidirAprovacaoSchema = z
  .object({
    decisao: z.enum(['aprovado', 'reprovado']),
    comentario: texto(1000).optional(),
  })
  // Reprovar sem dizer o motivo devolve a ficha para o P&D sem informacao —
  // e o retrabalho comeca por adivinhar o que a Qualidade nao gostou.
  .refine((v) => v.decisao !== 'reprovado' || (v.comentario ?? '').length > 0, {
    message: 'Ao reprovar, explique o que precisa ser ajustado',
    path: ['comentario'],
  })
export type DecidirAprovacaoInput = z.infer<typeof decidirAprovacaoSchema>

export const criarInsumoProvisorioSchema = z.object({
  descricao: texto(200).min(1, 'Informe a descricao do insumo'),
  unidade: texto(10).min(1, 'Informe a unidade'),
  preco: z.number().nonnegative('O preco nao pode ser negativo'),
  fornecedor: texto(200).optional(),
  marca: texto(120).optional(),
  observacao: texto(500).optional(),
})
export type CriarInsumoProvisorioInput = z.infer<typeof criarInsumoProvisorioSchema>

export const vincularInsumoSchema = z.object({
  codigoProtheus: texto(30).min(1, 'Informe o codigo do produto no Protheus'),
})
export type VincularInsumoInput = z.infer<typeof vincularInsumoSchema>

// ---------------------------------------------------------------------------
// Regras de transicao que nao cabem em schema de campo
// ---------------------------------------------------------------------------

export interface ImpedimentoPromocao {
  motivo: string
  /** O que a pessoa precisa fazer. Impedimento sem saida e beco sem saida. */
  comoResolver: string
}

export interface ContextoPromocao {
  faseAtual: FaseFicha
  destino: FaseFicha
  /** A versao de origem esta congelada? Promover rascunho promove nada. */
  origemCongelada: boolean
  /** Quantos insumos ainda estao provisorios na versao de origem. */
  insumosProvisorios: number
  /** A versao de origem passou por todas as aprovacoes exigidas? */
  aprovada: boolean
  /** Linha definida, quando o destino e FT Producao. */
  temLinhaProducao: boolean
  /** Ficha de Processo preenchida, quando o destino e FT Producao. */
  temFichaProcesso: boolean
}

/**
 * Tudo que impede uma promocao, de uma vez.
 *
 * Devolve LISTA e nao o primeiro erro: quem esta promovendo quer saber tudo o
 * que falta, nao descobrir um item por tentativa.
 */
export function impedimentosDaPromocao(ctx: ContextoPromocao): ImpedimentoPromocao[] {
  const lista: ImpedimentoPromocao[] = []

  // A regra central: o caminho e obrigatorio e sequencial. Bancada nao vira
  // producao direto, porque a batida teste e onde o comportamento industrial
  // aparece — pular e descobrir o problema na producao real.
  const esperado = proximaFase(ctx.faseAtual)
  if (esperado !== ctx.destino) {
    lista.push({
      motivo:
        `${ROTULO_FASE[ctx.faseAtual]} so promove para ` +
        `${esperado ? ROTULO_FASE[esperado] : 'nenhuma fase seguinte'}, nao para ${ROTULO_FASE[ctx.destino]}.`,
      comoResolver: esperado
        ? `Promova primeiro para ${ROTULO_FASE[esperado]}.`
        : 'Esta ja e a ultima fase.',
    })
  }

  if (!ctx.origemCongelada) {
    lista.push({
      motivo: 'A versao de origem ainda e um rascunho.',
      comoResolver: 'Use GERAR VERSAO na fase atual antes de promover.',
    })
  }

  if (!ctx.aprovada) {
    lista.push({
      motivo: 'A versao de origem nao concluiu as aprovacoes.',
      comoResolver: 'Envie para aprovacao e aguarde as areas responsaveis.',
    })
  }

  // Provisorio e permitido na bancada de proposito — o escopo e explicito em
  // nao travar o P&D por causa de cadastro no ERP. A partir da batida teste,
  // a estrutura precisa existir no Protheus, e ai a pendencia importa.
  if (ctx.destino !== 'bancada' && ctx.insumosProvisorios > 0) {
    lista.push({
      motivo: `${ctx.insumosProvisorios} insumo(s) ainda sem codigo no Protheus.`,
      comoResolver: 'Vincule os provisorios em Pendencias Protheus antes de promover.',
    })
  }

  if (ctx.destino === 'ft_producao') {
    if (!ctx.temLinhaProducao) {
      lista.push({
        motivo: 'A FT Producao precisa de uma linha definida.',
        comoResolver: 'Escolha a linha; a capacidade dela sugere a quantidade final.',
      })
    }
    if (!ctx.temFichaProcesso) {
      lista.push({
        motivo: 'A Ficha de Processo nao esta preenchida.',
        comoResolver: 'Preencha modo de preparo, sensorial e conservacao antes de promover.',
      })
    }
  }

  return lista
}

/** Ordem canonica, para a tela desenhar a trilha sem reimplementar a regra. */
export const TRILHA_DE_FASES = ORDEM_DAS_FASES
