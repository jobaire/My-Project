-- Master database initialization
-- Safe to run on every startup (CREATE TABLE IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS tenants (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR UNIQUE NOT NULL,
    db_url        VARCHAR,
    schema_name   VARCHAR UNIQUE,
    contact_email VARCHAR,
    address       VARCHAR,
    phone         VARCHAR,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    plan          VARCHAR,
    trial_ends_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR UNIQUE,
    email           VARCHAR UNIQUE NOT NULL,
    hashed_password VARCHAR,
    full_name       VARCHAR,
    role            VARCHAR,
    department      VARCHAR,
    designation     VARCHAR,
    avatar          VARCHAR,
    tenant_id       INTEGER REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role    VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS module_permissions (
    id         SERIAL PRIMARY KEY,
    role       VARCHAR NOT NULL,
    module     VARCHAR NOT NULL,
    can_read   BOOLEAN NOT NULL DEFAULT false,
    can_write  BOOLEAN NOT NULL DEFAULT false,
    can_delete BOOLEAN NOT NULL DEFAULT false,
    tenant_id  INTEGER
);

CREATE TABLE IF NOT EXISTS user_sub_tenants (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sub_tenant_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR UNIQUE NOT NULL,
    purpose    VARCHAR NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);
