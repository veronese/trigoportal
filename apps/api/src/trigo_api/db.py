"""Acesso ao banco do portal.

AS TABELAS JÁ EXISTEM. Foram criadas pelo Prisma do backend anterior, e este
mapeamento descreve o que está lá — não define nada novo. Por isso cada coluna
traz o nome físico explícito: ``password_hash`` e não ``passwordHash``. Deixar o
SQLAlchemy inferir daria nomes diferentes dos gravados e a consulta falharia.
"""

from collections.abc import Generator
from datetime import datetime

from sqlalchemy import Boolean, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from trigo_api.config import obter_settings
from trigo_api.tipos import DataHoraPortal


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "tp_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str | None] = mapped_column("password_hash", String(500))
    role: Mapped[str] = mapped_column(String(20), default="USER")
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    provider: Mapped[str] = mapped_column(String(30), default="local")
    external_id: Mapped[str | None] = mapped_column("external_id", String(100))
    #: Permite revogar sessões sem manter lista negra: o token carrega a versão
    #: e deixa de valer quando ela muda.
    token_version: Mapped[int] = mapped_column("token_version", Integer, default=0)
    must_change_password: Mapped[bool] = mapped_column(
        "must_change_password", Boolean, default=False
    )
    password_changed_at: Mapped[datetime | None] = mapped_column(
        "password_changed_at", DataHoraPortal
    )
    provisional_password_at: Mapped[datetime | None] = mapped_column(
        "provisional_password_at", DataHoraPortal
    )
    failed_login_attempts: Mapped[int] = mapped_column(
        "failed_login_attempts", Integer, default=0
    )
    locked_until: Mapped[datetime | None] = mapped_column("locked_until", DataHoraPortal)
    last_login_at: Mapped[datetime | None] = mapped_column("last_login_at", DataHoraPortal)
    created_at: Mapped[datetime] = mapped_column("created_at", DataHoraPortal)
    updated_at: Mapped[datetime] = mapped_column("updated_at", DataHoraPortal)


class Parameter(Base):
    __tablename__ = "tp_parameters"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    label: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String)
    group_name: Mapped[str] = mapped_column("group_name", String(50))
    value_type: Mapped[str] = mapped_column("value_type", String(20), default="STRING")
    value: Mapped[str | None] = mapped_column("current_value", String)
    default_value: Mapped[str | None] = mapped_column("default_value", String)
    is_secret: Mapped[bool] = mapped_column("is_secret", Boolean, default=False)
    updated_by: Mapped[str | None] = mapped_column("updated_by", String(320))
    updated_at: Mapped[datetime] = mapped_column("updated_at", DataHoraPortal)
    created_at: Mapped[datetime] = mapped_column("created_at", DataHoraPortal)


_settings = obter_settings()
engine = create_engine(_settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def obter_sessao() -> Generator[Session]:
    """Dependência do FastAPI: uma sessão por requisição, sempre fechada."""
    sessao = SessionLocal()
    try:
        yield sessao
    finally:
        sessao.close()
