"""email_integration - nullable hashed_password and password_reset_tokens table

Revision ID: b9c3e7f21a44
Revises: a3f812c90d11
Create Date: 2026-06-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b9c3e7f21a44'
down_revision: Union[str, Sequence[str], None] = 'a3f812c90d11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make hashed_password nullable so invite-flow users exist before setting a password
    op.alter_column(
        'users', 'hashed_password',
        existing_type=sa.VARCHAR(),
        nullable=True,
    )

    # Token store for password reset and invite links
    op.create_table(
        'password_reset_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('purpose', sa.String(length=16), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token'),
    )
    op.create_index('ix_prt_token', 'password_reset_tokens', ['token'])
    op.create_index('ix_prt_user_id', 'password_reset_tokens', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_prt_user_id', table_name='password_reset_tokens')
    op.drop_index('ix_prt_token', table_name='password_reset_tokens')
    op.drop_table('password_reset_tokens')
    op.alter_column(
        'users', 'hashed_password',
        existing_type=sa.VARCHAR(),
        nullable=False,
    )
