"""Emissão e leitura do token de sessão.

Mesmo payload do backend anterior — ``sub``, ``email``, ``role`` e ``tv`` — e
mesmo algoritmo. Não é nostalgia: é o que permite o front e o app continuarem
lendo a sessão sem mudança, e o ``JWT_SECRET`` do ``.env`` seguir valendo.
"""

from datetime import UTC, datetime, timedelta
from typing import Any, TypedDict

import jwt


class PayloadSessao(TypedDict):
    sub: str
    email: str
    role: str
    #: tokenVersion: permite revogar sessões sem manter lista negra.
    tv: int


class TokenInvalidoError(Exception):
    pass


def emitir(payload: PayloadSessao, segredo: str, segundos: int) -> str:
    agora = datetime.now(UTC)
    corpo: dict[str, Any] = {
        **payload,
        "iat": int(agora.timestamp()),
        "exp": int((agora + timedelta(seconds=segundos)).timestamp()),
    }
    return jwt.encode(corpo, segredo, algorithm="HS256")


def ler(token: str, segredo: str) -> PayloadSessao:
    try:
        corpo = jwt.decode(token, segredo, algorithms=["HS256"])
    except jwt.PyJWTError as erro:
        raise TokenInvalidoError(str(erro)) from erro

    faltando = [c for c in ("sub", "email", "role", "tv") if c not in corpo]
    if faltando:
        raise TokenInvalidoError(f"Token sem {', '.join(faltando)}")

    return PayloadSessao(
        sub=str(corpo["sub"]),
        email=str(corpo["email"]),
        role=str(corpo["role"]),
        tv=int(corpo["tv"]),
    )
