-- 010_staff_attendance_salary.sql
-- Staff Attendance & Salary / Advance Management (Phase 5)

-- 1. Base salary column on workers
ALTER TABLE workers ADD COLUMN IF NOT EXISTS base_salary_paise int NOT NULL DEFAULT 0 CHECK (base_salary_paise >= 0);

-- 2. Worker daily attendance table
CREATE TABLE IF NOT EXISTS worker_attendance (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_id                   uuid NOT NULL,
  attendance_date             date NOT NULL,
  check_in_at                 timestamptz,
  check_out_at                timestamptz,
  status                      text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'half_day', 'on_leave')),
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, attendance_date),
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS worker_attendance_date_idx ON worker_attendance (shop_id, attendance_date);
CREATE INDEX IF NOT EXISTS worker_attendance_worker_idx ON worker_attendance (shop_id, worker_id, attendance_date);

ALTER TABLE worker_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_attendance FORCE ROW LEVEL SECURITY;

CREATE POLICY worker_attendance_tenant ON worker_attendance
  FOR ALL
  USING (shop_id = app_shop_id())
  WITH CHECK (shop_id = app_shop_id());

-- 3. Worker salary advances
CREATE TABLE IF NOT EXISTS worker_salary_advances (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_id                   uuid NOT NULL,
  amount_paise                int NOT NULL CHECK (amount_paise > 0),
  reason                      text NOT NULL,
  status                      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'deducted')),
  requested_at                timestamptz NOT NULL DEFAULT now(),
  approved_by                 uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at                 timestamptz,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS worker_salary_advances_worker_idx ON worker_salary_advances (shop_id, worker_id, status);

ALTER TABLE worker_salary_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_salary_advances FORCE ROW LEVEL SECURITY;

CREATE POLICY worker_salary_advances_tenant ON worker_salary_advances
  FOR ALL
  USING (shop_id = app_shop_id())
  WITH CHECK (shop_id = app_shop_id());

-- 4. Worker monthly salary settlements (Payroll sheets)
CREATE TABLE IF NOT EXISTS worker_salary_settlements (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_id                   uuid NOT NULL,
  period_month                int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year                 int NOT NULL CHECK (period_year >= 2020),
  base_salary_paise           int NOT NULL DEFAULT 0 CHECK (base_salary_paise >= 0),
  attendance_days_present     int NOT NULL DEFAULT 0 CHECK (attendance_days_present >= 0),
  attendance_days_half        int NOT NULL DEFAULT 0 CHECK (attendance_days_half >= 0),
  attendance_days_absent      int NOT NULL DEFAULT 0 CHECK (attendance_days_absent >= 0),
  attendance_days_leave       int NOT NULL DEFAULT 0 CHECK (attendance_days_leave >= 0),
  pro_rated_base_paise        int NOT NULL DEFAULT 0 CHECK (pro_rated_base_paise >= 0),
  commission_earned_paise     int NOT NULL DEFAULT 0 CHECK (commission_earned_paise >= 0),
  tip_earned_paise            int NOT NULL DEFAULT 0 CHECK (tip_earned_paise >= 0),
  advances_deducted_paise     int NOT NULL DEFAULT 0 CHECK (advances_deducted_paise >= 0),
  bonuses_paise               int NOT NULL DEFAULT 0 CHECK (bonuses_paise >= 0),
  net_payable_paise           int NOT NULL,
  payout_status               text NOT NULL DEFAULT 'draft' CHECK (payout_status IN ('draft', 'approved', 'paid')),
  paid_at                     timestamptz,
  expense_id                  uuid REFERENCES expenses(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, period_year, period_month),
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS worker_salary_settlements_idx ON worker_salary_settlements (shop_id, period_year, period_month);

ALTER TABLE worker_salary_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_salary_settlements FORCE ROW LEVEL SECURITY;

CREATE POLICY worker_salary_settlements_tenant ON worker_salary_settlements
  FOR ALL
  USING (shop_id = app_shop_id())
  WITH CHECK (shop_id = app_shop_id());
