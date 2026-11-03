import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { loadConfig } from './config';

const port = Number(process.env.DB_PORT || 5432);
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || `postgresql://barber_app:apppw@localhost:${port}/postgres`;
process.env.MIGRATION_DATABASE_URL =
  process.env.MIGRATION_DATABASE_URL || `postgresql://postgres:pw@localhost:${port}/postgres`;
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'dev-access-secret-32-chars-minimum-key!!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-32-chars-minimum-key!!';

const BACKUP_TABLES = [
  'shops',
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'user_roles',
  'files',
  'shop_hours',
  'service_categories',
  'services',
  'workers',
  'worker_services',
  'worker_availability',
  'worker_schedules',
  'worker_time_off',
  'customers',
  'customer_preferred_services',
  'appointments',
  'appointment_services',
  'appointment_status_history',
  'product_categories',
  'products',
  'inventory_transactions',
  'invoices',
  'invoice_items',
  'payments',
  'expense_categories',
  'expenses',
  'audit_logs',
  'loyalty_settings',
  'customer_loyalty_ledger',
  'membership_plans',
  'customer_memberships',
  'customer_membership_service_usages',
  'worker_commission_ledger',
  'worker_payouts',
  'coupons',
  'coupon_redemptions',
  'worker_attendance',
  'worker_salary_advances',
  'worker_salary_settlements',
  'reviews',
  'notifications',
];

export async function createBackup(outputPath?: string): Promise<string> {
  const cfg = loadConfig();
  const pool = new Pool({
    connectionString: cfg.MIGRATION_DATABASE_URL ?? cfg.DATABASE_URL,
  });

  try {
    const backupData: {
      version: string;
      createdAt: string;
      tables: Record<string, any[]>;
      counts: Record<string, number>;
    } = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      tables: {},
      counts: {},
    };

    let totalRows = 0;
    console.log('📦 Starting database backup across all tenant tables...');

    for (const table of BACKUP_TABLES) {
      try {
        const res = await pool.query(`SELECT * FROM ${table}`);
        backupData.tables[table] = res.rows;
        backupData.counts[table] = res.rowCount || 0;
        totalRows += res.rowCount || 0;
      } catch (err: any) {
        // Table might not exist yet if migrations haven't run
        backupData.tables[table] = [];
        backupData.counts[table] = 0;
      }
    }

    const backupDir = path.resolve(process.cwd(), '.data/backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const defaultFilename = `barbershop-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const destPath = outputPath || path.join(backupDir, defaultFilename);

    fs.writeFileSync(destPath, JSON.stringify(backupData, null, 2), 'utf8');

    const stats = fs.statSync(destPath);
    console.log(`✅ Backup successfully created at: ${destPath}`);
    console.log(`📊 Statistics: ${totalRows} total records saved (${(stats.size / 1024).toFixed(1)} KB)`);

    return destPath;
  } finally {
    await pool.end();
  }
}

export async function restoreBackup(filePath: string): Promise<void> {
  const cfg = loadConfig();
  const pool = new Pool({
    connectionString: cfg.MIGRATION_DATABASE_URL ?? cfg.DATABASE_URL,
  });

  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Backup file not found at: ${fullPath}`);
  }

  const raw = fs.readFileSync(fullPath, 'utf8');
  const backup = JSON.parse(raw);

  if (!backup.version || !backup.tables) {
    throw new Error('Invalid backup file format.');
  }

  const client = await pool.connect();
  try {
    console.log(`🔄 Restoring database from backup: ${fullPath} (Created: ${backup.createdAt})...`);
    await client.query('BEGIN');

    // Truncate tables in reverse dependency order
    const reverseTables = [...BACKUP_TABLES].reverse();
    for (const table of reverseTables) {
      try {
        await client.query(`TRUNCATE TABLE ${table} CASCADE`);
      } catch {
        // ignore if table doesn't exist
      }
    }

    // Insert rows table by table
    let restoredRows = 0;
    for (const table of BACKUP_TABLES) {
      const rows = backup.tables[table] || [];
      if (rows.length === 0) continue;

      for (const row of rows) {
        const keys = Object.keys(row);
        const values = Object.values(row);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const cols = keys.map((k) => `"${k}"`).join(', ');

        await client.query(
          `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`,
          values
        );
        restoredRows++;
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Database successfully restored! (${restoredRows} records restored)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Restore failed. Rolled back all changes:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'backup';
  const target = args[1];

  if (cmd === 'backup') {
    createBackup(target).catch((err) => {
      console.error('Backup failed:', err);
      process.exit(1);
    });
  } else if (cmd === 'restore') {
    if (!target) {
      console.error('Error: Please provide path to backup file to restore.');
      console.log('Usage: npm run restore <path-to-backup-file>');
      process.exit(1);
    }
    restoreBackup(target).catch((err) => {
      console.error('Restore failed:', err);
      process.exit(1);
    });
  } else {
    console.log('Usage:');
    console.log('  node dist/cli-backup.js backup [output-file]');
    console.log('  node dist/cli-backup.js restore <input-file>');
  }
}
