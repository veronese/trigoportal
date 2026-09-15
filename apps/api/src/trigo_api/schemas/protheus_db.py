"""Contratos do conector com o banco do Protheus.

Os nomes saem em camelCase porque quem consome é o ``apps/web``, e estes
modelos são a fonte do OpenAPI que gera os tipos do front.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProtheusDbConfig(BaseModel):
    """O que está configurado. A senha nunca aparece aqui, nem mascarada."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    host: str
    porta: int
    banco: str
    usuario: str
    #: Se há senha guardada. O valor em si nunca sai do servidor.
    senha_configurada: bool = Field(alias="senhaConfigurada")
    criptografia: bool
    certificado_confiavel: bool = Field(alias="certificadoConfiavel")
    timeout_segundos: int = Field(alias="timeoutSegundos")
    configurado: bool
    #: O que falta preencher, em linguagem de quem vai preencher.
    pendencias: list[str]


class TabelaBanco(BaseModel):
    """Uma tabela do banco, para navegar antes de escrever a consulta."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    nome: str
    esquema: str
    #: Estimativa vinda do catálogo, não um COUNT. NULA quando o login não tem
    #: permissão de ler as estatísticas — a lista de tabelas vale por si.
    registros_estimados: int | None = Field(alias="registrosEstimados")


class ColunaBanco(BaseModel):
    """Uma coluna, como o dicionário físico a descreve."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    nome: str
    tipo: str
    tamanho: int | None
    aceita_nulo: bool = Field(alias="aceitaNulo")


class ConsultaSqlInput(BaseModel):
    sql: str = Field(min_length=1, max_length=20_000)
    #: Teto de linhas. Existe para a tela não receber um resultado que o
    #: navegador não aguenta — consulta sem WHERE numa tabela de movimento do
    #: ERP devolve milhões de linhas.
    limite: int = Field(default=500, ge=1, le=10_000)


class ConsultaSqlResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    ok: bool
    #: Colunas na ORDEM do SELECT. Objeto JSON não garante ordem de chave.
    colunas: list[str]
    linhas: list[dict[str, Any]]
    total_linhas: int = Field(alias="totalLinhas")
    #: true quando o limite cortou o resultado — a consulta tinha mais.
    truncado: bool
    duracao_ms: int = Field(alias="duracaoMs")
    #: Mensagem pronta para a tela quando a consulta é recusada ou falha.
    erro: str | None


class ProtheusDbTabela(BaseModel):
    """Uma tabela de produtos e o que foi encontrado nela."""

    empresa: str
    nome: str
    existe: bool
    #: Nulo quando a tabela não existe ou a contagem falhou.
    registros: int | None
    #: Motivo, quando a contagem não foi possível.
    detalhe: str | None


class ProtheusDbTestResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    ok: bool
    #: Frase pronta para a tela.
    detalhe: str
    duracao_ms: int = Field(alias="duracaoMs")
    servidor: str | None
    versao_servidor: str | None = Field(alias="versaoServidor")
    banco: str | None
    login_efetivo: str | None = Field(alias="loginEfetivo")
    #: O login consegue gravar? true é ALERTA, não sucesso: o ETL lê, e
    #: credencial com escrita transforma um erro de consulta em risco para o ERP.
    pode_escrever: bool | None = Field(alias="podeEscrever")
    tabelas: list[ProtheusDbTabela]
    #: Primeira linha do erro, quando falha.
    erro: str | None
