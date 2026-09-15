"""Contratos da conexão REST com o Protheus."""

from pydantic import BaseModel, ConfigDict, Field


class ProtheusStatus(BaseModel):
    """O que está configurado. A senha nunca aparece, só se ela existe."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    #: Falso quando falta URL, usuário ou senha.
    configurado: bool
    base_url: str = Field(alias="baseUrl")
    usuario: str
    timeout_segundos: int = Field(alias="timeoutSegundos")
    senha_configurada: bool = Field(alias="senhaConfigurada")


class ProtheusTestResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    ok: bool
    #: Mensagem pronta para exibir, com o motivo da falha quando houver.
    detalhe: str
    #: Validade do token obtido, quando o teste passou.
    token_valido_por_segundos: int | None = Field(alias="tokenValidoPorSegundos")
    duracao_ms: int = Field(alias="duracaoMs")
