import { loadConfig } from '../config';
import { migrate } from './migrate';
const cfg = loadConfig();
migrate(cfg.MIGRATION_DATABASE_URL ?? cfg.DATABASE_URL, cfg.DATABASE_URL)
  .then(() => console.log('migrations complete'))
  .catch((e) => { console.error(e.message); process.exit(1); });
