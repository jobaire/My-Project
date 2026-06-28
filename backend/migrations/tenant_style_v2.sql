BEGIN;

-- Products: department column (idempotent — added here because it was missing from initial setup)
ALTER TABLE products ADD COLUMN IF NOT EXISTS department VARCHAR(255) NULL;

-- Style category setup
CREATE TABLE IF NOT EXISTS style_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS style_sub_categories (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES style_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    UNIQUE(category_id, name)
);

-- Color / Size setup
CREATE TABLE IF NOT EXISTS colors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sizes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    sequence INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS size_sets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS size_set_members (
    size_set_id INTEGER NOT NULL REFERENCES size_sets(id) ON DELETE CASCADE,
    size_id INTEGER NOT NULL REFERENCES sizes(id) ON DELETE CASCADE,
    PRIMARY KEY (size_set_id, size_id)
);

-- Products: additional FK columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(100) NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER NULL REFERENCES style_categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category_id INTEGER NULL REFERENCES style_sub_categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS customer_id INTEGER NULL REFERENCES customers(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id INTEGER NULL REFERENCES brands(id);

-- Color-Size matrix per product
CREATE TABLE IF NOT EXISTS product_color_sizes (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color_id INTEGER NOT NULL REFERENCES colors(id),
    size_id INTEGER NOT NULL REFERENCES sizes(id),
    UNIQUE(product_id, color_id, size_id)
);

CREATE INDEX IF NOT EXISTS ix_product_color_sizes_product_id ON product_color_sizes(product_id);

COMMIT;
