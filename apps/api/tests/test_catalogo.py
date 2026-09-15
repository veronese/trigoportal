"""Catálogo de parâmetros e sua sincronização.

O teste que mais importa aqui é o de IDEMPOTÊNCIA: esta rotina roda em ambiente
com dado real, e rodá-la de novo não pode custar configuração de ninguém.
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session, sessionmaker

from trigo_api.db import Base, Parameter, SessionLocal
from trigo_api.parametros.catalogo import CATALOGO, CHAVES_PUBLICAS
from trigo_api.parametros.sincronizar import sincronizar


@pytest.fixture
def banco_limpo() -> Session:
    """Banco em memória, para a sincronização não tocar no dev.db."""
    motor = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(motor)
    return sessionmaker(bind=motor)()


def test_catalogo_nao_tem_chave_repetida() -> None:
    chaves = [d.key for d in CATALOGO]
    assert len(chaves) == len(set(chaves)), "chave repetida faz a ultima vencer em silencio"


def test_chaves_publicas_existem_no_catalogo() -> None:
    """Público que não existe é rota de login pedindo parâmetro inexistente."""
    chaves = {d.key for d in CATALOGO}
    for publica in CHAVES_PUBLICAS:
        assert publica in chaves, f"{publica} e publica mas nao esta no catalogo"


def test_credencial_e_secret_sao_marcados() -> None:
    """``is_secret`` errado grava senha em texto claro. Vale um teste."""
    for definicao in CATALOGO:
        if definicao.type in ("SECRET", "CREDENTIAL"):
            assert definicao.is_secret, f"{definicao.key} e {definicao.type} e deveria ser secreto"
            assert definicao.default_value is None, (
                f"{definicao.key} e secreto e nao pode ter valor padrao no codigo"
            )


def test_numero_tem_padrao_numerico() -> None:
    for definicao in CATALOGO:
        if definicao.type == "NUMBER" and definicao.default_value is not None:
            float(definicao.default_value)


def test_cria_tudo_no_banco_vazio(banco_limpo: Session) -> None:
    r = sincronizar(banco_limpo)
    assert len(r.criados) == len(CATALOGO)
    assert r.atualizados == []
    assert r.removidos == []


def test_rodar_de_novo_nao_faz_nada(banco_limpo: Session) -> None:
    """Idempotência: o teste mais importante deste arquivo."""
    sincronizar(banco_limpo)
    segunda = sincronizar(banco_limpo)
    assert segunda.criados == []
    assert segunda.atualizados == []
    assert segunda.removidos == []


def test_nao_sobrescreve_valor_customizado(banco_limpo: Session) -> None:
    """O que o cliente configurou é dele. Atualizar catálogo não é resetar."""
    sincronizar(banco_limpo)

    linha = banco_limpo.get(Parameter, "PRODUTOS_EMPRESAS")
    assert linha is not None
    linha.value = "02"
    linha.label = "rotulo antigo"
    banco_limpo.commit()

    sincronizar(banco_limpo)

    depois = banco_limpo.get(Parameter, "PRODUTOS_EMPRESAS")
    assert depois is not None
    assert depois.value == "02", "o valor configurado foi perdido"
    assert depois.label != "rotulo antigo", "o rotulo deveria ter sido atualizado"


def test_poda_orfao_sem_valor(banco_limpo: Session) -> None:
    sincronizar(banco_limpo)
    agora = datetime.now(UTC)
    banco_limpo.add(
        Parameter(
            key="SAIU_DO_CATALOGO", label="x", description=None, group_name="Teste",
            value_type="STRING", value=None, default_value=None, is_secret=False,
            updated_by=None, updated_at=agora, created_at=agora,
        )
    )
    banco_limpo.commit()

    r = sincronizar(banco_limpo)
    assert "SAIU_DO_CATALOGO" in r.removidos
    assert banco_limpo.get(Parameter, "SAIU_DO_CATALOGO") is None


def test_nao_apaga_orfao_que_tem_valor(banco_limpo: Session) -> None:
    """Apagar valor configurado porque o código mudou de ideia é perda de dado."""
    sincronizar(banco_limpo)
    agora = datetime.now(UTC)
    banco_limpo.add(
        Parameter(
            key="SAIU_MAS_TEM_VALOR", label="x", description=None, group_name="Teste",
            value_type="STRING", value="algo que alguem configurou", default_value=None,
            is_secret=False, updated_by=None, updated_at=agora, created_at=agora,
        )
    )
    banco_limpo.commit()

    r = sincronizar(banco_limpo)
    assert "SAIU_MAS_TEM_VALOR" in r.orfaos_com_valor
    assert "SAIU_MAS_TEM_VALOR" not in r.removidos
    assert banco_limpo.get(Parameter, "SAIU_MAS_TEM_VALOR") is not None


def test_bate_com_o_banco_real() -> None:
    """O catálogo Python descreve o mesmo que o catálogo Node produziu.

    Comparação de METADADO, não de valor: o banco de desenvolvimento tem
    configuração real, e o que se quer provar é que as 25 definições conferem.
    """
    with SessionLocal() as sessao:
        gravados = {p.key: p for p in sessao.scalars(select(Parameter))}

    for definicao in CATALOGO:
        linha = gravados.get(definicao.key)
        assert linha is not None, f"{definicao.key} nao existe no banco real"
        assert linha.value_type == definicao.type, f"{definicao.key}: tipo divergente"
        assert linha.is_secret == definicao.is_secret, f"{definicao.key}: is_secret divergente"
        assert linha.default_value == definicao.default_value, (
            f"{definicao.key}: padrao divergente"
        )


@pytest.fixture(autouse=True)
def _limpar_sobras() -> None:
    """Remove sobras de execução anterior interrompida, se houver."""
    yield
    with SessionLocal() as sessao:
        sessao.execute(
            delete(Parameter).where(
                Parameter.key.in_(["SAIU_DO_CATALOGO", "SAIU_MAS_TEM_VALOR"])
            )
        )
        sessao.commit()
