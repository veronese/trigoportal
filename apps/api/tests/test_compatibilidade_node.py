"""Compatibilidade com o backend Node que existia antes da migração.

POR QUE ESTES TESTES SÃO OS PRIMEIROS: eles decidem se a migração custa um
reset de senha para todos os usuários e a redigitação de toda credencial
guardada. Os valores abaixo foram PRODUZIDOS PELO CÓDIGO NODE e estão fixos de
propósito — se algum parâmetro do scrypt ou do formato da cifra mudar, estes
testes quebram, que é exatamente o que se quer.
"""

from trigo_api.security.cipher import SecretCipher
from trigo_api.security.password import hash_password, verify_password

# Gerado por `hashPassword('Senha#Teste2026')` no backend Node.
SENHA_NODE = "Senha#Teste2026"
HASH_NODE = (
    "scrypt$cb31d2dd65a8af3a417a325e541e67ce$"
    "dda57cd4c6fbdaa328d63eb139f647616d6e499d352c3227db5da203d1216f7f"
    "9d06d396fce5bafcc582431275f5c2357d98812ceb6308e49d68416ce815bdad"
)

# Gerado por `SecretCipher.encrypt(...)` no backend Node, com esta chave.
CHAVE_NODE = "a" * 64
CLARO_NODE = '{"usuario":"usrtrigo","senha":"segredo-do-protheus"}'
CIFRADO_NODE = (
    "enc:v1:GUFDBpBblc9XB9U7:wW7C2kcMaVXIRpqc0fg05w==:"
    "d8bKtmINoDAwUqAU3AVboG7KGbT4LQaWz9E65e+V2IwvU/4gjY7BwftRafxBvnlZX9tRWg=="
)


def test_verifica_hash_gerado_pelo_node() -> None:
    """Senha já gravada continua valendo. Sem isso, todos redefinem senha."""
    assert verify_password(SENHA_NODE, HASH_NODE) is True


def test_recusa_senha_errada() -> None:
    assert verify_password("errada", HASH_NODE) is False


def test_recusa_hash_malformado() -> None:
    assert verify_password(SENHA_NODE, "scrypt$so-uma-parte") is False
    assert verify_password(SENHA_NODE, "bcrypt$aa$bb") is False
    assert verify_password(SENHA_NODE, None) is False


def test_hash_novo_e_verificavel() -> None:
    """O que o Python grava, o Python confere — e no mesmo formato do Node."""
    gravado = hash_password("OutraSenha!123")
    assert gravado.startswith("scrypt$")
    assert len(gravado.split("$")) == 3
    assert verify_password("OutraSenha!123", gravado) is True
    assert verify_password("OutraSenha!124", gravado) is False


def test_decifra_valor_cifrado_pelo_node() -> None:
    """Credencial já guardada continua legível. Sem isso, tudo é redigitado."""
    cifra = SecretCipher.from_env(CHAVE_NODE)
    assert cifra.decrypt(CIFRADO_NODE) == CLARO_NODE


def test_ciclo_completo_no_python() -> None:
    cifra = SecretCipher.from_env(CHAVE_NODE)
    selado = cifra.encrypt("valor secreto")
    assert selado.startswith("enc:v1:")
    assert len(selado.split(":")) == 5
    assert cifra.decrypt(selado) == "valor secreto"


def test_texto_claro_legado_passa_direto() -> None:
    """Valor gravado antes da cifragem não pode derrubar o ambiente."""
    cifra = SecretCipher.from_env(CHAVE_NODE)
    assert cifra.decrypt("senha-antiga-em-claro") == "senha-antiga-em-claro"


def test_sem_chave_nao_cifra_mas_le_texto_claro() -> None:
    cifra = SecretCipher.from_env(None)
    assert cifra.is_enabled is False
    assert cifra.decrypt("em-claro") == "em-claro"
