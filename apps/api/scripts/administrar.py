"""Tarefas de administração do portal, pela linha de comando.

Substitui o ``prisma db seed`` do backend anterior. Cada tarefa é explícita e
idempotente, e nenhuma delas roda sozinha na subida da aplicação: rotina que
mexe em dado de produção se chama de propósito, não por efeito colateral de um
deploy.

    uv run python scripts/administrar.py parametros
    uv run python scripts/administrar.py admin --email x@y.com
    uv run python scripts/administrar.py admin --email x@y.com --senha-de-stdin
"""

import argparse
import getpass
import logging
import sys
import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from trigo_api.db import SessionLocal, User
from trigo_api.parametros.sincronizar import sincronizar
from trigo_api.security.password import hash_password

logging.basicConfig(level=logging.INFO, format="%(levelname)-8s %(message)s")
log = logging.getLogger("administrar")


def cmd_parametros(args: argparse.Namespace) -> int:
    with SessionLocal() as sessao:
        r = sincronizar(sessao, podar=not args.sem_podar)

    print()
    print(f"  criados     : {len(r.criados)}")
    for k in r.criados:
        print(f"      + {k}")
    print(f"  atualizados : {len(r.atualizados)}")
    for k in r.atualizados:
        print(f"      ~ {k}")
    print(f"  removidos   : {len(r.removidos)}")
    for k in r.removidos:
        print(f"      - {k}")

    if r.orfaos_com_valor:
        print()
        print("  ATENCAO: sairam do catalogo mas TEM valor configurado, e por isso")
        print("  nao foram removidos. Apague manualmente se nao servem mais:")
        for k in r.orfaos_com_valor:
            print(f"      ! {k}")
    return 0


def cmd_admin(args: argparse.Namespace) -> int:
    """Cria o primeiro administrador.

    A SENHA NÃO VEM POR ARGUMENTO. Argumento de linha de comando fica no
    histórico do shell e aparece na lista de processos para qualquer usuário da
    máquina. Ela é digitada, ou lida da entrada padrão quando o comando roda em
    automação.
    """
    email = args.email.strip().lower()

    with SessionLocal() as sessao:
        if sessao.scalar(select(User).where(User.email == email)) is not None:
            log.info("O usuario %s ja existe. Nada a fazer.", email)
            return 0

        if args.senha_de_stdin:
            senha = sys.stdin.readline().rstrip("\n")
        else:
            senha = getpass.getpass("Senha provisoria: ")
            if senha != getpass.getpass("Repita: "):
                log.error("As senhas nao conferem.")
                return 1

        if len(senha) < 10:
            log.error("A senha precisa ter ao menos 10 caracteres.")
            return 1

        agora = datetime.now(UTC)
        sessao.add(
            User(
                id=str(uuid.uuid4()),
                name=args.nome,
                email=email,
                password_hash=hash_password(senha),
                role="ADMIN",
                is_active=True,
                provider="local",
                token_version=0,
                # Provisória de propósito: a senha digitada aqui passou pelo
                # terminal de alguém e não deve sobreviver ao primeiro acesso.
                must_change_password=True,
                provisional_password_at=agora,
                failed_login_attempts=0,
                created_at=agora,
                updated_at=agora,
            )
        )
        sessao.commit()

    log.info("Administrador %s criado.", email)
    log.info("A senha e PROVISORIA: o portal vai exigir a troca no primeiro acesso.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Administracao do Portal Trigo")
    sub = parser.add_subparsers(dest="comando", required=True)

    p = sub.add_parser("parametros", help="sincroniza a tabela de parametros com o catalogo")
    p.add_argument(
        "--sem-podar",
        action="store_true",
        help="nao remove do banco o que saiu do catalogo",
    )
    p.set_defaults(func=cmd_parametros)

    a = sub.add_parser("admin", help="cria o primeiro administrador")
    a.add_argument("--email", required=True)
    a.add_argument("--nome", default="Administrador")
    a.add_argument(
        "--senha-de-stdin",
        action="store_true",
        help="le a senha da entrada padrao, para automacao",
    )
    a.set_defaults(func=cmd_admin)

    args = parser.parse_args()
    resultado: int = args.func(args)
    return resultado


if __name__ == "__main__":
    raise SystemExit(main())
