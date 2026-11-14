-- 014_platform_rls_policies.sql
-- Ensure platform-level operations and seeder scripts can manage all Phase 3-7 tables

DO $$
BEGIN
  -- 1. Commission & Payroll tables
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'worker_commission_ledger') THEN
    DROP POLICY IF EXISTS worker_commission_ledger_tenant ON worker_commission_ledger;
    CREATE POLICY worker_commission_ledger_tenant ON worker_commission_ledger
      FOR ALL
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'worker_payouts') THEN
    DROP POLICY IF EXISTS worker_payouts_tenant ON worker_payouts;
    CREATE POLICY worker_payouts_tenant ON worker_payouts
      FOR ALL
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform());
  END IF;

  -- 2. Coupons & Offers tables
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'coupons') THEN
    DROP POLICY IF EXISTS coupons_tenant ON coupons;
    CREATE POLICY coupons_tenant ON coupons
      FOR ALL
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'coupon_redemptions') THEN
    DROP POLICY IF EXISTS coupon_redemptions_tenant ON coupon_redemptions;
    CREATE POLICY coupon_redemptions_tenant ON coupon_redemptions
      FOR ALL
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform());
  END IF;

  -- 3. Worker Attendance & Salary tables
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'worker_attendance') THEN
    DROP POLICY IF EXISTS worker_attendance_tenant ON worker_attendance;
    CREATE POLICY worker_attendance_tenant ON worker_attendance
      FOR ALL
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'worker_salary_advances') THEN
    DROP POLICY IF EXISTS worker_salary_advances_tenant ON worker_salary_advances;
    CREATE POLICY worker_salary_advances_tenant ON worker_salary_advances
      FOR ALL
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'worker_salary_settlements') THEN
    DROP POLICY IF EXISTS worker_salary_settlements_tenant ON worker_salary_settlements;
    CREATE POLICY worker_salary_settlements_tenant ON worker_salary_settlements
      FOR ALL
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform());
  END IF;

  -- 4. Reviews table
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'reviews') THEN
    DROP POLICY IF EXISTS reviews_tenant ON reviews;
    CREATE POLICY reviews_tenant ON reviews
      FOR ALL
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform());
  END IF;

  -- 5. Notifications table
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'notifications') THEN
    DROP POLICY IF EXISTS notifications_tenant_isolation ON notifications;
    CREATE POLICY notifications_tenant_isolation ON notifications
      FOR ALL
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform());
  END IF;
END $$;
