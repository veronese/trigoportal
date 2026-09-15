"""Login ponta a ponta contra o banco real do portal.

Cria um usuário próprio, exercita o fluxo e apaga no fim. NÃO usa a conta de
administrador: teste que depende de credencial real de outra pessoa é teste que
some quando a senha muda, e que vaza essa senha no dia em que alguém imprime a
variável.
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from trigo_api.auth.dependencies import SESSION_COOKIE
from trigo_api.db import SessionLocal, User
from trigo_api.main import app
from trigo_api.security.password import hash_password

SENHA = "SenhaDeTeste#2026"


@pytest.fixture
def usuario() -> Iterator[User]:
    agora = datetime.now(UTC)
    registro = User(
        id=str(uuid.uuid4()),
        name="Teste Migracao",
        email=f"teste-migracao-{uuid.uuid4().hex[:8]}@exemplo.local",
        password_hash=hash_password(SENHA),
        role="ADMIN",
        is_active=True,
        provider="local",
        token_version=0,
        must_change_password=False,
        failed_login_attempts=0,
        created_at=agora,
        updated_at=agora,
    )
    with SessionLocal() as sessao:
        sessao.add(registro)
        sessao.commit()

    yield registro

    with SessionLocal() as sessao:
        sessao.execute(delete(User).where(User.id == registro.id))
        sessao.commit()


@pytest.fixture
def cliente() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def test_health(cliente: TestClient) -> None:
    assert cliente.get("/api/health").json() == {"status": "ok"}


def test_login_devolve_sessao_e_cookie(cliente: TestClient, usuario: User) -> None:
    resposta = cliente.post(
        "/api/auth/login", json={"email": usuario.email, "password": SENHA}
    )
    assert resposta.status_code == 200

    corpo = resposta.json()
    # camelCase: é o que o apps/web já consome.
    assert corpo["user"]["email"] == usuario.email
    assert corpo["user"]["role"] == "ADMIN"
    assert corpo["user"]["mustChangePassword"] is False
    assert "passwordHash" not in corpo["user"]

    cookie = resposta.cookies.get(SESSION_COOKIE)
    assert cookie, "o cookie de sessão precisa vir na resposta"
    assert "httponly" in resposta.headers["set-cookie"].lower()


def test_me_com_a_sessao_do_login(cliente: TestClient, usuario: User) -> None:
    cliente.post("/api/auth/login", json={"email": usuario.email, "password": SENHA})
    resposta = cliente.get("/api/auth/me")
    assert resposta.status_code == 200
    assert resposta.json()["user"]["email"] == usuario.email


def test_me_sem_sessao_e_401(cliente: TestClient) -> None:
    resposta = cliente.get("/api/auth/me")
    assert resposta.status_code == 401
    assert "message" in resposta.json()


def test_logout_limpa_a_sessao(cliente: TestClient, usuario: User) -> None:
    cliente.post("/api/auth/login", json={"email": usuario.email, "password": SENHA})
    assert cliente.post("/api/auth/logout").status_code == 204
    assert cliente.get("/api/auth/me").status_code == 401


def test_senha_errada_nao_revela_se_o_email_existe(
    cliente: TestClient, usuario: User
) -> None:
    existente = cliente.post(
        "/api/auth/login", json={"email": usuario.email, "password": "errada"}
    )
    inexistente = cliente.post(
        "/api/auth/login",
        json={"email": "ninguem@exemplo.local", "password": "errada"},
    )
    assert existente.status_code == inexistente.status_code == 401
    assert existente.json()["message"] == inexistente.json()["message"]


def test_erro_de_validacao_traz_issues(cliente: TestClient) -> None:
    """O front junta `issues` numa frase só; sem elas a tela fica muda."""
    resposta = cliente.post("/api/auth/login", json={"email": "nao-e-email"})
    assert resposta.status_code == 400
    corpo = resposta.json()
    assert corpo["message"] == "Dados invalidos"
    assert len(corpo["issues"]) >= 1
    assert {"path", "message"} <= set(corpo["issues"][0])
