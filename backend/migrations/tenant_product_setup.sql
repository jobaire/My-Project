BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    title      TEXT NOT NULL,
    message    TEXT,
    type       VARCHAR(32) DEFAULT 'info',
    is_read    BOOLEAN DEFAULT FALSE,
    link_to    TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_notif_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS routing_processes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    default_machine_type VARCHAR(100) NULL,
    default_skill_type VARCHAR(100) NULL,
    default_smv_minutes DOUBLE PRECISION NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    style_code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    category VARCHAR(100) NULL,
    buyer_name VARCHAR(255) NULL,
    garment_type VARCHAR(100) NULL,
    base_uom VARCHAR(20) NOT NULL DEFAULT 'pcs',
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    customer_group VARCHAR(255) NULL,
    description TEXT NULL,
    delivery_location VARCHAR(255) NULL,
    plan_colour VARCHAR(7) NULL,
    late_tolerance INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL
);

CREATE INDEX IF NOT EXISTS ix_brands_customer_id ON brands (customer_id);

CREATE TABLE IF NOT EXISTS product_versions (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    version_no VARCHAR(50) NOT NULL,
    version_name VARCHAR(255) NOT NULL,
    notes TEXT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_product_versions_product_version UNIQUE (product_id, version_no)
);

CREATE TABLE IF NOT EXISTS product_version_routing_steps (
    id SERIAL PRIMARY KEY,
    product_version_id INTEGER NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
    routing_process_id INTEGER NOT NULL REFERENCES routing_processes(id),
    sequence_no INTEGER NOT NULL CHECK (sequence_no >= 1),
    work_content TEXT NOT NULL,
    machine_type VARCHAR(100) NULL,
    skill_type VARCHAR(100) NULL,
    smv_minutes DOUBLE PRECISION NULL,
    CONSTRAINT uq_product_version_routing_step_sequence UNIQUE (product_version_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS ix_routing_processes_code
    ON routing_processes (code);

CREATE INDEX IF NOT EXISTS ix_products_style_code
    ON products (style_code);

CREATE INDEX IF NOT EXISTS ix_customers_name
    ON customers (name);

CREATE INDEX IF NOT EXISTS ix_product_versions_product_id
    ON product_versions (product_id);

CREATE INDEX IF NOT EXISTS ix_product_version_routing_steps_product_version_id
    ON product_version_routing_steps (product_version_id);

CREATE INDEX IF NOT EXISTS ix_product_version_routing_steps_routing_process_id
    ON product_version_routing_steps (routing_process_id);

-- Idempotent column additions for databases provisioned before this schema version
ALTER TABLE customers ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS delivery_location VARCHAR(255) NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS plan_colour VARCHAR(7) NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS late_tolerance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_group VARCHAR(255) NULL;

CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL
);
CREATE INDEX IF NOT EXISTS ix_brands_customer_id ON brands (customer_id);

-- Products: new simplified columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(100) NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_family VARCHAR(100) NULL;
ALTER TABLE products ALTER COLUMN style_code DROP NOT NULL;
ALTER TABLE products ALTER COLUMN base_uom SET DEFAULT 'pcs';

CREATE TABLE IF NOT EXISTS product_routing_steps (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL DEFAULT 1,
    process_name VARCHAR(255) NOT NULL,
    unit_of_measurement VARCHAR(100) NULL,
    work_content TEXT NULL
);
CREATE INDEX IF NOT EXISTS ix_product_routing_steps_product_id ON product_routing_steps (product_id);
ALTER TABLE product_routing_steps ADD COLUMN IF NOT EXISTS work_content TEXT NULL;

-- Processes master data (setup)
CREATE TABLE IF NOT EXISTS processes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50) NULL,
    external_reference VARCHAR(100) NULL,
    sequence INTEGER NOT NULL DEFAULT 0,
    work_content_unit VARCHAR(50) NULL,
    planned BOOLEAN NOT NULL DEFAULT FALSE,
    update_by_size BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS ix_processes_sequence ON processes (sequence, name);

-- Style versions with independent routing
CREATE TABLE IF NOT EXISTS style_versions (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL
);
CREATE INDEX IF NOT EXISTS ix_style_versions_product_id ON style_versions (product_id);

CREATE TABLE IF NOT EXISTS style_version_steps (
    id SERIAL PRIMARY KEY,
    version_id INTEGER NOT NULL REFERENCES style_versions(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL DEFAULT 1,
    process_name VARCHAR(255) NOT NULL,
    unit_of_measurement VARCHAR(100) NULL,
    work_content TEXT NULL
);
CREATE INDEX IF NOT EXISTS ix_style_version_steps_version_id ON style_version_steps (version_id);

CREATE TABLE IF NOT EXISTS audit_log (
    id          SERIAL PRIMARY KEY,
    table_name  TEXT NOT NULL,
    record_id   INTEGER,
    action      TEXT NOT NULL,
    actor_email TEXT,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    old_data    JSONB,
    new_data    JSONB
);
CREATE INDEX IF NOT EXISTS ix_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_changed_at ON audit_log (changed_at DESC);

COMMIT;
