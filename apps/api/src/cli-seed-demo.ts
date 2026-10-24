import { Pool } from 'pg';
import { loadConfig } from './config';
import { hashPassword } from './auth/auth.service';

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
    const cat = (await pool.query(
      `INSERT INTO service_categories (shop_id, name, display_order)
       VALUES ($1, 'Grooming Services', 1) ON CONFLICT (shop_id, name) DO UPDATE SET display_order = 1 RETURNING id`,
      [shopId]
    )).rows[0];

    const demoServices = [
      { name: 'Haircut', price: 30000, duration: 30, desc: 'Precision styling, wash and finish' },
      { name: 'Beard Trim', price: 15000, duration: 20, desc: 'Beard shaping, razor edge, and hot towel' },
      { name: 'Hair + Beard', price: 40000, duration: 45, desc: 'Combo service haircut and beard grooming' },
      { name: 'Hair Spa', price: 60000, duration: 60, desc: 'Deep conditioning, head massage and steam treatment' },
    ];

    const serviceMap = new Map<string, string>();
    for (const s of demoServices) {
      const res = (await pool.query(
        `INSERT INTO services (shop_id, category_id, name, description, price_paise, duration_minutes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id, shop_id) DO NOTHING RETURNING id`,
        [shopId, cat.id, s.name, s.desc, s.price, s.duration]
      )).rows[0];
      const sid = res ? res.id : (await pool.query(`SELECT id FROM services WHERE shop_id = $1 AND name = $2`, [shopId, s.name])).rows[0].id;
      serviceMap.set(s.name, sid);
    }

    // 5. Workers: Rahul, Amit, Raj
    const demoWorkers = [
      { name: 'Rahul', phone: '+919876500101', email: 'rahul@classicbarber.com', services: ['Haircut', 'Beard Trim', 'Hair + Beard'] },
      { name: 'Amit', phone: '+919876500102', email: 'amit@classicbarber.com', services: ['Haircut', 'Beard Trim', 'Hair + Beard', 'Hair Spa'] },
      { name: 'Raj', phone: '+919876500103', email: 'raj@classicbarber.com', services: ['Haircut', 'Hair Spa'] },
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
          `INSERT INTO workers (shop_id, user_id, display_name, phone) VALUES ($1, $2, $3, $4) RETURNING id`,
          [shopId, workerUser.id, w.name, w.phone]
        )).rows[0];
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
    const custRes = (await pool.query(
      `INSERT INTO customers (shop_id, name, phone, email, notes)
       VALUES ($1, 'Jayant Patel', '+919876599001', 'jayant@example.com', 'Prefers short haircut, zero fade')
       ON CONFLICT (shop_id, phone) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [shopId]
    )).rows[0];

    console.log('✅ Realistic demo data successfully seeded for Classic Barber Shop!');
    console.log('Shop Slug: classic-barber');
    console.log(`Owner Login: ${ownerEmail} / ClassicOwner#123`);
    console.log('Workers: Rahul, Amit, Raj (Password: WorkerPass#123)');
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
