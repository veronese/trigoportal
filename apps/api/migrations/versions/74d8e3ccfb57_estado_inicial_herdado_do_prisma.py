"""estado inicial, herdado do Prisma

Revision ID: 74d8e3ccfb57
Revises: 
Create Date: 2026-09-15 15:45:58.099618

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '74d8e3ccfb57'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Marco zero. NÃO altera nada, de propósito.

    As tabelas do portal já existiam quando esta revisão foi criada: foram
    feitas pelo Prisma, no backend Node. Esta revisão só registra "o banco está
    neste ponto", e é aplicada com ``alembic stamp head`` em vez de
    ``alembic upgrade`` — em banco que já tem as tabelas, tentar criá-las de
    novo falha, e em banco vazio a primeira revisão de verdade as cria.

    QUE ELA TENHA NASCIDO VAZIA É O RESULTADO ÚTIL: o autogenerate comparou os
    modelos SQLAlchemy com o banco real e não achou diferença. Antes disso ele
    apontou quatro índices que os modelos não declaravam — incluindo o unique
    parcial de provider/external_id — e teria APAGADO os quatro.
    """


def downgrade() -> None:
    """Não há para onde voltar: este é o começo da história."""
