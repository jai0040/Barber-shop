import { Pool } from 'pg';
import { loadConfig } from './config';
import { hashPassword } from './auth/auth.service';

const port = Number(process.env.DB_PORT || 5432);
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL = process.env.DATABASE_URL || `postgresql://barber_app:apppw@localhost:${port}/postgres`;
process.env.MIGRATION_DATABASE_URL = process.env.MIGRATION_DATABASE_URL || `postgresql://postgres:pw@localhost:${port}/postgres`;
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret-32-chars-minimum-key!!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-32-chars-minimum-key!!';

async function seed() {
  const cfg = loadConfig();
  const pool = new Pool({ connectionString: cfg.MIGRATION_DATABASE_URL });

  try {
    console.log('Seeding realistic demo data for "Classic Barber Shop"...');

    // 1. Create or get "Classic Barber Shop"
    let shop = (await pool.query(`SELECT id, slug FROM shops WHERE slug = 'classic-barber'`)).rows[0];
    if (!shop) {
      shop = (await pool.query(
        `INSERT INTO shops (name, slug, phone, email, address, city, state, country, timezone, status)
         VALUES ('Classic Barber Shop', 'classic-barber', '+919876543210', 'contact@classicbarber.com',
                 'Shop 14, MG Road, Indiranagar', 'Bengaluru', 'Karnataka', 'India', 'Asia/Kolkata', 'active')
         RETURNING id, slug`
      )).rows[0];
    }
    const shopId = shop.id;

    // Set business hours for all 7 days (Mon-Sat 10:00-21:00, Sun 10:00-18:00)
    await pool.query(`DELETE FROM shop_hours WHERE shop_id = $1`, [shopId]);
    for (let day = 1; day <= 7; day++) {
      const closeTime = day === 7 ? '18:00' : '21:00';
      await pool.query(
        `INSERT INTO shop_hours (shop_id, weekday, is_closed, open_time, close_time)
         VALUES ($1, $2, false, '10:00'::time, $3::time)`,
        [shopId, day, closeTime]
      );
    }

    // 2. Roles
    const roles = (await pool.query(`SELECT id, system_key FROM roles WHERE shop_id = $1`, [shopId])).rows;
    let ownerRoleId = roles.find((r) => r.system_key === 'owner')?.id;
    let workerRoleId = roles.find((r) => r.system_key === 'worker')?.id;

    if (!ownerRoleId) {
      const r = (await pool.query(`INSERT INTO roles (shop_id, name, is_system, system_key) VALUES ($1, 'Owner', true, 'owner') RETURNING id`, [shopId])).rows[0];
      ownerRoleId = r.id;
    }
    if (!workerRoleId) {
      const r = (await pool.query(`INSERT INTO roles (shop_id, name, is_system, system_key) VALUES ($1, 'Worker', true, 'worker') RETURNING id`, [shopId])).rows[0];
      workerRoleId = r.id;
    }

    // 3. Shop Owner User
    const ownerEmail = 'owner@classicbarber.com';
    let ownerUser = (await pool.query(`SELECT id FROM users WHERE email = $1`, [ownerEmail])).rows[0];
    if (!ownerUser) {
      const hash = await hashPassword('ClassicOwner#123');
      ownerUser = (await pool.query(
        `INSERT INTO users (type, name, phone, email, password_hash, shop_id, status)
         VALUES ('staff', 'Vikram Malhotra', '+919876500001', $1, $2, $3, 'active') RETURNING id`,
        [ownerEmail, hash, shopId]
      )).rows[0];
      await pool.query(`INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [ownerUser.id, shopId, ownerRoleId]);
    }

    // 4. Categories & Services
    let cat = (await pool.query(`SELECT id FROM service_categories WHERE shop_id = $1 AND lower(name) = lower('Grooming Services')`, [shopId])).rows[0];
    if (!cat) {
      cat = (await pool.query(
        `INSERT INTO service_categories (shop_id, name, display_order)
         VALUES ($1, 'Grooming Services', 1) RETURNING id`,
        [shopId]
      )).rows[0];
    }

    const demoServices = [
      { name: 'Haircut', price: 30000, duration: 30, desc: 'Precision styling, wash and finish' },
      { name: 'Beard Trim', price: 15000, duration: 20, desc: 'Beard shaping, razor edge, and hot towel' },
      { name: 'Hair + Beard', price: 40000, duration: 45, desc: 'Combo service haircut and beard grooming' },
      { name: 'Hair Spa', price: 60000, duration: 60, desc: 'Deep conditioning, head massage and steam treatment' },
    ];

    const serviceMap = new Map<string, string>();
    for (const s of demoServices) {
      let sRow = (await pool.query(`SELECT id FROM services WHERE shop_id = $1 AND lower(name) = lower($2)`, [shopId, s.name])).rows[0];
      if (!sRow) {
        sRow = (await pool.query(
          `INSERT INTO services (shop_id, category_id, name, description, price_paise, duration_minutes)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [shopId, cat.id, s.name, s.desc, s.price, s.duration]
        )).rows[0];
      }
      serviceMap.set(s.name, sRow.id);
    }

    // 5. Workers: Rahul, Amit, Raj
    const demoWorkers = [
      { name: 'Rahul', phone: '+919876500101', email: 'rahul@classicbarber.com', services: ['Haircut', 'Beard Trim', 'Hair + Beard'], comm: 40, pComm: 10 },
      { name: 'Amit', phone: '+919876500102', email: 'amit@classicbarber.com', services: ['Haircut', 'Beard Trim', 'Hair + Beard', 'Hair Spa'], comm: 40, pComm: 10 },
      { name: 'Raj', phone: '+919876500103', email: 'raj@classicbarber.com', services: ['Haircut', 'Hair Spa'], comm: 35, pComm: 10 },
    ];

    for (const w of demoWorkers) {
      let workerUser = (await pool.query(`SELECT id FROM users WHERE email = $1`, [w.email])).rows[0];
      if (!workerUser) {
        const hash = await hashPassword('WorkerPass#123');
        workerUser = (await pool.query(
          `INSERT INTO users (type, name, phone, email, password_hash, shop_id, status)
           VALUES ('staff', $1, $2, $3, $4, $5, 'active') RETURNING id`,
          [w.name, w.phone, w.email, hash, shopId]
        )).rows[0];
        await pool.query(`INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [workerUser.id, shopId, workerRoleId]);
      }

      let workerRec = (await pool.query(`SELECT id FROM workers WHERE shop_id = $1 AND user_id = $2`, [shopId, workerUser.id])).rows[0];
      if (!workerRec) {
        workerRec = (await pool.query(
          `INSERT INTO workers (shop_id, user_id, display_name, phone, commission_rate_percent, product_commission_rate_percent) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [shopId, workerUser.id, w.name, w.phone, w.comm, w.pComm]
        )).rows[0];
      } else {
        await pool.query(
          `UPDATE workers SET commission_rate_percent = $1, product_commission_rate_percent = $2 WHERE id = $3`,
          [w.comm, w.pComm, workerRec.id]
        );
      }
      const wid = workerRec.id;

      // Map services
      for (const sName of w.services) {
        const sid = serviceMap.get(sName);
        if (sid) {
          await pool.query(`INSERT INTO worker_services (shop_id, worker_id, service_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [shopId, wid, sid]);
        }
      }

      // Schedule: Mon-Sat 10:00-20:00
      for (let day = 1; day <= 7; day++) {
        await pool.query(
          `INSERT INTO worker_schedules (shop_id, worker_id, weekday, is_working, start_time, end_time)
           VALUES ($1, $2, $3, true, '10:00'::time, '20:00'::time)
           ON CONFLICT (worker_id, weekday) DO NOTHING`,
          [shopId, wid, day]
        );
      }
    }

    // 6. Products: Beard Oil, Hair Wax, Shampoo
    const prodCat = (await pool.query(
      `INSERT INTO product_categories (shop_id, name, display_order)
       VALUES ($1, 'Hair & Beard Care', 1) ON CONFLICT (shop_id, name) DO UPDATE SET display_order = 1 RETURNING id`,
      [shopId]
    )).rows[0];

    const demoProducts = [
      { name: 'Beard Oil', sku: 'BO-001', selling: 45000, cost: 28000, stock: 20, threshold: 5 },
      { name: 'Hair Wax', sku: 'HW-002', selling: 25000, cost: 15000, stock: 15, threshold: 4 },
      { name: 'Shampoo', sku: 'SH-003', selling: 35000, cost: 20000, stock: 3, threshold: 5 }, // Low stock item
    ];

    for (const p of demoProducts) {
      await pool.query(
        `INSERT INTO products (shop_id, category_id, name, sku, selling_price_paise, cost_price_paise, stock_quantity, low_stock_threshold)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (shop_id, sku) DO NOTHING`,
        [shopId, prodCat.id, p.name, p.sku, p.selling, p.cost, p.stock, p.threshold]
      );
    }

    // 7. Customers & Sample Appointments
    const demoCustomers = [
      { name: 'Jayant Patel', phone: '+919876599001', email: 'jayant@example.com', notes: 'Prefers short haircut, zero fade' },
      { name: 'Rohit Sharma', phone: '+919876599002', email: 'rohit@example.com', notes: 'Classic beard styling, needs hot towel' },
      { name: 'Suresh Raina', phone: '+919876599003', email: 'suresh@example.com', notes: 'Prefers Hair Spa on weekends' },
      { name: 'Virat Kohli',  phone: '+919876599004', email: 'virat@example.com',  notes: 'Sharp edges and beard lineup' },
    ];

    const customerIds: Record<string, string> = {};
    for (const c of demoCustomers) {
      let custRow = (await pool.query(
        `SELECT id FROM customers WHERE shop_id = $1 AND phone = $2 AND archived_at IS NULL`,
        [shopId, c.phone]
      )).rows[0];
      if (!custRow) {
        custRow = (await pool.query(
          `INSERT INTO customers (shop_id, name, phone, email, notes)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [shopId, c.name, c.phone, c.email, c.notes]
        )).rows[0];
      } else {
        await pool.query(
          `UPDATE customers SET name = $1, email = $2, notes = $3 WHERE id = $4`,
          [c.name, c.email, c.notes, custRow.id]
        );
      }
      customerIds[c.name] = custRow.id;
    }

    // Worker IDs map
    const workerRows = (await pool.query(`SELECT id, display_name FROM workers WHERE shop_id = $1`, [shopId])).rows;
    const workerIds: Record<string, string> = {};
    for (const w of workerRows) {
      workerIds[w.display_name] = w.id;
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Jayant: Today 10:30 with Rahul (booked) - Haircut (₹300)
    const sidHaircut = serviceMap.get('Haircut')!;
    let apt1 = (await pool.query(
      `SELECT id FROM appointments WHERE shop_id = $1 AND customer_id = $2 AND date = $3::date AND start_time = '10:30'::time`,
      [shopId, customerIds['Jayant Patel'], todayStr]
    )).rows[0];
    if (!apt1) {
      apt1 = (await pool.query(
        `INSERT INTO appointments (shop_id, customer_id, worker_id, date, start_time, end_time, status, source, total_amount_paise, notes)
         VALUES ($1, $2, $3, $4::date, '10:30'::time, '11:00'::time, 'booked', 'online', 30000, 'Online booking via website')
         RETURNING id`,
        [shopId, customerIds['Jayant Patel'], workerIds['Rahul'], todayStr]
      )).rows[0];
      if (apt1) {
        await pool.query(
          `INSERT INTO appointment_services (shop_id, appointment_id, service_id, service_name, unit_price_paise, duration_minutes)
           VALUES ($1, $2, $3, 'Haircut', 30000, 30)`,
          [shopId, apt1.id, sidHaircut]
        );
        await pool.query(
          `INSERT INTO appointment_status_history (shop_id, appointment_id, status, notes)
           VALUES ($1, $2, 'booked', 'Customer booked online')`,
          [shopId, apt1.id]
        );
      }
    }

    // 2. Rohit: Today 12:00 with Amit (in_service) - Haircut (₹300) + Beard Trim add-on (₹150)
    const sidBeard = serviceMap.get('Beard Trim')!;
    let apt2 = (await pool.query(
      `SELECT id FROM appointments WHERE shop_id = $1 AND customer_id = $2 AND date = $3::date AND start_time = '12:00'::time`,
      [shopId, customerIds['Rohit Sharma'], todayStr]
    )).rows[0];
    if (!apt2) {
      apt2 = (await pool.query(
        `INSERT INTO appointments (shop_id, customer_id, worker_id, date, start_time, end_time, status, source, total_amount_paise, notes)
         VALUES ($1, $2, $3, $4::date, '12:00'::time, '12:50'::time, 'in_service', 'online', 45000, 'Customer in chair; added beard trim')
         RETURNING id`,
        [shopId, customerIds['Rohit Sharma'], workerIds['Amit'], todayStr]
      )).rows[0];
      if (apt2) {
        await pool.query(
          `INSERT INTO appointment_services (shop_id, appointment_id, service_id, service_name, unit_price_paise, duration_minutes, is_addon)
           VALUES ($1, $2, $3, 'Haircut', 30000, 30, false), ($1, $2, $4, 'Beard Trim', 15000, 20, true)`,
          [shopId, apt2.id, sidHaircut, sidBeard]
        );
        await pool.query(
          `INSERT INTO appointment_status_history (shop_id, appointment_id, status, notes)
           VALUES ($1, $2, 'booked', 'Online booking'), ($1, $2, 'checked_in', 'Customer arrived'), ($1, $2, 'in_service', 'Started on chair')`,
          [shopId, apt2.id]
        );
      }
    }

    // 3. Suresh: Today 14:00 with Raj (completed) - Hair Spa (₹600) + Paid Invoice
    const sidHairSpa = serviceMap.get('Hair Spa')!;
    let apt3 = (await pool.query(
      `SELECT id FROM appointments WHERE shop_id = $1 AND customer_id = $2 AND date = $3::date AND start_time = '14:00'::time`,
      [shopId, customerIds['Suresh Raina'], todayStr]
    )).rows[0];
    if (!apt3) {
      apt3 = (await pool.query(
        `INSERT INTO appointments (shop_id, customer_id, worker_id, date, start_time, end_time, status, source, total_amount_paise, notes)
         VALUES ($1, $2, $3, $4::date, '14:00'::time, '15:00'::time, 'completed', 'walk_in', 60000, 'Satisfied customer')
         RETURNING id`,
        [shopId, customerIds['Suresh Raina'], workerIds['Raj'], todayStr]
      )).rows[0];
      if (apt3) {
        await pool.query(
          `INSERT INTO appointment_services (shop_id, appointment_id, service_id, service_name, unit_price_paise, duration_minutes)
           VALUES ($1, $2, $3, 'Hair Spa', 60000, 60)`,
          [shopId, apt3.id, sidHairSpa]
        );
        await pool.query(
          `INSERT INTO appointment_status_history (shop_id, appointment_id, status, notes)
           VALUES ($1, $2, 'completed', 'Service completed and billed')`,
          [shopId, apt3.id]
        );

        // Create completed invoice & payment
        const invNum = `INV-${Date.now().toString().slice(-6)}`;
        const invRow = (await pool.query(
          `INSERT INTO invoices (shop_id, invoice_number, appointment_id, customer_id, worker_id, subtotal_paise, discount_paise, final_total_paise, payment_status)
           VALUES ($1, $2, $3, $4, $5, 60000, 0, 60000, 'paid') RETURNING id`,
          [shopId, invNum, apt3.id, customerIds['Suresh Raina'], workerIds['Raj']]
        )).rows[0];

        await pool.query(
          `INSERT INTO invoice_items (shop_id, invoice_id, type, item_id, item_name, quantity, unit_price_paise, total_paise)
           VALUES ($1, $2, 'service', $3, 'Hair Spa', 1, 60000, 60000)`,
          [shopId, invRow.id, sidHairSpa]
        );

        await pool.query(
          `INSERT INTO payments (shop_id, invoice_id, method, amount_paise, status, transaction_reference)
           VALUES ($1, $2, 'upi_qr', 60000, 'completed', 'UPI-REF-992182')`,
          [shopId, invRow.id]
        );
      }
    }

    // 4. Unassigned walk-in: Today 17:30 (booked, worker_id = NULL) - Haircut (₹300)
    let apt4 = (await pool.query(
      `SELECT id FROM appointments WHERE shop_id = $1 AND customer_id = $2 AND date = $3::date AND start_time = '17:30'::time`,
      [shopId, customerIds['Virat Kohli'], todayStr]
    )).rows[0];
    if (!apt4) {
      apt4 = (await pool.query(
        `INSERT INTO appointments (shop_id, customer_id, worker_id, date, start_time, end_time, status, source, is_walk_in, total_amount_paise, notes)
         VALUES ($1, $2, NULL, $3::date, '17:30'::time, '18:00'::time, 'booked', 'walk_in', true, 30000, 'Unassigned walk-in; waiting for admin assignment')
         RETURNING id`,
        [shopId, customerIds['Virat Kohli'], todayStr]
      )).rows[0];
      if (apt4) {
        await pool.query(
          `INSERT INTO appointment_services (shop_id, appointment_id, service_id, service_name, unit_price_paise, duration_minutes)
           VALUES ($1, $2, $3, 'Haircut', 30000, 30)`,
          [shopId, apt4.id, sidHaircut]
        );
      }
    }

    // 8. Expense Categories and Historical Expenses
    const demoExpenseCats = ['Rent & Facilities', 'Utilities', 'Salaries & Wages', 'Shop Supplies'];
    const expenseCatIds: Record<string, string> = {};
    for (const ec of demoExpenseCats) {
      let ecRow = (await pool.query(
        `SELECT id FROM expense_categories WHERE shop_id = $1 AND name = $2`,
        [shopId, ec]
      )).rows[0];
      if (!ecRow) {
        ecRow = (await pool.query(
          `INSERT INTO expense_categories (shop_id, name)
           VALUES ($1, $2) RETURNING id`,
          [shopId, ec]
        )).rows[0];
      }
      expenseCatIds[ec] = ecRow.id;
    }

    const demoExpenses = [
      { cat: 'Rent & Facilities', amount: 2500000, desc: 'Shop monthly rent for MG Road premises', method: 'bank_transfer' },
      { cat: 'Utilities', amount: 450000, desc: 'Electricity and water bill', method: 'online' },
      { cat: 'Shop Supplies', amount: 320000, desc: 'Disinfectant, neck strips, towels, razor blades', method: 'cash' },
      { cat: 'Salaries & Wages', amount: 1800000, desc: 'Barber staff base payout advance', method: 'bank_transfer' },
    ];

    for (const exp of demoExpenses) {
      const existing = (await pool.query(
        `SELECT id FROM expenses WHERE shop_id = $1 AND category_id = $2 AND description = $3`,
        [shopId, expenseCatIds[exp.cat], exp.desc]
      )).rows[0];
      if (!existing) {
        await pool.query(
          `INSERT INTO expenses (shop_id, category_id, amount_paise, date, description, payment_method)
           VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)`,
          [shopId, expenseCatIds[exp.cat], exp.amount, exp.desc, exp.method]
        );
      }
    }

    // 9. Phase 2: Loyalty Settings, Customer Points & Membership Plans
    await pool.query(
      `INSERT INTO loyalty_settings (shop_id, is_enabled, earn_per_rupee_paise, point_value_paise, min_redeem_points, max_discount_percentage)
       VALUES ($1, true, 10000, 100, 50, 50)
       ON CONFLICT (shop_id) DO UPDATE SET updated_at = now()`,
      [shopId]
    );

    // Give Jayant Patel 150 points and Rohit Sharma 60 points
    await pool.query(`UPDATE customers SET loyalty_points = 150 WHERE id = $1 AND shop_id = $2`, [customerIds['Jayant Patel'], shopId]);
    await pool.query(`UPDATE customers SET loyalty_points = 60 WHERE id = $1 AND shop_id = $2`, [customerIds['Rohit Sharma'], shopId]);

    // Create VIP Grooming Pass membership plan
    let vipPlan = (await pool.query(`SELECT id FROM membership_plans WHERE shop_id = $1 AND name = 'VIP Grooming Pass'`, [shopId])).rows[0];
    if (!vipPlan) {
      vipPlan = (
        await pool.query(
          `INSERT INTO membership_plans (
             shop_id, name, description, price_paise, duration_days,
             discount_percent_services, discount_percent_products, points_multiplier, status
           )
           VALUES ($1, 'VIP Grooming Pass', 'Priority styling, 20% off all services, 10% off retail, 2x points & 2 Free Haircuts', 99900, 30, 20, 10, 2.0, 'active')
           RETURNING id`,
          [shopId]
        )
      ).rows[0];

      await pool.query(
        `INSERT INTO membership_plan_included_services (shop_id, plan_id, service_id, quantity)
         VALUES ($1, $2, $3, 2)
         ON CONFLICT DO NOTHING`,
        [shopId, vipPlan.id, sidHaircut]
      );
    }

    // Subscribe Jayant Patel to the VIP Grooming Pass
    let existingMem = (await pool.query(`SELECT id FROM customer_memberships WHERE shop_id = $1 AND customer_id = $2 AND plan_id = $3`, [shopId, customerIds['Jayant Patel'], vipPlan.id])).rows[0];
    if (!existingMem) {
      const end = new Date();
      end.setDate(end.getDate() + 30);
      await pool.query(
        `INSERT INTO customer_memberships (shop_id, customer_id, plan_id, start_date, end_date, status, notes)
         VALUES ($1, $2, $3, CURRENT_DATE, $4::date, 'active', 'Seeded VIP member')`,
        [shopId, customerIds['Jayant Patel'], vipPlan.id, end.toISOString().slice(0, 10)]
      );
    }

    // Phase 4: Promotional Coupons & Offers
    const demoCoupons = [
      {
        code: 'WELCOME10',
        description: '10% off for all customers up to Rs 150',
        discountType: 'percentage',
        discountValue: 10,
        maxDiscountPaise: 15000,
        minOrderPaise: 30000,
        applicableTo: 'all',
        maxRedemptionsPerCustomer: 1,
      },
      {
        code: 'FLAT100',
        description: 'Flat Rs 100 off on bills over Rs 500',
        discountType: 'flat',
        discountValue: 10000,
        maxDiscountPaise: null,
        minOrderPaise: 50000,
        applicableTo: 'all',
        maxRedemptionsPerCustomer: 3,
      },
      {
        code: 'FESTIVE20',
        description: '20% off all grooming services',
        discountType: 'percentage',
        discountValue: 20,
        maxDiscountPaise: 20000,
        minOrderPaise: 0,
        applicableTo: 'services',
        maxRedemptionsPerCustomer: 2,
      },
    ];

    for (const c of demoCoupons) {
      await pool.query(
        `INSERT INTO coupons (
           shop_id, code, description, discount_type, discount_value,
           max_discount_paise, min_order_paise, applicable_to,
           max_redemptions_per_customer, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         ON CONFLICT (shop_id, code) DO UPDATE SET
           description = EXCLUDED.description,
           discount_type = EXCLUDED.discount_type,
           discount_value = EXCLUDED.discount_value,
           max_discount_paise = EXCLUDED.max_discount_paise,
           min_order_paise = EXCLUDED.min_order_paise,
           applicable_to = EXCLUDED.applicable_to,
           max_redemptions_per_customer = EXCLUDED.max_redemptions_per_customer,
           is_active = true`,
        [
          shopId,
          c.code,
          c.description,
          c.discountType,
          c.discountValue,
          c.maxDiscountPaise,
          c.minOrderPaise,
          c.applicableTo,
          c.maxRedemptionsPerCustomer,
        ]
      );
    }

    console.log('✅ Realistic demo data successfully seeded for Classic Barber Shop!');
    console.log('Shop Slug: classic-barber');
    console.log(`Owner Login: ${ownerEmail} / ClassicOwner#123`);
    console.log('Workers: Rahul, Amit, Raj (Password: WorkerPass#123)');
    console.log('Sample Appointments:');
    console.log(' - Jayant Patel @ 10:30 (Haircut ₹300) with Rahul [Booked, VIP Member, 150 pts]');
    console.log(' - Rohit Sharma @ 12:00 (Haircut + Beard Trim ₹450) with Amit [In Service, 60 pts]');
    console.log(' - Suresh Raina @ 14:00 (Hair Spa ₹600) with Raj [Completed & Paid via UPI QR]');
    console.log(' - Virat Kohli @ 17:30 (Haircut ₹300) [Unassigned Walk-In]');
    console.log('Phase 2 Loyalty & Memberships:');
    console.log(' - Loyalty Program Active: 1 pt per ₹100, 1 pt = ₹1, min 50 pts');
    console.log(' - VIP Grooming Pass: ₹999/mo, 20% svc discount, 10% prod discount, 2x points');
    console.log('Inventory & Low Stock Alerts:');
    console.log(' - Beard Oil (20 in stock)');
    console.log(' - Hair Wax (15 in stock)');
    console.log(' - Shampoo (3 in stock, alert threshold is 5)');
    console.log('Finances: Rent, Utilities, Supplies & Salaries logged.');
  } finally {
    await pool.end();
  }
}

export { seed as seedDemo };

if (require.main === module) {
  seed().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}
