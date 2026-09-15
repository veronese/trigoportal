"""Contratos do cadastro de usuários.

Os nomes e as regras são os que o ``apps/web`` já usa: ``name`` com no mínimo 3
caracteres, senha com as mesmas exigências, ``role`` entre os papéis conhecidos.
Afrouxar aqui deixaria passar dado que a tela recusa, e apertar recusaria dado
que ela envia.
"""

import re
from datetime import datetime
from typing import Annotated, Any

from fastapi import Body
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from trigo_api.errors import ApiError
from trigo_api.permissoes import PAPEIS

#: Exigências da senha, iguais às do backend anterior.
_MINIMO = 10


def validar_senha(valor: str) -> str:
    """Senha forte, com a mensagem dizendo o que falta.

    "Senha inválida" manda a pessoa adivinhar. Cada regra quebrada vira uma
    frase, e todas aparecem de uma vez — não uma por tentativa.
    """
    faltas: list[str] = []
    if len(valor) < _MINIMO:
        faltas.append(f"ter ao menos {_MINIMO} caracteres")
    if not re.search(r"[a-z]", valor):
        faltas.append("ter uma letra minuscula")
    if not re.search(r"[A-Z]", valor):
        faltas.append("ter uma letra maiuscula")
    if not re.search(r"\d", valor):
        faltas.append("ter um numero")

    if faltas:
        raise ValueError("A senha precisa " + ", ".join(faltas) + ".")
    return valor


class PublicUser(BaseModel):
    """Usuário como a tela o vê. NUNCA traz o hash da senha."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    name: str
    email: str
    role: str
    is_active: bool = Field(alias="isActive")
    provider: str
    #: Sessão dele só serve para trocar a senha até que ele troque.
    must_change_password: bool = Field(alias="mustChangePassword")
    #: Tentativas erradas desde o último acesso bem-sucedido.
    failed_login_attempts: int = Field(alias="failedLoginAttempts")
    #: Enquanto estiver no futuro, o login é recusado mesmo com a senha certa.
    locked_until: datetime | None = Field(alias="lockedUntil")
    #: Prazo da senha provisória, já calculado pelo servidor (que conhece o
    #: parâmetro). Nulo quando não há provisória pendente.
    provisional_password_expires_at: datetime | None = Field(
        alias="provisionalPasswordExpiresAt"
    )
    last_login_at: datetime | None = Field(alias="lastLoginAt")
    password_changed_at: datetime | None = Field(alias="passwordChangedAt")
    created_at: datetime = Field(alias="createdAt")


class UserListResponse(BaseModel):
    data: list[PublicUser]
    total: int


class CriarUsuarioInput(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    email: EmailStr
    password: str
    role: str = "USER"

    @field_validator("password")
    @classmethod
    def _senha(cls, valor: str) -> str:
        return validar_senha(valor)

    @field_validator("role")
    @classmethod
    def _papel(cls, valor: str) -> str:
        if valor not in PAPEIS:
            raise ValueError(f"Papel invalido. Use um de: {', '.join(PAPEIS)}.")
        return valor


class RedefinirSenhaInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    new_password: str = Field(alias="newPassword")

    @field_validator("new_password")
    @classmethod
    def _senha(cls, valor: str) -> str:
        return validar_senha(valor)


class AtualizarUsuarioInput(BaseModel):
    """Alteração parcial: só o que vier é alterado."""

    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(default=None, min_length=3, max_length=120)
    role: str | None = None
    is_active: bool | None = Field(default=None, alias="isActive")

    @field_validator("role")
    @classmethod
    def _papel(cls, valor: str | None) -> str | None:
        if valor is not None and valor not in PAPEIS:
            raise ValueError(f"Papel invalido. Use um de: {', '.join(PAPEIS)}.")
        return valor


def atualizar_usuario_input(
    corpo: Annotated[AtualizarUsuarioInput, Body()],
) -> dict[str, Any]:
    """Só os campos ENVIADOS.

    ``exclude_unset`` importa: sem ele, um PATCH que manda só o nome chegaria
    ao serviço com ``role=None`` e ``isActive=None``, indistinguíveis de "não
    mandou" — e a alteração parcial viraria substituição.
    """
    enviados = corpo.model_dump(exclude_unset=True, by_alias=True)
    if not enviados:
        raise ApiError(400, "Nada para alterar: informe ao menos um campo.")
    return enviados
