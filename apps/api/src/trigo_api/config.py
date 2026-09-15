"""Configuração do processo, lida do ambiente.

Mesma regra de escopo do backend anterior: o que o processo precisa para SUBIR
fica aqui (conexão, segredo do JWT, chave de cifragem); o que muda
comportamento em tempo de execução fica na tabela de parâmetros.
"""

import re
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

_DURACAO = re.compile(r"^(\d+)\s*([smhd])$")
_MULTIPLICADOR = {"s": 1, "m": 60, "h": 3600, "d": 86400}
_PADRAO_SEGUNDOS = 8 * 3600


def duracao_em_segundos(valor: str | None) -> int:
    """Converte '8h', '30m', '7d' em segundos.

    Aceita o MESMO formato que o backend anterior lia de ``JWT_EXPIRES_IN``,
    para o ``.env`` existente continuar valendo sem edição.
    """
    if not valor:
        return _PADRAO_SEGUNDOS
    achado = _DURACAO.match(valor.strip())
    if not achado:
        return _PADRAO_SEGUNDOS
    return int(achado.group(1)) * _MULTIPLICADOR[achado.group(2)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    port: int = 3333
    #: Conexão do banco do portal. Aceita o formato do SQLAlchemy.
    database_url: str = "sqlite+pysqlite:///../bff/prisma/dev.db"
    jwt_secret: str = ""
    jwt_expires_in: str = "8h"
    cors_origins: str = "http://localhost:3000"
    parameter_encryption_key: str | None = None
    #: Cookie httpOnly em conexão não segura só faz sentido em desenvolvimento.
    ambiente: str = "development"

    @property
    def sessao_segundos(self) -> int:
        return duracao_em_segundos(self.jwt_expires_in)

    @property
    def origens_cors(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def producao(self) -> bool:
        return self.ambiente.lower() == "production"


@lru_cache
def obter_settings() -> Settings:
    return Settings()
