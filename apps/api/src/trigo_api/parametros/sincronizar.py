"""Sincroniza a tabela de parâmetros com o catálogo.

IDEMPOTENTE, e isso não é detalhe: esta rotina roda em ambiente com dado real,
e rodá-la de novo não pode custar configuração. Ela cria o que falta, atualiza
os METADADOS (rótulo, descrição, grupo, tipo, padrão) e **nunca** toca no valor
customizado.

A poda existe pelo mesmo motivo que o catálogo: se a fonte de verdade é o
código, linha órfã no banco aparece na tela do Configurador sem ninguém a
consumir — e quem a vê não tem como saber que ela não faz nada.
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from trigo_api.db import Parameter
from trigo_api.parametros.catalogo import CATALOGO

logger = logging.getLogger(__name__)


@dataclass
class ResultadoSincronizacao:
    criados: list[str] = field(default_factory=list)
    atualizados: list[str] = field(default_factory=list)
    removidos: list[str] = field(default_factory=list)
    #: Parâmetros que existem no banco com valor customizado e saíram do
    #: catálogo. NÃO são removidos automaticamente — ver `podar`.
    orfaos_com_valor: list[str] = field(default_factory=list)


def sincronizar(
    sessao: Session, *, podar: bool = True, autor: str = "sincronizacao"
) -> ResultadoSincronizacao:
    """Aplica o catálogo ao banco.

    :param podar: remove do banco o que saiu do catálogo. Parâmetro órfão que
        AINDA TEM VALOR customizado nunca é removido em silêncio — ele é
        relatado, e apagá-lo é decisão de quem lê o relatório. Apagar um valor
        que alguém configurou porque o código mudou de ideia é perda de dado.
    """
    resultado = ResultadoSincronizacao()
    agora = datetime.now(UTC)

    for definicao in CATALOGO:
        linha = sessao.get(Parameter, definicao.key)

        if linha is None:
            sessao.add(
                Parameter(
                    key=definicao.key,
                    label=definicao.label,
                    description=definicao.description,
                    group_name=definicao.group,
                    value_type=definicao.type,
                    value=None,
                    default_value=definicao.default_value,
                    is_secret=definicao.is_secret,
                    updated_by=autor,
                    updated_at=agora,
                    created_at=agora,
                )
            )
            resultado.criados.append(definicao.key)
            continue

        mudou = (
            linha.label != definicao.label
            or linha.description != definicao.description
            or linha.group_name != definicao.group
            or linha.value_type != definicao.type
            or linha.default_value != definicao.default_value
            or linha.is_secret != definicao.is_secret
        )
        if not mudou:
            continue

        # O `value` NÃO entra aqui. É o que separa "atualizar o catálogo" de
        # "resetar a configuração do cliente".
        linha.label = definicao.label
        linha.description = definicao.description
        linha.group_name = definicao.group
        linha.value_type = definicao.type
        linha.default_value = definicao.default_value
        linha.is_secret = definicao.is_secret
        linha.updated_at = agora
        resultado.atualizados.append(definicao.key)

    conhecidas = {d.key for d in CATALOGO}
    for linha in sessao.scalars(select(Parameter)):
        if linha.key in conhecidas:
            continue
        if linha.value:
            resultado.orfaos_com_valor.append(linha.key)
            continue
        if podar:
            sessao.delete(linha)
            resultado.removidos.append(linha.key)

    sessao.commit()

    logger.info(
        "Parametros: %s criado(s), %s atualizado(s), %s removido(s).",
        len(resultado.criados),
        len(resultado.atualizados),
        len(resultado.removidos),
    )
    for chave in resultado.orfaos_com_valor:
        logger.warning(
            "O parametro %s saiu do catalogo mas TEM valor configurado. Nao foi "
            "removido: apague manualmente se ele nao serve mais.",
            chave,
        )

    return resultado
