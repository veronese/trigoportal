"""Ambiente do Alembic.

A conexão vem do ``Settings`` da aplicação, e não do ``alembic.ini``. Manter a
URL em dois lugares é como acabar migrando o banco errado: o ``.ini`` fica
apontando para desenvolvimento enquanto o processo roda em produção.

SOBRE O BANCO JÁ EXISTIR: as tabelas foram criadas pelo Prisma, no backend
anterior. A primeira revisão descreve o estado ATUAL e é marcada como já
aplicada (``alembic stamp``), para o Alembic assumir dali em diante sem tentar
recriar o que já está lá.
"""

from logging.config import fileConfig
from typing import Any

from alembic import context
from sqlalchemy import engine_from_config, pool

from trigo_api.config import obter_settings
from trigo_api.db import Base
from trigo_api.tipos import DataHoraPortal

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", obter_settings().database_url)

target_metadata = Base.metadata


def _incluir(objeto: Any, nome: str | None, tipo: str, reflexo: bool, comparado: Any) -> bool:
    """Só o que ESTE aplicativo declara.

    O banco tem tabelas que não são desta aplicação: o histórico do Prisma e as
    tabelas de fichas técnicas, que ficaram no banco por decisão explícita
    quando o módulo foi revertido. Sem esta regra, o autogenerate propõe
    APAGAR todas elas — e a primeira migração viraria uma bomba.

    Tabela de outro sistema não é problema do Alembic. O que é desta aplicação
    está em ``Base.metadata``, e é só isso que ele gerencia.
    """
    if tipo == "table" and reflexo:
        return nome in target_metadata.tables
    return True


def _comparar_tipo(
    contexto: Any,
    coluna_no_banco: Any,
    coluna_no_modelo: Any,
    tipo_no_banco: Any,
    tipo_no_modelo: Any,
) -> bool | None:
    """O que NÃO conta como mudança de tipo.

    Devolver ``False`` diz "isto já está certo"; ``None`` deixa o Alembic
    comparar normalmente. Os nomes dos parâmetros estão por extenso porque
    errar a ordem aqui não quebra nada — só faz a regra nunca valer, que foi
    exatamente o que aconteceu na primeira versão desta função.

    1. DATA DO PORTAL. O Prisma declarou as colunas como DATETIME e gravou
       inteiro de milissegundos dentro. ``DataHoraPortal`` descreve exatamente
       isso, mas para o Alembic são tipos diferentes — e ele proporia um ALTER
       a cada geração, para sempre.

    2. TAMANHO DE TEXTO NO SQLITE. O SQLite guarda tudo como TEXT e não lembra
       o tamanho declarado, então toda ``String(120)`` do modelo vira um
       "alter" falso. Em SQL Server — o destino de produção — a reflexão traz o
       tamanho de verdade e a comparação volta a valer.
    """
    if isinstance(tipo_no_modelo, DataHoraPortal):
        return False

    if contexto.dialect.name == "sqlite":
        from sqlalchemy import String

        if isinstance(tipo_no_modelo, String) and isinstance(tipo_no_banco, String):
            return False

    return None


def offline() -> None:
    """Gera o SQL sem conectar. Serve para revisão antes de aplicar em produção."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=_incluir,
        compare_type=_comparar_tipo,
    )
    with context.begin_transaction():
        context.run_migrations()


def online() -> None:
    motor = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with motor.connect() as con:
        context.configure(
            connection=con,
            target_metadata=target_metadata,
            include_object=_incluir,
            # Tipo alterado precisa aparecer no diff: coluna que encolhe de
            # varchar(200) para varchar(20) trunca dado em silêncio.
            compare_type=_comparar_tipo,
            # SQLite não altera coluna no lugar; sem isto, qualquer mudança de
            # coluna falha em desenvolvimento.
            render_as_batch=con.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    offline()
else:
    online()
