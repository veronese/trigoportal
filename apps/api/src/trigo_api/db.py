"""Acesso ao banco do portal.

AS TABELAS JÁ EXISTEM. Foram criadas pelo Prisma do backend anterior, e este
mapeamento descreve o que está lá — não define nada novo. Por isso cada coluna
traz o nome físico explícito: ``password_hash`` e não ``passwordHash``. Deixar o
SQLAlchemy inferir daria nomes diferentes dos gravados e a consulta falharia.
"""

from collections.abc import Generator
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Index,
    Integer,
    Numeric,
    String,
    create_engine,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from trigo_api.config import obter_settings
from trigo_api.tipos import DataHoraPortal


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "tp_users"
    __table_args__ = (
        Index("tp_users_email_key", "email", unique=True),
        Index("tp_users_is_active_idx", "is_active"),
        Index("tp_users_provider_external_id_idx", "provider", "external_id"),
        # Unique PARCIAL: sem o filtro, o SQL Server trataria vários NULL como
        # iguais e só um usuário local poderia existir. O filtro é o que faz a
        # regra valer apenas para quem TEM identidade externa.
        Index(
            "tp_users_provider_external_id_uq",
            "provider",
            "external_id",
            unique=True,
            sqlite_where=text("external_id IS NOT NULL"),
            mssql_where=text("external_id IS NOT NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    # O unique vive no indice nomeado tp_users_email_key, abaixo. Declarar
    # aqui tambem criaria uma segunda constraint, sem nome, que o Alembic
    # tenta reconciliar a cada geracao.
    email: Mapped[str] = mapped_column(String(320))
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
    __table_args__ = (Index("tp_parameters_group_name_idx", "group_name"),)

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


class Product(Base):
    """Espelho local do cadastro de produtos do Protheus.

    A chave de negócio é (``empori``, ``code``), e não o id: o mesmo código
    existe em empresas diferentes e são produtos diferentes.
    """

    __tablename__ = "tp_products"
    __table_args__ = (
        # Nome igual ao que o Prisma criou: renomear obrigaria a migração a
        # derrubar e recriar o índice de 72 mil linhas sem ganho nenhum.
        Index("tp_products_empori_code_key", "empori", "code", unique=True),
        Index("tp_products_description_idx", "description"),
        Index("tp_products_group_code_idx", "group_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    #: Empresa de ORIGEM do registro. Coluna do PORTAL, não do Protheus.
    empori: Mapped[str] = mapped_column(String(4), default="")
    #: Tabela física de origem (SB1020, SB1090). O fato bruto por trás do EMPORI.
    source_table: Mapped[str] = mapped_column("source_table", String(20))
    code: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(String(200))
    type: Mapped[str | None] = mapped_column(String(10))
    unit: Mapped[str | None] = mapped_column(String(10))
    group_code: Mapped[str | None] = mapped_column("group_code", String(20))
    default_warehouse: Mapped[str | None] = mapped_column("default_warehouse", String(10))
    ncm: Mapped[str | None] = mapped_column(String(20))
    fiscal_model: Mapped[str | None] = mapped_column("fiscal_model", String(20))
    is_blocked: Mapped[bool] = mapped_column("is_blocked", Boolean, default=False)
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    cost_center: Mapped[str | None] = mapped_column("cost_center", String(30))
    expense_account: Mapped[str | None] = mapped_column("expense_account", String(30))
    asset_account: Mapped[str | None] = mapped_column("asset_account", String(30))
    revenue_account: Mapped[str | None] = mapped_column("revenue_account", String(30))
    sale_price: Mapped[float | None] = mapped_column("sale_price", Numeric(18, 6))
    synced_at: Mapped[datetime] = mapped_column("synced_at", DataHoraPortal)
    created_at: Mapped[datetime] = mapped_column("created_at", DataHoraPortal)
    updated_at: Mapped[datetime] = mapped_column("updated_at", DataHoraPortal)


class Company(Base):
    """Empresas e filiais espelhadas do Protheus (SYS_COMPANY).

    Modelada mesmo sem uso hoje: a tabela EXISTE no banco, e modelo ausente faz
    o Alembic propor apagá-la. A carga por banco não precisa dela — lê a tabela
    física direto — mas a carga por REST precisava da filial para montar o
    tenant, e esse caminho ainda existe no ERP.
    """

    __tablename__ = "tp_companies"
    __table_args__ = (Index("tp_companies_code_branch_key", "code", "branch", unique=True),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str] = mapped_column(String(4))
    branch: Mapped[str] = mapped_column(String(8))
    corporate_name: Mapped[str] = mapped_column("corporate_name", String(120))
    branch_name: Mapped[str | None] = mapped_column("branch_name", String(120))
    tax_id: Mapped[str | None] = mapped_column("tax_id", String(20))
    state: Mapped[str | None] = mapped_column(String(4))
    city: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    synced_at: Mapped[datetime] = mapped_column("synced_at", DataHoraPortal)
    created_at: Mapped[datetime] = mapped_column("created_at", DataHoraPortal)
    updated_at: Mapped[datetime] = mapped_column("updated_at", DataHoraPortal)
