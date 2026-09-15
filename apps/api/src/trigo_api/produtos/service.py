"""Cadastro de produtos: espelho local e carga a partir do Protheus.

A REGRA DO EMPORI VIVE AQUI, e em nenhum outro lugar. ``EMPORI`` recebe SEMPRE
o código da empresa de origem, sem exceção: o portal quer poder dizer de onde
cada produto veio, e um valor vazio para uma das empresas tornaria "vazio"
ambíguo entre "empresa X" e "origem desconhecida".

A carga por banco e a carga por REST chamam o MESMO ``espelhar``. Duplicar a
regra faria as duas divergirem no dia em que uma fosse corrigida — foi por isso
que ela ficou num lugar só desde o começo.
"""

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from time import perf_counter
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from trigo_api.db import Product
from trigo_api.protheus_db.service import ProtheusDbService

logger = logging.getLogger(__name__)

#: Teto de parâmetros por comando, por dialeto.
#:
#: O SQL Server para em 2.100 e o SQLite em 32.766. O lote não pode ser um
#: número escolhido a olho: com 20 colunas, 2.000 linhas viram 40.000
#: parâmetros e o comando falha — foi o que aconteceu na primeira tentativa.
#: A margem existe porque o SQLAlchemy acrescenta parâmetros próprios ao
#: ON CONFLICT.
TETO_PARAMETROS = {"sqlite": 30_000, "mssql": 2_000}
TETO_PADRAO = 2_000

#: Colunas da SB1 que o espelho guarda. Uma lista só, usada pela consulta e
#: pela conversão: campo acrescentado em uma e esquecido na outra é a forma
#: silenciosa de a carga passar a gravar nulo.
COLUNAS_SB1 = (
    "B1_COD", "B1_DESC", "B1_TIPO", "B1_UM", "B1_LOCPAD", "B1_GRUPO",
    "B1_MSBLQL", "B1_ATIVO", "B1_POSIPI", "B1_XCTACUS", "B1_XCTADES",
    "B1_XCONTA", "B1_CONTA", "B1_MODELO",
)


@dataclass
class ResultadoEmpresa:
    empresa: str
    empori: str
    source_table: str
    paginas: int = 0
    lidos: int = 0
    gravados: int = 0
    #: Registros da origem que colidiram no espelho. A chave é (EMPORI, código
    #: APARADO), e a origem pode ter dois registros que só diferem por
    #: enchimento invisível — na SB1090 são 7.
    duplicados: int = 0
    erro: str | None = None


@dataclass
class ResultadoCarga:
    empresas: list[ResultadoEmpresa] = field(default_factory=list)
    lidos: int = 0
    gravados: int = 0
    duracao_ms: int = 0


def _texto(bruto: Any) -> str:
    """CHAR do Protheus vem com enchimento à direita."""
    return bruto.rstrip() if isinstance(bruto, str) else ""


def bloqueado_de(bruto: Any) -> bool:
    """``B1_MSBLQL``: '1' bloqueia. '2' e vazio liberam.

    Comparo com '1' em vez de "diferente de vazio" porque produto liberado
    explicitamente vem com '2' — tratar isso como bloqueado esconderia do
    portal a maior parte do cadastro.
    """
    return _texto(bruto) == "1"


def ativo_de(bruto: Any) -> bool:
    """``B1_ATIVO``: domínio S/N. Vazio conta como ATIVO.

    Em base antiga o campo pode nunca ter sido preenchido, e assumir inativo
    esconderia produto em uso.
    """
    return _texto(bruto).upper() != "N"


