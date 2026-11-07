import { loadConfig } from '../config';
import { migrate } from './migrate';

const cfg = loadConfig();

async function runWithRetry(attempts = 8, delayMs = 3000) {
  const ownerUrl = cfg.MIGRATION_DATABASE_URL ?? cfg.DATABASE_URL;
  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(`Connecting to database and running migrations (attempt ${i}/${attempts})...`);
      await migrate(ownerUrl, cfg.DATABASE_URL);
      console.log('migrations complete');
      return;
    } catch (e: any) {
      console.warn(`Migration attempt ${i} failed: ${e.message}`);
      if (i === attempts) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

runWithRetry()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal migration failure:', e.message);
    process.exit(1);
  });
