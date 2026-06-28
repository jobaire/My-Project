-- Performance indexes for paginated queries and frequent lookups
-- Run once on each tenant database

BEGIN;

-- customers: primary sort column + search column
CREATE INDEX IF NOT EXISTS ix_customers_name        ON customers (name);
CREATE INDEX IF NOT EXISTS ix_customers_name_lower  ON customers (LOWER(name));
CREATE INDEX IF NOT EXISTS ix_customers_group_lower ON customers (LOWER(customer_group));

-- products: primary sort + FK lookups + search
CREATE INDEX IF NOT EXISTS ix_products_name         ON products (name);
CREATE INDEX IF NOT EXISTS ix_products_name_lower   ON products (LOWER(name));
CREATE INDEX IF NOT EXISTS ix_products_sku_lower    ON products (LOWER(sku)) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_products_customer_id  ON products (customer_id);
CREATE INDEX IF NOT EXISTS ix_products_brand_id     ON products (brand_id);
CREATE INDEX IF NOT EXISTS ix_products_category_id  ON products (category_id);

-- processes: sorted by sequence then name
CREATE INDEX IF NOT EXISTS ix_processes_seq_name    ON processes (sequence, name);

-- style categories / sub-categories
CREATE INDEX IF NOT EXISTS ix_style_sub_cats_cat_id ON style_sub_categories (category_id);

-- versions / steps (used in inner queries per product)
CREATE INDEX IF NOT EXISTS ix_style_versions_product_id     ON style_versions (product_id);
CREATE INDEX IF NOT EXISTS ix_style_version_steps_version_id ON style_version_steps (version_id);

-- order_schedule: composite index for date-range queries scoped to a line
CREATE INDEX IF NOT EXISTS ix_order_schedule_line_dates
  ON order_schedule(line_id, planned_start, planned_end);

COMMIT;
