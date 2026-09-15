"""Hash de senha, compatível byte a byte com o backend Node que existia antes.

POR QUE SCRYPT E NÃO ARGON2: não é escolha de hoje, é restrição de migração.
As senhas já gravadas foram derivadas pelo `crypto.scrypt` do Node, com os
parâmetros padrão dele. Trocar de algoritmo agora invalidaria todas elas e
obrigaria o portal inteiro a redefinir senha no primeiro acesso.

O formato gravado é ``scrypt$<salt_hex>$<hash_hex>``.
"""

import hashlib
import hmac
import secrets

#: Parâmetros PADRÃO do ``crypto.scrypt`` do Node. Mudar qualquer um deles
#: invalida todas as senhas já gravadas — não são números escolhidos aqui.
_N = 16384
_R = 8
_P = 1
_KEY_LENGTH = 64
_SALT_LENGTH = 16
_ALGORITHM = "scrypt"


def _derive(plain: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        plain.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_KEY_LENGTH
    )


def hash_password(plain: str) -> str:
    """Deriva a senha no mesmo formato que o backend anterior gravava."""
    salt = secrets.token_bytes(_SALT_LENGTH)
    return f"{_ALGORITHM}${salt.hex()}${_derive(plain, salt).hex()}"


def verify_password(plain: str, stored: str | None) -> bool:
    """Confere a senha contra o valor gravado.

    Comparação em tempo constante: comparar hash com ``==`` vaza, pelo tempo de
    resposta, quantos bytes iniciais conferem.
    """
    if not stored:
        return False

    partes = stored.split("$")
    if len(partes) != 3:
        return False

    algoritmo, salt_hex, hash_hex = partes
    if algoritmo != _ALGORITHM or not salt_hex or not hash_hex:
        return False

    try:
        salt = bytes.fromhex(salt_hex)
        esperado = bytes.fromhex(hash_hex)
    except ValueError:
        return False

    return hmac.compare_digest(_derive(plain, salt), esperado)
