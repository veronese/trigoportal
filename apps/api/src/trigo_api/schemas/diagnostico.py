"""Contratos do diagnóstico e do status do banco do portal."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ItemDiagnostico(BaseModel):
    nome: str
    valor: str
    #: O que o item significa para quem opera, não para quem programa.
    observacao: str | None = None


class CaminhoDiagnostico(BaseModel):
    nome: str
    caminho: str
    existe: bool
    #: Bytes, quando é arquivo. Nulo para diretório ou ausente.
    tamanho: int | None = None
    observacao: str | None = None


class PacoteDiagnostico(BaseModel):
    nome: str
    versao: str


class DiagnosticoResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    gerado_em: datetime = Field(alias="geradoEm")
    runtime: list[ItemDiagnostico]
    caminhos: list[CaminhoDiagnostico]
    pacotes: list[PacoteDiagnostico]
    banco: list[ItemDiagnostico]
    #: O que está errado ou merece atenção, em linguagem de quem opera.
    alertas: list[str]


class DatabaseStatus(BaseModel):
    """Diagnóstico da conexão do PORTAL, em leitura.

    A conexão é definida no ambiente, não pela tela. A senha nunca aparece
    aqui, nem mascarada.
    """

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    provider: str
    servidor: str
    porta: int | None
    banco: str
    usuario: str
    criptografado: bool
    conectado: bool
    latencia_ms: int | None = Field(alias="latenciaMs")
    versao_servidor: str | None = Field(alias="versaoServidor")
    #: Primeira linha do erro quando a conexão falha.
    detalhe_erro: str | None = Field(alias="detalheErro")
