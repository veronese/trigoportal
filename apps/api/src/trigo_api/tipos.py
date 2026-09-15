"""Tipos de coluna que fazem a ponte com o que já está gravado.

O banco do portal foi criado pelo Prisma, e o Prisma NÃO guarda data no SQLite
como texto ISO: guarda inteiro de milissegundos desde a época, em UTC. O
SQLAlchemy, por padrão, escreve e lê texto ISO — e falha com
``fromisoformat: argument must be str`` na primeira linha escrita pelo backend
anterior.

Este tipo traduz NOS DOIS SENTIDOS, e isso importa: enquanto os dois backends
coexistirem na migração, o que o Python gravar precisa continuar legível para o
Node. Gravar ISO aqui quebraria o outro lado em silêncio.

Em SQL Server não há tradução: lá ``datetime2`` é nativo nos dois.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Dialect
from sqlalchemy.types import TypeDecorator


class DataHoraPortal(TypeDecorator[datetime]):
    """``DateTime`` compatível com o formato que o Prisma gravou."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> Any:
        if dialect.name == "sqlite":
            return dialect.type_descriptor(BigInteger())
        return dialect.type_descriptor(DateTime())

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> Any:
        if value is None:
            return None
        if dialect.name != "sqlite":
            return value

        # Data ingênua é tratada como UTC: é o que o portal usa em todo lugar, e
        # adivinhar fuso local aqui deslocaria o valor em algumas horas sem aviso.
        momento = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
        return int(momento.timestamp() * 1000)

    def process_result_value(self, value: Any, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
        if isinstance(value, int | float):
            return datetime.fromtimestamp(value / 1000, UTC)
        # Linha gravada como texto ISO por alguma outra ferramenta: aceitar é
        # mais útil que recusar, e o valor é inequívoco.
        if isinstance(value, str):
            momento = datetime.fromisoformat(value)
            return momento if momento.tzinfo is not None else momento.replace(tzinfo=UTC)
        raise TypeError(f"Data em formato inesperado no banco: {type(value)!r}")
