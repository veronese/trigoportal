import { Injectable, Logger } from '@nestjs/common'

/** Quantas consultas ao registry em paralelo. */
const CONCORRENCIA = 6
const TIMEOUT_MS = 10_000
const REGISTRY = 'https://registry.npmjs.org'

/**
 * Consulta a ultima versao publicada de cada pacote no registry do npm.
 *
 * ISOLADO NUM SERVICO PROPRIO porque e a unica parte do diagnostico que sai
 * para a internet. Todo o resto e observacao local. Essa separacao permite
 * mostrar o diagnostico completo mesmo quando o servidor nao tem saida para a
 * internet — o que e o caso normal de servidor de aplicacao corporativo.
 *
 * Falha de rede NUNCA derruba o diagnostico: o pacote fica sem "versao mais
 * recente" e a tela mostra isso como desconhecido, nao como erro.
 */
@Injectable()
export class NpmRegistryService {
  private readonly logger = new Logger(NpmRegistryService.name)

  /**
   * @returns mapa nome -> ultima versao. Pacote que falhou nao aparece.
   */
  async ultimasVersoes(nomes: string[]): Promise<{
    versoes: Map<string, string>
    falhas: number
  }> {
    const versoes = new Map<string, string>()
    let falhas = 0

    // Fatias sequenciais em vez de tudo de uma vez: 20 conexoes simultaneas
    // para o mesmo host e o tipo de coisa que proxy corporativo corta.
    for (let i = 0; i < nomes.length; i += CONCORRENCIA) {
      const fatia = nomes.slice(i, i + CONCORRENCIA)
      const resultados = await Promise.all(fatia.map((nome) => this.uma(nome)))

      for (const r of resultados) {
        if (r.versao) versoes.set(r.nome, r.versao)
        else falhas++
      }
    }

    return { versoes, falhas }
  }

  private async uma(nome: string): Promise<{ nome: string; versao: string | null }> {
    // Escopo tem barra, que precisa ir percent-encoded no caminho do registry:
    // @nestjs/core -> @nestjs%2Fcore
    const caminho = nome.startsWith('@') ? nome.replace('/', '%2F') : nome

    try {
      const resposta = await fetch(`${REGISTRY}/${caminho}/latest`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!resposta.ok) return { nome, versao: null }

      const corpo = (await resposta.json()) as { version?: unknown }
      return { nome, versao: typeof corpo.version === 'string' ? corpo.version : null }
    } catch (erro) {
      this.logger.warn(
        `Nao consegui a versao de ${nome} no registry: ${erro instanceof Error ? erro.message : String(erro)}`,
      )
      return { nome, versao: null }
    }
  }
}
