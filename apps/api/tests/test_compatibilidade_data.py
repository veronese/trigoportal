"""Formato de data compatível com o que o Prisma gravou.

POR QUE ISTO É UM TESTE E NÃO UM COMENTÁRIO: o Prisma guarda ``DateTime`` no
SQLite como inteiro de milissegundos, e o SQLAlchemy usa texto ISO por padrão.
A divergência não aparece no typecheck nem no boot — aparece como
``fromisoformat: argument must be str`` na primeira linha escrita pelo backend
anterior, que foi exatamente como ela apareceu.

E a gravação importa tanto quanto a leitura: enquanto os dois backends
coexistirem, o que o Python escrever precisa continuar legível para o Node.
"""

import sqlite3
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select

from trigo_api.config import obter_settings
from trigo_api.db import Parameter, SessionLocal, User


def _caminho_do_banco() -> str:
    url = obter_settings().database_url
    return url.split("///", 1)[1]


def test_le_data_gravada_pelo_prisma() -> None:
    """Linha escrita pelo backend anterior tem de virar datetime utilizável."""
    with SessionLocal() as sessao:
        parametro = sessao.scalar(select(Parameter).limit(1))
        assert parametro is not None, "o banco precisa ter ao menos um parâmetro"
        assert isinstance(parametro.updated_at, datetime)
        assert parametro.updated_at.tzinfo is not None, "a data volta em UTC"
        # Sanidade: uma data de parâmetro do portal não é de 1970 nem do futuro.
        assert datetime(2020, 1, 1, tzinfo=UTC) < parametro.updated_at
        assert parametro.updated_at < datetime.now(UTC) + timedelta(days=1)


def test_grava_no_formato_que_o_prisma_le() -> None:
    """O que o Python escreve tem de ser inteiro de milissegundos no SQLite.

    Se virar texto ISO, o backend Node para de ler a linha — e os dois precisam
    conviver durante a migração.
    """
    momento = datetime(2026, 3, 14, 15, 9, 26, tzinfo=UTC)
    registro = User(
        id=str(uuid.uuid4()),
        name="Teste Data",
        email=f"teste-data-{uuid.uuid4().hex[:8]}@exemplo.local",
        password_hash=None,
        role="USER",
        is_active=True,
        provider="local",
        token_version=0,
        must_change_password=False,
        failed_login_attempts=0,
        created_at=momento,
        updated_at=momento,
    )

    try:
        with SessionLocal() as sessao:
            sessao.add(registro)
            sessao.commit()

        # Lê o valor CRU, sem passar pelo SQLAlchemy: é o único jeito de provar
        # o formato físico em vez de provar a própria conversão.
        con = sqlite3.connect(_caminho_do_banco())
        try:
            tipo, valor = con.execute(
                "SELECT typeof(created_at), created_at FROM tp_users WHERE id = ?",
                (registro.id,),
            ).fetchone()
        finally:
            con.close()

        assert tipo == "integer", f"o Prisma espera inteiro, veio {tipo}"
        assert valor == int(momento.timestamp() * 1000)

        # E o ciclo fecha: o que foi gravado volta igual.
        with SessionLocal() as sessao:
            lido = sessao.get(User, registro.id)
            assert lido is not None
            assert lido.created_at == momento
    finally:
        with SessionLocal() as sessao:
            sessao.execute(delete(User).where(User.id == registro.id))
            sessao.commit()
