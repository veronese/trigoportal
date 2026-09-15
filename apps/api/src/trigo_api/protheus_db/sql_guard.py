"""Trava de somente-leitura do console de consulta.

POR QUE EXISTE, se o login já deveria ser somente leitura: porque "deveria". O
login é configurado por uma pessoa, numa tela, e o dia em que alguém apontar o
portal para uma credencial com escrita, esta função é o que separa um erro de
digitação de um UPDATE sem WHERE no banco do ERP.

NÃO É UM PARSER DE SQL. É uma lista branca deliberadamente estreita: o que não
for reconhecido como consulta simples é recusado. Recusar uma consulta legítima
custa um aviso; deixar passar uma escrita custa o ERP.
"""

import re
from dataclasses import dataclass

#: Comandos que escrevem, alteram estrutura ou executam código.
#:
#: ``INTO`` está aqui porque ``SELECT ... INTO nova_tabela`` CRIA tabela —
#: parece consulta e não é. ``EXEC`` porque uma procedure faz o que quiser por
#: dentro, e nenhuma inspeção do texto alcança isso.
PROIBIDOS = (
    "INSERT", "UPDATE", "DELETE", "MERGE", "TRUNCATE", "DROP", "ALTER",
    "CREATE", "RENAME", "GRANT", "REVOKE", "DENY", "BACKUP", "RESTORE",
    "SHUTDOWN", "RECONFIGURE", "EXEC", "EXECUTE", "INTO", "BULK",
    "OPENROWSET", "OPENDATASOURCE", "OPENQUERY", "WAITFOR", "DBCC",
)

_PROCEDURE = (
    "Executar procedure nao e consulta: o que ela faz por dentro nao da para "
    "conferir aqui."
)

#: Explicação específica onde a genérica confundiria.
EXPLICACAO = {
    "INTO": "SELECT ... INTO cria uma tabela nova. Para materializar resultado, exporte o CSV.",
    "EXEC": _PROCEDURE,
    "EXECUTE": _PROCEDURE,
    "WAITFOR": "WAITFOR prende a conexao com o banco do ERP pelo tempo que mandar.",
    "DBCC": "Comandos DBCC agem sobre o banco inteiro, nao sobre uma consulta.",
}

_PRIMEIRA_PALAVRA = re.compile(r"^\s*\(*\s*([A-Za-z_]+)")


@dataclass(frozen=True)
class AnaliseSql:
    permitido: bool
    #: Por que foi recusada, em linguagem de quem escreveu a consulta.
    motivo: str | None
    #: O comando identificado no início. Útil para a mensagem.
    comando: str | None


def _limpar(sql: str) -> str:
    """Remove comentários, textos entre aspas e identificadores entre colchetes.

    Sem isso, uma consulta legítima com ``WHERE B1_DESC LIKE '%DELETE%'`` seria
    recusada, e ``-- drop table`` num comentário também. O texto limpo serve
    APENAS para a análise; o que vai para o banco continua sendo o original.
    """
    saida: list[str] = []
    i = 0
    n = len(sql)

    while i < n:
        atual = sql[i]
        proximo = sql[i + 1] if i + 1 < n else ""

        if atual == "-" and proximo == "-":
            while i < n and sql[i] != "\n":
                i += 1
            saida.append(" ")
            continue

        # Comentário de bloco. Não aninha em T-SQL padrão.
        if atual == "/" and proximo == "*":
            i += 2
            while i < n and not (sql[i] == "*" and i + 1 < n and sql[i + 1] == "/"):
                i += 1
            i += 2
            saida.append(" ")
            continue

        # Texto entre aspas simples. '' é uma aspa escapada, não o fim.
        if atual == "'":
            i += 1
            while i < n:
                if sql[i] == "'" and i + 1 < n and sql[i + 1] == "'":
                    i += 2
                    continue
                if sql[i] == "'":
                    i += 1
                    break
                i += 1
            saida.append(" '' ")
            continue

        # Identificador entre colchetes: [Tabela Com Espaco]
        if atual == "[":
            i += 1
            while i < n and sql[i] != "]":
                i += 1
            i += 1
            saida.append(" ident ")
            continue

        saida.append(atual)
        i += 1

    return "".join(saida)


def _varios_comandos(limpo: str) -> bool:
    """Um ``;`` que ainda tem comando depois: duas instruções numa chamada."""
    return len([p for p in limpo.split(";") if p.strip()]) > 1


def analisar_sql_leitura(sql: str) -> AnaliseSql:
    """Decide se a consulta pode ser executada.

    Aceita apenas o que começa com SELECT ou WITH (CTE). Qualquer outra coisa —
    inclusive um SET aparentemente inofensivo — é recusada, porque a lista do
    que é inofensivo nunca fica completa.
    """
    original = (sql or "").strip()
    if original == "":
        return AnaliseSql(False, "Escreva uma consulta.", None)

    limpo = _limpar(original).strip()
    if limpo == "":
        return AnaliseSql(False, "A consulta tem apenas comentarios.", None)

    if _varios_comandos(limpo):
        return AnaliseSql(
            False,
            "Execute um comando por vez. Varios comandos separados por ponto e virgula "
            "sao recusados, porque o segundo pode fazer algo diferente do primeiro.",
            None,
        )

    achado = _PRIMEIRA_PALAVRA.match(limpo)
    comando = achado.group(1).upper() if achado else None

    if comando not in ("SELECT", "WITH"):
        recebi = f"Recebi {comando}." if comando else ""
        return AnaliseSql(
            False,
            f"Este console executa apenas consulta. {recebi} Comece com SELECT ou WITH.",
            comando,
        )

    for proibido in PROIBIDOS:
        # \b em Python NÃO trata _ como limite de palavra, então D_E_L_E_T_ e
        # A1_DELETE não casam com \bDELETE\b — que é exatamente o que se quer
        # num banco Protheus, onde D_E_L_E_T_ está em toda consulta.
        if re.search(rf"\b{proibido}\b", limpo, re.IGNORECASE):
            return AnaliseSql(
                False,
                EXPLICACAO.get(
                    proibido,
                    f"A consulta contem {proibido}, que altera dados ou estrutura. "
                    "Este console so le.",
                ),
                comando,
            )

    return AnaliseSql(True, None, comando)
