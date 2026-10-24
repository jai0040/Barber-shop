-- Phase 8, 9, 10: Products, Inventory, Billing, Invoicing, Payments, Income, Expenses

-- Product categories
CREATE TABLE product_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  display_order int NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name),
  UNIQUE (id, shop_id)
);
CREATE INDEX product_categories_shop_idx ON product_categories (shop_id);

-- Products
CREATE TABLE products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category_id         uuid REFERENCES product_categories(id, shop_id) ON DELETE SET NULL,
  name                text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  sku                 text NOT NULL CHECK (length(trim(sku)) BETWEEN 2 AND 50),
  selling_price_paise int NOT NULL CHECK (selling_price_paise >= 0),
  cost_price_paise    int NOT NULL DEFAULT 0 CHECK (cost_price_paise >= 0),
  stock_quantity      int NOT NULL DEFAULT 0,
  low_stock_threshold int NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  supplier_name       text,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, sku),
  UNIQUE (id, shop_id)
);
CREATE INDEX products_shop_sku_idx ON products (shop_id, sku);
CREATE INDEX products_stock_idx ON products (shop_id, stock_quantity);

-- Inventory transactions (Stock movements)
CREATE TABLE inventory_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL,
  type            text NOT NULL CHECK (type IN ('purchase', 'sale', 'damage', 'wastage', 'adjustment')),
  quantity_delta  int NOT NULL,
  balance_after   int NOT NULL,
  unit_cost_paise int NOT NULL DEFAULT 0 CHECK (unit_cost_paise >= 0),
  reference_id    text,
  notes           text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, shop_id) REFERENCES products(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX inventory_transactions_shop_product_idx ON inventory_transactions (shop_id, product_id, created_at DESC);

-- Sequence for invoice numbering per shop
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

-- Invoices
CREATE TABLE invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  invoice_number    text NOT NULL,
  appointment_id    uuid,
  customer_id       uuid,
  worker_id         uuid,
  subtotal_paise    int NOT NULL CHECK (subtotal_paise >= 0),
  discount_paise    int NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  final_total_paise int NOT NULL CHECK (final_total_paise >= 0),
  payment_status    text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'void')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, invoice_number),
  UNIQUE (id, shop_id),
  FOREIGN KEY (appointment_id, shop_id) REFERENCES appointments(id, shop_id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id, shop_id) REFERENCES customers(id, shop_id) ON DELETE SET NULL,
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE SET NULL,
  CONSTRAINT invoices_total_chk CHECK (final_total_paise = GREATEST(0, subtotal_paise - discount_paise))
);
CREATE INDEX invoices_shop_date_idx ON invoices (shop_id, created_at DESC);
CREATE INDEX invoices_payment_status_idx ON invoices (shop_id, payment_status);

-- Invoice line items
CREATE TABLE invoice_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  invoice_id       uuid NOT NULL,
  type             text NOT NULL CHECK (type IN ('service', 'product')),
  item_id          uuid,
  item_name        text NOT NULL,
  quantity         int NOT NULL CHECK (quantity >= 1),
  unit_price_paise int NOT NULL CHECK (unit_price_paise >= 0),
  total_paise      int NOT NULL CHECK (total_paise >= 0),
  FOREIGN KEY (invoice_id, shop_id) REFERENCES invoices(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX invoice_items_shop_invoice_idx ON invoice_items (shop_id, invoice_id);

-- Payments
CREATE TABLE payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  invoice_id            uuid NOT NULL,
  method                text NOT NULL CHECK (method IN ('cash', 'upi_qr')),
  amount_paise          int NOT NULL CHECK (amount_paise > 0),
  status                text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  transaction_reference text,
  recorded_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (invoice_id, shop_id) REFERENCES invoices(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX payments_shop_invoice_idx ON payments (shop_id, invoice_id);

-- Expense Categories
CREATE TABLE expense_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name),
  UNIQUE (id, shop_id)
);
CREATE INDEX expense_categories_shop_idx ON expense_categories (shop_id);

-- Expenses
CREATE TABLE expenses (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                  uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category_id              uuid NOT NULL,
  amount_paise             int NOT NULL CHECK (amount_paise > 0),
  date                     date NOT NULL DEFAULT CURRENT_DATE,
  description              text NOT NULL CHECK (length(trim(description)) >= 2),
  payment_method           text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'online', 'bank_transfer')),
  inventory_transaction_id uuid REFERENCES inventory_transactions(id) ON DELETE SET NULL,
  created_by               uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (category_id, shop_id) REFERENCES expense_categories(id, shop_id) ON DELETE RESTRICT
);
CREATE INDEX expenses_shop_date_idx ON expenses (shop_id, date DESC);
CREATE INDEX expenses_category_idx ON expenses (shop_id, category_id);

-- Row Level Security
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'product_categories','products','inventory_transactions','invoices',
    'invoice_items','payments','expense_categories','expenses'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform())$p$, t);
  END LOOP;
END $$;

-- Public read for products (view-only on customer website)
CREATE POLICY public_read ON product_categories FOR SELECT
  USING (app_is_public() AND is_active AND EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.status = 'active'));

CREATE POLICY public_read ON products FOR SELECT
  USING (app_is_public() AND status = 'active' AND EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.status = 'active'));
