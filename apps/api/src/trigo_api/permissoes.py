"""Modelo de autorização: papéis agrupam permissões granulares.

Porta fiel do que existia em ``packages/core``. Enquanto os dois backends
coexistem, as duas listas precisam dizer a mesma coisa — permissão que só
existe de um lado é rota que responde 403 num backend e 200 no outro.

A tela não consulta mais este arquivo: ela recebe a lista de permissões da
sessão pela API. É isso que evita a cópia em TypeScript.
"""

from typing import Final

Permissao = str
Papel = str

PERMISSOES: Final[tuple[Permissao, ...]] = (
    # Módulo Cadastros
    "users:read",
    "users:write",
    "users:delete",
    # Módulo Configurador
    "settings:read",
    "settings:write",
    # Produtos espelhados do Protheus
    "products:read",
    "products:sync",
    # Console de consulta ao banco do ERP. Separada de settings de propósito:
    # escrever SQL livre contra a produção do Protheus é poder de outra ordem.
    "protheusdb:consultar",
)

PAPEIS: Final[tuple[Papel, ...]] = ("ADMIN", "MANAGER", "USER")

PERMISSOES_POR_PAPEL: Final[dict[Papel, tuple[Permissao, ...]]] = {
    "ADMIN": PERMISSOES,
    # Gestor enxerga cadastros e consulta a parametrização, mas não altera nada
    # sistêmico.
    "MANAGER": ("users:read", "settings:read", "products:read"),
    # Consultar produto é leitura de cadastro corporativo: todo autenticado.
    "USER": ("products:read",),
}

ROTULOS: Final[dict[Permissao, str]] = {
    "users:read": "Consultar usuarios",
    "users:write": "Cadastrar e alterar usuarios",
    "users:delete": "Desativar e excluir usuarios",
    "settings:read": "Consultar a parametrizacao do sistema",
    "settings:write": "Alterar a parametrizacao do sistema",
    "products:read": "Consultar produtos",
    "products:sync": "Disparar a carga de produtos do Protheus",
    "protheusdb:consultar": "Consultar o banco do Protheus por SQL",
}


def pode(papel: str, permissao: Permissao) -> bool:
    return permissao in PERMISSOES_POR_PAPEL.get(papel, ())


def permissoes_de(papel: str) -> list[Permissao]:
    return list(PERMISSOES_POR_PAPEL.get(papel, ()))
