"""Regressão da trava de somente-leitura do console de consulta.

OS MESMOS 23 CASOS do lado TypeScript, de propósito. Enquanto os dois backends
coexistirem, os dois precisam recusar exatamente o mesmo SQL — uma trava mais
frouxa de um lado é uma porta que ninguém sabe que está aberta.

OS CASOS LIMITE SÃO O PONTO: num banco Protheus, ``D_E_L_E_T_`` está em toda
consulta e ``A1_DELETE`` pode ser nome de campo. Uma trava que recuse esses
dois é inútil na prática e será desligada por quem precisa trabalhar.
"""

import pytest

from trigo_api.protheus_db.sql_guard import analisar_sql_leitura

DEVE_PASSAR = [
    ("SELECT * FROM SB1020", "consulta simples"),
    ("  select top 10 B1_COD from SB1090", "minusculas e espacos"),
    ("WITH x AS (SELECT 1 AS a) SELECT * FROM x", "CTE"),
    ("SELECT * FROM SB1020 WHERE D_E_L_E_T_ = ' '", "D_E_L_E_T_ em toda consulta Protheus"),
    ("SELECT A1_DELETE FROM SA1010", "DELETE dentro de nome de campo"),
    ("SELECT * FROM SB1020 WHERE B1_DESC LIKE '%DELETE%'", "palavra proibida em texto"),
    ("-- drop table SB1020\nSELECT 1", "palavra proibida em comentario de linha"),
    ("SELECT 1 /* update */", "comentario de bloco"),
]

DEVE_RECUSAR = [
    ("DELETE FROM SB1020", "exclusao"),
    ("UPDATE SB1020 SET B1_DESC = 'x'", "alteracao"),
    ("INSERT INTO SB1020 VALUES (1)", "inclusao"),
    ("DROP TABLE SB1020", "estrutura"),
    ("TRUNCATE TABLE SB1020", "estrutura"),
    ("ALTER TABLE SB1020 ADD X INT", "estrutura"),
    ("SELECT * INTO nova FROM SB1020", "SELECT INTO cria tabela"),
    ("EXEC sp_who", "procedure faz o que quiser por dentro"),
    ("SELECT 1; DROP TABLE SB1020", "segundo comando escondido"),
    ("SELECT 1; SELECT 2", "um comando por vez, mesmo sendo dois SELECT"),
    ("SET ROWCOUNT 10", "nao comeca com SELECT nem WITH"),
    ("WAITFOR DELAY '00:10:00'", "prende a conexao com o ERP"),
    ("DBCC CHECKDB", "age sobre o banco inteiro"),
    ("", "vazio"),
    ("-- so comentario", "so comentario"),
]


@pytest.mark.parametrize(("sql", "porque"), DEVE_PASSAR)
def test_permite(sql: str, porque: str) -> None:
    resultado = analisar_sql_leitura(sql)
    assert resultado.permitido is True, f"deveria permitir ({porque}): {resultado.motivo}"


@pytest.mark.parametrize(("sql", "porque"), DEVE_RECUSAR)
def test_recusa(sql: str, porque: str) -> None:
    resultado = analisar_sql_leitura(sql)
    assert resultado.permitido is False, f"deveria recusar ({porque})"
    assert resultado.motivo, "recusa sem motivo deixa a pessoa sem saber o que fazer"


def test_total_de_casos() -> None:
    """Fixa a contagem: caso removido sem querer não passa despercebido."""
    assert len(DEVE_PASSAR) + len(DEVE_RECUSAR) == 23
