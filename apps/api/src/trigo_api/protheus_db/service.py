"""Conexão direta com o SQL Server do Protheus, em LEITURA.

POR QUE EXISTE, ao lado do REST: o appserver recusa empresa sem ambiente
preparado — foi o que barrou a empresa 09 por semanas. O banco não tem esse
conceito: ``SB1090`` é uma tabela como outra qualquer, no mesmo banco da
``SB1020``.

O QUE ESTE SERVIÇO NÃO FAZ: escrever. Não há método de escrita aqui, e não é
esquecimento. Gravar no Protheus por SQL pula validação, gatilho e log do
framework — é assim que se corrompe um ERP em silêncio. Inclusão e alteração
continuam pelo REST, com ExecAuto.
"""

import logging
import re
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

import pyodbc

from trigo_api.errors import ApiError
from trigo_api.parametros.service import ParametrosService
from trigo_api.protheus_db.sql_guard import analisar_sql_leitura

logger = logging.getLogger(__name__)

#: Teto da listagem de tabelas.
#:
#: O banco do Protheus tem 59.015 tabelas. Devolver todas trava o navegador
#: antes de a pessoa ler a primeira — e quem procura uma tabela sabe ao menos o
#: começo do nome. O filtro é a ferramenta; a lista sem filtro é um ponto de
#: partida.
TETO_TABELAS = 300

_NOME_TABELA = re.compile(r"^[A-Za-z0-9_$#]{1,128}$")
_EMPRESA = re.compile(r"^[A-Za-z0-9]{2}$")


@dataclass
class ConfigProtheusDb:
    host: str
    porta: int
    banco: str
    usuario: str
    senha_configurada: bool
    criptografia: bool
    certificado_confiavel: bool
    timeout_segundos: int
    configurado: bool
    pendencias: list[str] = field(default_factory=list)


