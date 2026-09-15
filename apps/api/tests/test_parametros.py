"""Parâmetros: leitura, escrita e — principalmente — o que NÃO sai pela API."""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from trigo_api.config import obter_settings
from trigo_api.db import Parameter, SessionLocal, User
from trigo_api.main import app
from trigo_api.parametros.service import ParametrosService
from trigo_api.security.cipher import SecretCipher
from trigo_api.security.password import hash_password

SENHA = "SenhaDeTeste#2026"
CHAVE_CRED = "TESTE_CREDENCIAL_MIGRACAO"
CHAVE_NUM = "TESTE_NUMERO_MIGRACAO"


@pytest.fixture
def parametros() -> Iterator[None]:
    agora = datetime.now(UTC)
    with SessionLocal() as s:
        s.add(
            Parameter(
                key=CHAVE_CRED, label="Credencial de teste", description=None,
                group_name="Teste", value_type="CREDENTIAL", value=None,
                default_value=None, is_secret=True, updated_by=None,
                updated_at=agora, created_at=agora,
            )
        )
        s.add(
            Parameter(
                key=CHAVE_NUM, label="Numero de teste", description=None,
                group_name="Teste", value_type="NUMBER", value=None,
                default_value="10", is_secret=False, updated_by=None,
                updated_at=agora, created_at=agora,
            )
        )
        s.commit()
    yield
    with SessionLocal() as s:
        s.execute(delete(Parameter).where(Parameter.key.in_([CHAVE_CRED, CHAVE_NUM])))
        s.commit()


@pytest.fixture
def admin() -> Iterator[User]:
    agora = datetime.now(UTC)
    registro = User(
        id=str(uuid.uuid4()), name="Admin Teste",
        email=f"admin-teste-{uuid.uuid4().hex[:8]}@exemplo.local",
        password_hash=hash_password(SENHA), role="ADMIN", is_active=True,
        provider="local", token_version=0, must_change_password=False,
        failed_login_attempts=0, created_at=agora, updated_at=agora,
    )
    with SessionLocal() as s:
        s.add(registro)
        s.commit()
    yield registro
    with SessionLocal() as s:
        s.execute(delete(User).where(User.id == registro.id))
        s.commit()


@pytest.fixture
def cliente(admin: User) -> Iterator[TestClient]:
    with TestClient(app) as c:
        c.post("/api/auth/login", json={"email": admin.email, "password": SENHA})
        yield c


def _servico() -> tuple[ParametrosService, object]:
    sessao = SessionLocal()
    cifra = SecretCipher.from_env(obter_settings().parameter_encryption_key)
    return ParametrosService(sessao, cifra), sessao


def test_valor_vazio_cai_no_padrao(parametros: None) -> None:
    servico, sessao = _servico()
    try:
        assert servico.numero(CHAVE_NUM, 99) == 10
    finally:
        sessao.close()  # type: ignore[attr-defined]


def test_credencial_faz_o_ciclo_completo(parametros: None) -> None:
    servico, sessao = _servico()
    try:
        servico.atualizar_credencial(CHAVE_CRED, "usr", "senha-secreta", "teste@local")
        lida = servico.credencial(CHAVE_CRED)
        assert lida is not None
        assert lida.usuario == "usr"
        assert lida.senha == "senha-secreta"
    finally:
        sessao.close()  # type: ignore[attr-defined]


def test_api_nunca_devolve_a_senha(cliente: TestClient, parametros: None) -> None:
    """O teste que mais importa deste arquivo."""
    cliente.put(
        f"/api/parameters/{CHAVE_CRED}/credencial",
        json={"usuario": "usr", "senha": "senha-que-nao-pode-vazar"},
    )
    resposta = cliente.get("/api/parameters")
    assert resposta.status_code == 200

    corpo = resposta.text
    assert "senha-que-nao-pode-vazar" not in corpo, "a senha vazou na listagem"

    linha = next(p for p in resposta.json() if p["key"] == CHAVE_CRED)
    assert linha["value"] is None, "segredo nao pode vir no value"
    assert linha["temValor"] is True
    assert linha["usuario"] == "usr", "o usuario ajuda na conferencia e pode sair"


def test_numero_invalido_e_recusado(cliente: TestClient, parametros: None) -> None:
    resposta = cliente.put(f"/api/parameters/{CHAVE_NUM}", json={"value": "nao-e-numero"})
    assert resposta.status_code == 400
    assert "numero" in resposta.json()["message"].lower()


def test_credencial_pela_rota_comum_e_recusada(
    cliente: TestClient, parametros: None
) -> None:
    resposta = cliente.put(f"/api/parameters/{CHAVE_CRED}", json={"value": "x"})
    assert resposta.status_code == 400


def test_sem_sessao_nao_lista(parametros: None) -> None:
    with TestClient(app) as c:
        assert c.get("/api/parameters").status_code == 401
