import path from 'path';
import fs from 'fs';
import EmbeddedPostgres from 'embedded-postgres';

// Set fallback defaults on process.env before any NestJS modules evaluate loadConfig()
const port = Number(process.env.DB_PORT || 5432);
const ownerUrl = process.env.MIGRATION_DATABASE_URL || `postgresql://postgres:pw@localhost:${port}/postgres`;
const appUrl = process.env.DATABASE_URL || `postgresql://barber_app:apppw@localhost:${port}/postgres`;

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL = appUrl;
process.env.MIGRATION_DATABASE_URL = ownerUrl;
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret-32-chars-minimum-key!!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-32-chars-minimum-key!!';
process.env.PORT = process.env.PORT || '4000';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

async function main() {
  console.log('🚀 Starting Barber Shop Management Dev Environment...');

  const dataDir = path.resolve(process.cwd(), '.data/postgres');
  fs.mkdirSync(dataDir, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'pw',
    port,
    persistent: true,
    createPostgresUser: false,
    onLog: () => undefined,
    onError: (e: any) => console.error('[PG-ERR]', e),
  });

  try {
    await pg.initialise();
  } catch {
    // Already initialised
  }

  try {
    await pg.start();
    console.log(`📦 Embedded PostgreSQL active on port ${port}`);
  } catch (err: any) {
    console.log(`ℹ️ PostgreSQL already running on port ${port} or using existing cluster.`);
  }

  console.log('🔄 Applying latest database migrations...');
  const { migrate } = await import('./db/migrate');
  await migrate(ownerUrl, appUrl, (m) => console.log(`   ${m}`));

  console.log('🌱 Ensuring demo data is seeded...');
  const { seedDemo } = await import('./cli-seed-demo');
  try {
    await seedDemo();
  } catch (err) {
    console.warn('   Demo seeding note:', (err as Error).message);
  }

  console.log('⚡ Starting NestJS API application on port 4000...');
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');
  const { configureApp } = await import('./app.setup');

  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(4000);

  console.log('\n============================================================');
  console.log('🎉 Barber Shop Management API is LIVE and READY!');
  console.log('============================================================');
  console.log('API Base URL:   http://localhost:4000/api/v1');
  console.log('Web Frontend:   http://localhost:3000 (run: npm run dev:web)');
  console.log('\nDemo Logins:');
  console.log('  Admin / Owner:  owner@classicbarber.com / ClassicOwner#123');
  console.log('  Worker (Rahul): rahul@classicbarber.com / WorkerPass#123');
  console.log('  Worker (Amit):  amit@classicbarber.com  / WorkerPass#123');
  console.log('  Worker (Raj):   raj@classicbarber.com   / WorkerPass#123');
  console.log('\nCustomer Booking URL:');
  console.log('  http://localhost:3000/classic-barber/book');
  console.log('============================================================\n');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nStopping servers...');
    await app.close();
    await pg.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
