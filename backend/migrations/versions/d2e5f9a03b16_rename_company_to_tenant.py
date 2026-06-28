"""rename_company_to_tenant - standardise naming from company to tenant

Revision ID: d2e5f9a03b16
Revises: c1d4e8f92b05
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd2e5f9a03b16'
down_revision: Union[str, Sequence[str], None] = 'c1d4e8f92b05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Rename tables ─────────────────────────────────────────────────────────
    op.rename_table('companies', 'tenants')
    op.rename_table('company_roles', 'tenant_roles')
    op.rename_table('sub_companies', 'sub_tenants')
    op.rename_table('user_sub_companies', 'user_sub_tenants')

    # ── Rename columns ────────────────────────────────────────────────────────
    op.alter_column('users', 'company_id',
                    new_column_name='tenant_id',
                    existing_type=sa.Integer(), existing_nullable=True)

    op.alter_column('module_permissions', 'company_id',
                    new_column_name='tenant_id',
                    existing_type=sa.Integer(), existing_nullable=True)

    op.alter_column('tenant_roles', 'company_id',
                    new_column_name='tenant_id',
                    existing_type=sa.Integer(), existing_nullable=True)

    op.alter_column('sub_tenants', 'company_id',
                    new_column_name='tenant_id',
                    existing_type=sa.Integer(), existing_nullable=False)


def downgrade() -> None:
    op.alter_column('sub_tenants', 'tenant_id',
                    new_column_name='company_id',
                    existing_type=sa.Integer(), existing_nullable=False)
    op.alter_column('tenant_roles', 'tenant_id',
                    new_column_name='company_id',
                    existing_type=sa.Integer(), existing_nullable=True)
    op.alter_column('module_permissions', 'tenant_id',
                    new_column_name='company_id',
                    existing_type=sa.Integer(), existing_nullable=True)
    op.alter_column('users', 'tenant_id',
                    new_column_name='company_id',
                    existing_type=sa.Integer(), existing_nullable=True)
    op.rename_table('user_sub_tenants', 'user_sub_companies')
    op.rename_table('sub_tenants', 'sub_companies')
    op.rename_table('tenant_roles', 'company_roles')
    op.rename_table('tenants', 'companies')