class ProdutosService:
    def __init__(self, sessao: Session, protheus: ProtheusDbService) -> None:
        self._sessao = sessao
        self._protheus = protheus

    # -------------------------------------------------------------- consulta

    def listar(
        self,
        busca: str | None = None,
        empori: str | None = None,
        pagina: int = 1,
        tamanho: int = 50,
    ) -> tuple[list[Product], int]:
        pagina = max(1, pagina)
        tamanho = max(1, min(200, tamanho))

        consulta = select(Product)
        if empori is not None and empori != "":
            consulta = consulta.where(Product.empori == empori)
        if busca:
            alvo = f"%{busca.strip()}%"
            consulta = consulta.where(
                or_(Product.code.like(alvo), Product.description.like(alvo))
            )

        total = self._sessao.scalar(
            select(func.count()).select_from(consulta.subquery())
        )
        linhas = list(
            self._sessao.scalars(
                consulta.order_by(Product.code)
                .offset((pagina - 1) * tamanho)
                .limit(tamanho)
            )
        )
        return linhas, int(total or 0)

    def obter(self, produto_id: str) -> Product | None:
        return self._sessao.get(Product, produto_id)

    # ----------------------------------------------------------------- carga

    def carregar_do_banco(
        self, empresas: list[str], tamanho_pagina: int = 2000
    ) -> ResultadoCarga:
        """Lê as empresas direto do banco do ERP e grava no espelho.

        Falha de UMA empresa não aborta as outras: o relatório traz o erro por
        empresa. Carga parcial é melhor que carga nenhuma, desde que fique
        claro o que ficou de fora.
        """
        inicio = perf_counter()
        resultado = ResultadoCarga()

        for empresa in empresas:
            parcial = ResultadoEmpresa(
                empresa=empresa,
                # EMPORI é a empresa de origem, direto. Sem tradução, sem exceção.
                empori=empresa,
                source_table=f"SB1{empresa}0",
            )
            try:
                self._carregar_empresa(parcial, tamanho_pagina)
            except Exception as erro:  # noqa: BLE001 - o relatório é por empresa
                parcial.erro = str(erro)
                logger.error("Carga por banco da empresa %s falhou: %s", empresa, erro)
            resultado.empresas.append(parcial)

        resultado.lidos = sum(e.lidos for e in resultado.empresas)
        resultado.gravados = sum(e.gravados for e in resultado.empresas)
        resultado.duracao_ms = int((perf_counter() - inicio) * 1000)
        logger.info(
            "Carga de produtos por banco: %s gravado(s) de %s lido(s) em %sms.",
            resultado.gravados,
            resultado.lidos,
            resultado.duracao_ms,
        )
        return resultado

    def _carregar_empresa(self, parcial: ResultadoEmpresa, tamanho: int) -> None:
        """Percorre a empresa inteira em UMA conexão, gravando página a página.

        UMA CONEXÃO, e não uma por página: abrir por página fez 37 handshakes
        contra o banco remoto e derrubou a carga da empresa 09 na quinta
        página, depois de 8.000 dos 41.861 registros.

        A gravação acontece DENTRO da travessia: esperar o fim significaria
        perder tudo que já foi lido se a última página falhasse.
        """
        tabela = self._protheus.tabela_produtos(parcial.empresa)
        sincronizado_em = datetime.now(UTC)
        vistos: set[str] = set()
        passo = max(1, min(5000, tamanho))
        pulo = 0

        consulta = (
            f"SELECT {', '.join('TAB.' + c for c in COLUNAS_SB1)} "  # noqa: S608
            f"FROM [{tabela}] TAB WITH (NOLOCK) "
            "WHERE TAB.D_E_L_E_T_ = ' ' "
            "ORDER BY TAB.R_E_C_N_O_ "
            "OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
        )

        with self._protheus.conexao() as con:
            while True:
                linhas = con.cursor().execute(consulta, pulo, passo).fetchall()
                if not linhas:
                    break

                itens = []
                for linha in linhas:
                    campos = dict(zip(COLUNAS_SB1, linha, strict=True))
                    codigo = _texto(campos["B1_COD"])
                    # Produto sem código não tem chave: não há o que gravar.
                    if codigo == "":
                        continue
                    if codigo in vistos:
                        logger.warning(
                            'Empresa %s: o codigo "%s" aparece mais de uma vez na '
                            "origem. O espelho guarda o ultimo lido. Confira o "
                            "cadastro: codigos que so diferem por espaco nao "
                            "separavel sao a causa mais comum.",
                            parcial.empresa,
                            codigo,
                        )
                        parcial.duplicados += 1
                    vistos.add(codigo)
                    itens.append((codigo, campos))

                parcial.paginas += 1
                parcial.lidos += len(linhas)
                parcial.gravados += self.espelhar(
                    parcial.empresa, itens, sincronizado_em
                )
                pulo += len(linhas)

                # Página menor que o passo é a última.
                if len(linhas) < passo:
                    break

    def espelhar(
        self,
        empresa: str,
        itens: list[tuple[str, dict[str, Any]]],
        sincronizado_em: datetime,
    ) -> int:
        """Grava produtos no espelho, por (EMPORI, código).

        ``sale_price`` fica de fora: a SB1 não traz B1_PRV1 nesta consulta, e
        sobrescrever com nulo apagaria dado que outra fonte venha a preencher.

        Gravação em LOTE. O backend anterior fazia um upsert por produto, e os
        72 mil levavam minutos — aqui o custo é por página.
        """
        if not itens:
            return 0

        source_table = f"SB1{empresa}0"
        agora = datetime.now(UTC)
        linhas = [
            {
                # uuid como as linhas ja gravadas. Em conflito o id nao e
                # atualizado, entao o das linhas existentes e preservado.
                "id": str(uuid.uuid4()),
                "empori": empresa,
                "code": codigo,
                "source_table": source_table,
                "description": _texto(c["B1_DESC"]),
                "type": _texto(c["B1_TIPO"]) or None,
                "unit": _texto(c["B1_UM"]) or None,
                "group_code": _texto(c["B1_GRUPO"]) or None,
                "default_warehouse": _texto(c["B1_LOCPAD"]) or None,
                "ncm": _texto(c["B1_POSIPI"]) or None,
                "fiscal_model": _texto(c["B1_MODELO"]) or None,
                "is_blocked": bloqueado_de(c["B1_MSBLQL"]),
                "is_active": ativo_de(c["B1_ATIVO"]),
                "cost_center": _texto(c["B1_XCTACUS"]) or None,
                "expense_account": _texto(c["B1_XCTADES"]) or None,
                "asset_account": _texto(c["B1_XCONTA"]) or None,
                "revenue_account": _texto(c["B1_CONTA"]) or None,
                "synced_at": sincronizado_em,
                "created_at": agora,
                "updated_at": agora,
            }
            for codigo, c in itens
        ]

        dialeto = self._sessao.get_bind().dialect.name
        teto = TETO_PARAMETROS.get(dialeto, TETO_PADRAO)
        por_lote = max(1, teto // len(linhas[0]))

        for inicio in range(0, len(linhas), por_lote):
            lote = linhas[inicio : inicio + por_lote]
            comando = sqlite_insert(Product).values(lote)
            atualizaveis = {
                coluna: getattr(comando.excluded, coluna)
                for coluna in lote[0]
                if coluna not in ("id", "empori", "code", "created_at")
            }
            self._sessao.execute(
                comando.on_conflict_do_update(
                    index_elements=[Product.empori, Product.code], set_=atualizaveis
                )
            )

        self._sessao.commit()
        return len(linhas)
