import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common'
import type { PlanoAtualizacao, SystemDiagnostics } from '@trigo/core'
import { RequirePermission } from '../auth/decorators/require-permission.decorator'
import { DiagnosticsService } from './diagnostics.service'
import { UpdatePlannerService } from './update-planner.service'

@Controller('diagnostics')
export class DiagnosticsController {
  constructor(
    private readonly diagnostics: DiagnosticsService,
    private readonly planner: UpdatePlannerService,
  ) {}

  /**
   * Diagnostico do sistema.
   *
   * `atualizacoes=true` consulta o registry do npm. Fica sob demanda e nao no
   * carregamento da tela por dois motivos: e a unica parte que sai para a
   * internet, e sao ~20 requisicoes externas — abrir a tela nao deve custar
   * isso.
   */
  @Get()
  @RequirePermission('settings:read')
  diagnosticar(@Query('atualizacoes') atualizacoes?: string): Promise<SystemDiagnostics> {
    return this.diagnostics.diagnosticar(atualizacoes === 'true')
  }

  /**
   * Monta o plano de atualizacao dos pacotes escolhidos.
   *
   * NAO EXECUTA NADA: devolve script, verificacoes e rollback para uma pessoa
   * revisar e rodar no servidor. O motivo esta em `porQueNaoExecutamos` da
   * resposta, e aparece na tela — nao e uma limitacao escondida.
   *
   * POST e nao GET porque a lista de pacotes vai no corpo e porque isto e uma
   * acao deliberada do administrador, nao uma leitura de tela.
   */
  @Post('update-plan')
  @HttpCode(200)
  @RequirePermission('settings:write')
  async planejar(@Body() corpo: { pacotes?: unknown }): Promise<PlanoAtualizacao> {
    const pacotes = Array.isArray(corpo?.pacotes)
      ? corpo.pacotes.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
      : []

    if (pacotes.length === 0) {
      throw new BadRequestException('Escolha ao menos um pacote para montar o plano.')
    }

    return this.planner.planejar(
      pacotes,
      this.diagnostics.dependenciasInstaladas(),
      this.diagnostics.raizDoProjeto(),
    )
  }
}
