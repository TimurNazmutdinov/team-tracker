import { loadEnv, readConfig } from './config';
import { openDatabase } from './db';
import { acquireLock } from './lock';
import { importDataset, readSeedFile } from './seed';

// npm run db:seed — загрузить демо-данные из data/seed.json в пустую базу.

loadEnv();
const config = readConfig();
const release = config.databaseUrl ? () => {} : acquireLock(config.dataDir);
const connection = await openDatabase(config);
try {
  await importDataset(connection.db, readSeedFile(process.env.SEED_FILE ?? 'data/seed.json'));
  console.log('Демо-данные загружены.');
} finally {
  await connection.close();
  release();
}
