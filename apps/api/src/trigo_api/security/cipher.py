"""Cifra dos parâmetros do tipo SECRET, compatível com o backend anterior.

Sem isso, a senha de serviço do Protheus ficaria legível para qualquer um com
acesso de leitura ao banco — backup, réplica, dump de suporte. AES-256-GCM dá
confidencialidade e autenticidade: valor adulterado falha na decifragem em vez
de virar lixo silencioso.

A chave vive no ambiente (``PARAMETER_ENCRYPTION_KEY``), NUNCA no banco:
guardar a chave junto do dado cifrado não protege de nada.

O formato é ``enc:v1:<iv_b64>:<tag_b64>:<payload_b64>``, o mesmo que o backend
Node gravava — os valores já cifrados continuam legíveis, e ninguém precisa
redigitar credencial por causa da migração.
"""

import base64
import logging
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_PREFIX = "enc:v1"
_IV_BYTES = 12
_KEY_BYTES = 32

logger = logging.getLogger(__name__)


class SecretCipherError(RuntimeError):
    """Falha de configuração ou de formato na cifragem."""


class SecretCipher:
    """Cifra e decifra valores de parâmetro."""

    def __init__(self, key: bytes | None) -> None:
        self._key = key

    @classmethod
    def from_env(cls, raw: str | None) -> "SecretCipher":
        if raw is None or raw.strip() == "":
            return cls(None)

        try:
            key = bytes.fromhex(raw.strip())
        except ValueError as erro:
            raise SecretCipherError(
                "PARAMETER_ENCRYPTION_KEY não é hexadecimal válido."
            ) from erro

        if len(key) != _KEY_BYTES:
            raise SecretCipherError(
                f"PARAMETER_ENCRYPTION_KEY deve ter {_KEY_BYTES} bytes em hexadecimal "
                f"({_KEY_BYTES * 2} caracteres)."
            )
        return cls(key)

    @property
    def is_enabled(self) -> bool:
        return self._key is not None

    def encrypt(self, plain: str) -> str:
        if self._key is None:
            raise SecretCipherError(
                "PARAMETER_ENCRYPTION_KEY não configurada: não é possível gravar "
                "parâmetro do tipo SECRET."
            )

        iv = os.urandom(_IV_BYTES)
        # O AESGCM do `cryptography` devolve payload + tag concatenados; o
        # formato do portal guarda os dois separados, então a tag é fatiada.
        selado = AESGCM(self._key).encrypt(iv, plain.encode("utf-8"), None)
        payload, tag = selado[:-16], selado[-16:]

        return ":".join(
            [
                _PREFIX,
                base64.b64encode(iv).decode("ascii"),
                base64.b64encode(tag).decode("ascii"),
                base64.b64encode(payload).decode("ascii"),
            ]
        )

    def decrypt(self, stored: str) -> str:
        """Decifra o valor gravado.

        Valor sem o prefixo ``enc:v1`` é tratado como legado em texto claro:
        devolve como está e avisa no log, para não derrubar ambiente que gravou
        antes de a cifragem existir. A próxima escrita já grava cifrado.
        """
        if not stored.startswith(f"{_PREFIX}:"):
            logger.warning(
                "Parâmetro SECRET encontrado em texto claro (gravado antes da "
                "cifragem). Regrave o valor para cifrá-lo."
            )
            return stored

        if self._key is None:
            raise SecretCipherError(
                "Parâmetro SECRET está cifrado, mas PARAMETER_ENCRYPTION_KEY não "
                "está configurada."
            )

        # O próprio prefixo tem dois pedaços ("enc" e "v1"), então o iv começa no
        # índice 2. Base64 não contém ':', logo o split é seguro.
        partes = stored.split(":")
        if len(partes) != 5 or not all(partes[2:5]):
            raise SecretCipherError("Parâmetro SECRET com formato inválido.")

        iv = base64.b64decode(partes[2])
        tag = base64.b64decode(partes[3])
        payload = base64.b64decode(partes[4])

        aberto = AESGCM(self._key).decrypt(iv, payload + tag, None)
        return aberto.decode("utf-8")
