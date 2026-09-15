"""Contratos dos parâmetros do sistema."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ParametroPublico(BaseModel):
    """Um parâmetro como a tela o vê.

    NÃO TEM O VALOR DO SEGREDO. Para tipo SECRET e CREDENTIAL, ``value`` volta
    nulo e ``temValor`` diz se algo está guardado. Mascarar seria pior que
    omitir: sugere que existe um jeito de ler pela API.
    """

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    key: str
    label: str
    description: str | None
    group: str
    type: str
    value: str | None
    default_value: str | None = Field(alias="defaultValue")
    is_secret: bool = Field(alias="isSecret")
    tem_valor: bool = Field(alias="temValor")
    #: Usuário da credencial, quando houver. A senha nunca sai.
    usuario: str | None = None
    updated_by: str | None = Field(alias="updatedBy")
    updated_at: datetime = Field(alias="updatedAt")


class AtualizarParametroInput(BaseModel):
    value: str


class AtualizarCredencialInput(BaseModel):
    usuario: str = Field(min_length=1, max_length=320)
    senha: str = Field(min_length=1)
