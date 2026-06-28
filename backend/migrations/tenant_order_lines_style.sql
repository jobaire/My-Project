-- Move style/version/category/sub-category to line level — idempotent
ALTER TABLE order_lines
    ADD COLUMN IF NOT EXISTS product_id      INTEGER NULL REFERENCES products(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS version_id      INTEGER NULL REFERENCES style_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS category_id     INTEGER NULL REFERENCES style_categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sub_category_id INTEGER NULL REFERENCES style_sub_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_order_lines_product_id ON order_lines(product_id);
CREATE INDEX IF NOT EXISTS ix_order_lines_version_id ON order_lines(version_id);