class ProtheusDbService:
    def __init__(self, parametros: ParametrosService) -> None:
        self._p = parametros

    # --------------------------------------------------------------- config

    def config(self) -> ConfigProtheusDb:
        host = self._p.texto("PROTHEUS_DB_HOST").strip()
        banco = self._p.texto("PROTHEUS_DB_BANCO").strip()
        credencial = self._p.credencial("PROTHEUS_DB_CREDENCIAL")

        # Cada pendência diz o que fazer, e não só o que falta: "configurado:
        # false" sozinho manda a pessoa procurar qual dos campos está vazio.
        pendencias: list[str] = []
        if not host:
            pendencias.append("Informe o servidor do banco em Configurador > Parametros.")
        if not banco:
            pendencias.append("Informe o nome do banco de dados.")
        if credencial is None or not credencial.usuario:
            pendencias.append("Informe a credencial do banco (login e senha).")

        return ConfigProtheusDb(
            host=host,
            porta=self._p.numero("PROTHEUS_DB_PORTA", 1433),
            banco=banco,
            usuario=credencial.usuario if credencial else "",
            senha_configurada=bool(credencial and credencial.senha),
            criptografia=self._p.logico("PROTHEUS_DB_CRIPTOGRAFIA", True),
            certificado_confiavel=self._p.logico("PROTHEUS_DB_CERTIFICADO_CONFIAVEL", True),
            timeout_segundos=self._p.numero("PROTHEUS_DB_TIMEOUT_SEGUNDOS", 15),
            configurado=not pendencias,
            pendencias=pendencias,
        )

    def _string_de_conexao(self) -> tuple[str, int]:
        cfg = self.config()
        credencial = self._p.credencial("PROTHEUS_DB_CREDENCIAL")
        if not cfg.configurado or credencial is None:
            raise ApiError(
                503,
                "A conexao com o banco do Protheus nao esta configurada. "
                + " ".join(cfg.pendencias),
            )

        timeout = max(1, cfg.timeout_segundos)
        texto = (
            "DRIVER={ODBC Driver 18 for SQL Server};"
            f"SERVER={cfg.host},{cfg.porta};DATABASE={cfg.banco};"
            f"UID={credencial.usuario};PWD={credencial.senha};"
            f"Encrypt={'yes' if cfg.criptografia else 'no'};"
            f"TrustServerCertificate={'yes' if cfg.certificado_confiavel else 'no'};"
            f"Connection Timeout={timeout};"
        )
        return texto, timeout

    @contextmanager
    def conexao(self) -> Iterator[pyodbc.Connection]:
        """Abre, entrega e fecha.

        UMA CONEXÃO POR OPERAÇÃO para o que é avulso — consulta do console,
        teste, listagem. Para PERCORRER, o chamador segura este contexto e
        pagina por dentro: abrir por página custou uma carga inteira no backend
        anterior, com 37 handshakes contra o banco remoto.
        """
        texto, timeout = self._string_de_conexao()
        try:
            con = pyodbc.connect(texto, timeout=timeout)
        except pyodbc.Error as erro:
            raise ApiError(503, self._explicar(str(erro))) from erro

        try:
            yield con
        finally:
            con.close()

    # -------------------------------------------------------------- console

    def listar_tabelas(self, busca: str | None = None) -> list[dict[str, Any]]:
        filtro = (busca or "").strip()
        like = f"%{filtro}%" if filtro else None
        prefixo = f"{filtro}%" if filtro else None

        # A contagem vem de `sys.partitions`, que é catálogo, e NÃO da DMV
        # dm_db_partition_stats, que exige VIEW DATABASE STATE — permissão que
        # um login somente leitura normalmente não tem, e cuja falta derrubava a
        # listagem inteira em vez de só a contagem.
        com_contagem = """
            SELECT TOP (?) t.name AS nome, s.name AS esquema,
                   CONVERT(bigint, ISNULL(SUM(p.rows), 0)) AS registros
            FROM sys.tables t
            JOIN sys.schemas s ON s.schema_id = t.schema_id
            LEFT JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
            WHERE (? IS NULL OR t.name LIKE ?)
            GROUP BY t.name, s.name
            ORDER BY CASE WHEN ? IS NULL OR t.name LIKE ? THEN 0 ELSE 1 END, t.name
        """
        sem_contagem = """
            SELECT TOP (?) t.name AS nome, s.name AS esquema
            FROM sys.tables t
            JOIN sys.schemas s ON s.schema_id = t.schema_id
            WHERE (? IS NULL OR t.name LIKE ?)
            ORDER BY CASE WHEN ? IS NULL OR t.name LIKE ? THEN 0 ELSE 1 END, t.name
        """

        with self.conexao() as con:
            try:
                linhas = (
                    con.cursor()
                    .execute(com_contagem, TETO_TABELAS, like, like, prefixo, prefixo)
                    .fetchall()
                )
                return [
                    {
                        "nome": linha.nome,
                        "esquema": linha.esquema,
                        "registrosEstimados": int(linha.registros),
                    }
                    for linha in linhas
                ]
            except pyodbc.Error as erro:
                logger.warning(
                    "Nao foi possivel estimar o tamanho das tabelas (o login nao le as "
                    "estatisticas). Listando sem contagem. Detalhe: %s",
                    erro,
                )

            # A lista de tabelas vale por si: sem ela a tela fica vazia e a
            # pessoa não tem por onde começar. A contagem é conveniência.
            linhas = (
                con.cursor()
                .execute(sem_contagem, TETO_TABELAS, like, like, prefixo, prefixo)
                .fetchall()
            )
            return [
                {"nome": linha.nome, "esquema": linha.esquema, "registrosEstimados": None}
                for linha in linhas
            ]

    def descrever_tabela(self, tabela: str) -> list[dict[str, Any]]:
        nome = tabela.strip()
        if not _NOME_TABELA.match(nome):
            raise ApiError(400, f"Nome de tabela invalido: {tabela!r}.")

        consulta = """
            SELECT c.name AS nome, ty.name AS tipo, c.max_length AS tamanho,
                   c.is_nullable AS nulo
            FROM sys.columns c
            JOIN sys.tables t ON t.object_id = c.object_id
            JOIN sys.types ty ON ty.user_type_id = c.user_type_id
            WHERE t.name = ?
            ORDER BY c.column_id
        """
        with self.conexao() as con:
            linhas = con.cursor().execute(consulta, nome).fetchall()

        return [
            {
                "nome": linha.nome,
                "tipo": linha.tipo,
                "tamanho": None if linha.tamanho == -1 else int(linha.tamanho),
                "aceitaNulo": bool(linha.nulo),
            }
            for linha in linhas
        ]

    def consultar(self, sql: str, limite: int, autor: str) -> dict[str, Any]:
        """Executa uma consulta escrita à mão.

        DUAS TRAVAS, e as duas precisam existir: ``analisar_sql_leitura``
        recusa o que não for SELECT/WITH e produz a mensagem útil; o LOGIN
        somente leitura é quem de fato impede a escrita no servidor, mas
        devolveria um erro de driver que ninguém entende.
        """
        inicio = perf_counter()
        teto = max(1, min(10_000, int(limite)))

        analise = analisar_sql_leitura(sql)
        if not analise.permitido:
            return self._resultado_vazio(analise.motivo, inicio)

        # Consulta livre contra a produção do ERP fica registrada com o autor.
        logger.info("Consulta ao banco do Protheus por %s: %s", autor, self._resumir(sql))

        try:
            with self.conexao() as con:
                cur = con.cursor()
                # SET ROWCOUNT limita NO BANCO. Cortar depois de receber
                # significaria materializar milhões de linhas de uma SD1 na
                # memória do processo antes de jogar fora.
                cur.execute(f"SET ROWCOUNT {teto + 1}")
                cur.execute(sql)

                colunas = [d[0] for d in cur.description] if cur.description else []
                brutas = cur.fetchall()
                cur.execute("SET ROWCOUNT 0")

            truncado = len(brutas) > teto
            linhas = [
                {c: self._valor(v) for c, v in zip(colunas, linha, strict=True)}
                for linha in (brutas[:teto] if truncado else brutas)
            ]

            return {
                "ok": True,
                "colunas": colunas,
                "linhas": linhas,
                "totalLinhas": len(linhas),
                "truncado": truncado,
                "duracaoMs": self._ms(inicio),
                "erro": None,
            }
        except pyodbc.Error as erro:
            return self._resultado_vazio(self._explicar(str(erro)), inicio)
        except ApiError as erro:
            return self._resultado_vazio(erro.message, inicio)

    # -------------------------------------------------------------- produtos

    def tabela_produtos(self, empresa: str) -> str:
        """Nome físico da tabela de produtos, com a empresa validada.

        Padrão do Protheus: ``<alias><empresa>0``. Empresa 02 lê SB1020,
        empresa 09 lê SB1090 — atenção que o código é 09, e não 90.
        """
        limpo = empresa.strip()
        if not _EMPRESA.match(limpo):
            raise ApiError(
                400,
                f"Empresa invalida: {empresa!r}. Espero dois caracteres alfanumericos, "
                "como 02 ou 09.",
            )
        return f"SB1{limpo}0"

    # ----------------------------------------------------------------- apoio

    @staticmethod
    def _valor(bruto: Any) -> Any:
        """Valor do banco pronto para JSON.

        CHAR do Protheus vem com enchimento à direita; aparar aqui evita que
        todo consumidor tenha de aparar de novo. Campo só de espaços vira texto
        vazio — e não ``None``, porque vazio e nulo são coisas diferentes.
        """
        if isinstance(bruto, str):
            return bruto.rstrip()
        if isinstance(bruto, bytes | bytearray):
            return bruto.hex()
        return bruto

    @staticmethod
    def _ms(inicio: float) -> int:
        return int((perf_counter() - inicio) * 1000)

    def _resultado_vazio(self, erro: str | None, inicio: float) -> dict[str, Any]:
        return {
            "ok": False,
            "colunas": [],
            "linhas": [],
            "totalLinhas": 0,
            "truncado": False,
            "duracaoMs": self._ms(inicio),
            "erro": erro,
        }

    @staticmethod
    def _resumir(sql: str) -> str:
        """Uma linha do SQL para o log, sem despejar a consulta inteira."""
        linha = " ".join(sql.split())
        return f"{linha[:200]}..." if len(linha) > 200 else linha

    @staticmethod
    def _explicar(erro: str) -> str:
        """Traduz o erro do driver para o que a pessoa precisa fazer.

        ORDEM IMPORTA: o driver prefixa quase tudo, e a causa específica vem
        antes da genérica. "Login failed" e "host não resolve" pedem ações
        completamente diferentes, e o código ODBC cru não ajuda ninguém.
        """
        texto = erro.lower()

        if "nao esta configurada" in texto:
            return erro
        if "getaddrinfo" in texto:
            return "O nome do servidor nao foi resolvido. Confira o host, ou use o IP."
        if "login failed" in texto:
            return (
                "O servidor respondeu, mas recusou o login. Confira usuario e senha "
                "da credencial."
            )
        if "cannot open database" in texto:
            return (
                "O login foi aceito, mas o banco informado nao existe ou o login nao "
                "tem acesso a ele."
            )
        if "certificate" in texto or "ssl provider" in texto:
            return (
                'A conexao foi recusada pelo certificado do servidor. Ligue "Aceitar '
                'certificado nao verificado" se o SQL Server usa certificado autoassinado.'
            )
        if "timeout" in texto or "unable to complete login" in texto:
            return (
                "Nao houve resposta do servidor no tempo limite. Confira IP e porta, e se "
                "este servidor alcanca o banco pela rede — o banco do Protheus normalmente "
                "so responde na rede interna ou por VPN."
            )
        return f"Falha ao conectar: {erro.splitlines()[0].strip()}"
