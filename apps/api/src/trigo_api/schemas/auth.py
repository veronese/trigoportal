"""Contratos de autenticação.

Estes modelos geram o OpenAPI, e o OpenAPI gera o cliente TypeScript. É por
isso que os nomes de campo saem em camelCase: quem consome é o ``apps/web``, e
inventar um segundo nome para o mesmo campo criaria tradução manual justamente
onde a geração automática deveria eliminar trabalho.
"""

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class LoginInput(BaseModel):
    """Credenciais do login.

    O e-mail NÃO passa por validação de formato aqui, e isso é deliberado. No
    login ele é apenas a chave de busca: recusar antes de consultar não protege
    nada — a senha ainda precisaria conferir — e o validador do Pydantic é mais
    rígido que o do backend anterior. Ele recusa domínio de uso interno
    (``.local``, por exemplo), que o ``zod.email()`` aceitava. Manter o rigor
    aqui trancaria para fora qualquer conta em domínio interno já cadastrada.

    Formato de e-mail se valida no CADASTRO do usuário, onde recusar é barato e
    a pessoa pode corrigir. Ver ``CriarUsuarioInput``.
    """

    email: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, description="Senha em texto, sobre TLS")

    @field_validator("email")
    @classmethod
    def _normalizar(cls, valor: str) -> str:
        return valor.strip().lower()


class ChangePasswordInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    current_password: str = Field(alias="currentPassword", min_length=1)
    new_password: str = Field(alias="newPassword")

    @field_validator("new_password")
    @classmethod
    def _forca(cls, valor: str) -> str:
        # As MESMAS exigências do cadastro. Uma senha escolhida pelo próprio
        # usuário não pode ser mais fraca que a que o administrador define.
        from trigo_api.schemas.usuarios import validar_senha

        return validar_senha(valor)


class SessionUser(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    name: str
    email: str
    role: str
    #: Quando verdadeiro, a API recusa qualquer rota que não seja a troca de
    #: senha. O front usa isso para levar direto à tela de troca.
    must_change_password: bool = Field(alias="mustChangePassword")


class SessionResponse(BaseModel):
    user: SessionUser


class CriarUsuarioInput(BaseModel):
    """Cadastro de usuário — AQUI o formato do e-mail importa.

    Recusar um endereço malformado no cadastro é barato e a pessoa corrige na
    hora. Recusar no login seria trancar quem já está cadastrado.
    """

    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    role: str = Field(default="USER")
