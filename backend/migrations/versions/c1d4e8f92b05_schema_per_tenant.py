"""schema_per_tenant - make db_url nullable for schema-based companies

Revision ID: c1d4e8f92b05
Revises: b9c3e7f21a44
Create Date: 2026-06-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c1d4e8f92b05'
down_revision: Union[str, Sequence[str], None] = 'b9c3e7f21a44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Schema-per-tenant companies don't need a dedicated db_url
    op.alter_column(
        'companies', 'db_url',
        existing_type=sa.VARCHAR(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'companies', 'db_url',
        existing_type=sa.VARCHAR(),
        nullable=False,
    )
