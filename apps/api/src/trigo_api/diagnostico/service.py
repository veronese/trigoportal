"""Diagnóstico do sistema.

REFEITO PARA O MUNDO PYTHON, e não portado. O diagnóstico anterior lia
``package.json``, consultava o registry do npm e planejava atualização de
pacote Node — num backend Python isso descreveria um runtime que não existe
mais. O que sobrevive é a PERGUNTA: o que este sistema precisa para funcionar,
onde ele guarda as coisas, e o que está instalado.

O PLANEJADOR DE ATUALIZAÇÃO NÃO FOI REFEITO. Ele existia para aplicar
atualização de pacote por dentro do portal, com análise de impacto e rollback —
uma decisão de risco que dependia de conhecer o ecossistema npm. Refazê-lo para
``uv`` é trabalho próprio, não tradução, e não faz sentido decidir isso junto
com a migração. Este módulo RELATA versões; não atualiza nada.
"""

import os
import platform
import shutil
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from importlib.metadata import distributions
from pathlib import Path

from sqlalchemy import text

from trigo_api.config import Settings
from trigo_api.db import engine


@dataclass
class ItemRuntime:
    nome: str
    valor: str
    #: O que este item significa para quem opera, não para quem programa.
    observacao: str | None = None


@dataclass
class Caminho:
    nome: str
    caminho: str
    existe: bool
    #: Tamanho em bytes quando é arquivo. Nulo para diretório ou ausente.
    tamanho: int | None = None
    observacao: str | None = None


@dataclass
class Pacote:
    nome: str
    versao: str


@dataclass
class Diagnostico:
    gerado_em: datetime
    runtime: list[ItemRuntime] = field(default_factory=list)
    caminhos: list[Caminho] = field(default_factory=list)
    pacotes: list[Pacote] = field(default_factory=list)
    banco: list[ItemRuntime] = field(default_factory=list)
    #: O que está errado ou merece atenção, em linguagem de quem opera.
    alertas: list[str] = field(default_factory=list)


#: Pacotes que sustentam o portal. A lista existe para o relatório destacar o
#: que importa em vez de despejar as ~50 dependências transitivas.
PRINCIPAIS = (
    "fastapi",
    "uvicorn",
    "pydantic",
    "sqlalchemy",
    "alembic",
    "cryptography",
    "pyjwt",
    "httpx",
    "pyodbc",
)


class DiagnosticoService:
    def __init__(self, settings: Settings) -> None:
        self._s = settings

    def gerar(self) -> Diagnostico:
        d = Diagnostico(gerado_em=datetime.now(UTC))
        self._runtime(d)
        self._caminhos(d)
        self._pacotes(d)
        self._banco(d)
        return d

    def _runtime(self, d: Diagnostico) -> None:
        d.runtime = [
            ItemRuntime("Python", platform.python_version()),
            ItemRuntime("Implementacao", platform.python_implementation()),
            ItemRuntime("Sistema", f"{platform.system()} {platform.release()}"),
            ItemRuntime("Arquitetura", platform.machine()),
            ItemRuntime("Processo", str(os.getpid())),
            ItemRuntime(
                "Ambiente",
                self._s.ambiente,
                "Cookie de sessao so vai como Secure em production."
                if not self._s.producao
                else None,
            ),
        ]

        # Versão mais nova que a homologada merece aviso, e não erro: o portal
        # roda, mas wheel de driver pode faltar. Foi o que aconteceu com o
        # pyodbc no 3.14, e custou uma instalação de Python para descobrir.
        if sys.version_info[:2] > (3, 13):
            d.alertas.append(
                f"O portal foi homologado no Python 3.13 e este e o "
                f"{platform.python_version()}. Confira se todos os pacotes com "
                "codigo nativo — pyodbc, cryptography — tem wheel para esta versao."
            )

    def _caminhos(self, d: Diagnostico) -> None:
        raiz = Path(__file__).resolve().parents[3]
        banco = self._caminho_do_sqlite()

        alvos: list[tuple[str, Path, str | None]] = [
            ("Raiz da aplicacao", raiz, None),
            ("Configuracao (.env)", raiz / ".env", "Guarda JWT_SECRET e a chave de cifragem."),
            ("Dependencias travadas", raiz / "uv.lock", None),
        ]
        if banco is not None:
            alvos.append(("Banco do portal", banco, "Arquivo SQLite. Em producao, SQL Server."))

        for nome, caminho, observacao in alvos:
            existe = caminho.exists()
            d.caminhos.append(
                Caminho(
                    nome=nome,
                    caminho=str(caminho),
                    existe=existe,
                    tamanho=caminho.stat().st_size if existe and caminho.is_file() else None,
                    observacao=observacao,
                )
            )

        if not (raiz / ".env").exists():
            d.alertas.append(
                "Nao ha arquivo .env na raiz da aplicacao: o processo esta usando so "
                "variaveis de ambiente."
            )

        # Espaço em disco onde o banco vive. Disco cheio não avisa antes.
        livre = shutil.disk_usage(str(raiz)).free
        d.runtime.append(
            ItemRuntime("Espaco livre em disco", f"{livre / 1_073_741_824:.1f} GB")
        )
        if livre < 1_073_741_824:
            d.alertas.append("Menos de 1 GB livre no disco onde o portal roda.")

    def _pacotes(self, d: Diagnostico) -> None:
        instalados = {
            (dist.metadata["Name"] or "").lower(): dist.version for dist in distributions()
        }
        d.pacotes = [
            Pacote(nome=nome, versao=instalados.get(nome, "(nao instalado)"))
            for nome in PRINCIPAIS
        ]

        ausentes = [p.nome for p in d.pacotes if p.versao == "(nao instalado)"]
        if ausentes:
            d.alertas.append(
                "Pacote essencial ausente: " + ", ".join(ausentes) + ". Rode `uv sync`."
            )

    def _banco(self, d: Diagnostico) -> None:
        dialeto = engine.dialect.name
        itens = [ItemRuntime("Dialeto", dialeto)]

        try:
            with engine.connect() as con:
                if dialeto == "sqlite":
                    versao = con.execute(text("SELECT sqlite_version()")).scalar_one()
                    itens.append(ItemRuntime("Versao", str(versao)))
                else:
                    versao = con.execute(text("SELECT @@VERSION")).scalar_one()
                    itens.append(ItemRuntime("Versao", str(versao).splitlines()[0]))
                itens.append(ItemRuntime("Conexao", "ok"))
        except Exception as erro:  # noqa: BLE001 - o diagnostico reporta, nao quebra
            itens.append(ItemRuntime("Conexao", "falhou", str(erro).splitlines()[0]))
            d.alertas.append("O portal nao conseguiu abrir o proprio banco.")

        if dialeto == "sqlite":
            d.alertas.append(
                "O portal esta em SQLite. Serve para desenvolvimento; em producao o "
                "destino e SQL Server."
            )

        d.banco = itens

    def _caminho_do_sqlite(self) -> Path | None:
        url = self._s.database_url
        if "sqlite" not in url or "///" not in url:
            return None
        return Path(url.split("///", 1)[1])
