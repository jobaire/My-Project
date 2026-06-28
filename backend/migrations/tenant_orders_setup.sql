BEGIN;

-- Unit of Measure lookup table
CREATE TABLE IF NOT EXISTS uom (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(50) NOT NULL UNIQUE,
    abbreviation VARCHAR(10) NULL
);

-- Seasons lookup table
CREATE TABLE IF NOT EXISTS seasons (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    year INTEGER NULL,
    UNIQUE(name, year)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    status          VARCHAR(50) NOT NULL DEFAULT 'Forecast',
    description     TEXT,
    customer_po     VARCHAR(100),
    customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    brand_id        INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,
    version_id      INTEGER REFERENCES style_versions(id) ON DELETE SET NULL,
    category_id     INTEGER REFERENCES style_categories(id) ON DELETE SET NULL,
    sub_category_id INTEGER REFERENCES style_sub_categories(id) ON DELETE SET NULL,
    season_id       INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
    parent_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    sub_company_id  INTEGER,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

-- Order lines (one per colour/delivery batch)
CREATE TABLE IF NOT EXISTS order_lines (
    id            SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    line_number   INTEGER NOT NULL DEFAULT 1,
    color_id      INTEGER REFERENCES colors(id) ON DELETE SET NULL,
    ratio         DECIMAL(10,4),
    delivery_qty  INTEGER,
    delivery_date DATE,
    uom_id        INTEGER REFERENCES uom(id) ON DELETE SET NULL,
    selling_price DECIMAL(15,4),
    selling_cost  DECIMAL(15,4),
    currency      VARCHAR(10) DEFAULT 'USD'
);

-- Junction table: sizes per order line
CREATE TABLE IF NOT EXISTS order_line_sizes (
    line_id INTEGER NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
    size_id INTEGER NOT NULL REFERENCES sizes(id) ON DELETE CASCADE,
    PRIMARY KEY (line_id, size_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_orders_status      ON orders(status);
CREATE INDEX IF NOT EXISTS ix_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS ix_orders_created_at  ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_order_lines_order_id ON order_lines(order_id);

COMMIT;
