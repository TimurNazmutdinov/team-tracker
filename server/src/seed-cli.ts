import { openPglite, openPostgres } from './db';
import { importDataset, readSeedFile } from './seed';

// npm run db:seed — загрузить демо-данные из data/seed.json в пустую базу.

const url = process.env.DATABASE_URL;
const connection = url
  ? await openPostgres(url)
  : await openPglite(process.env.PGLITE_DIR ?? '.data/pglite');
try {
  await importDataset(connection.db, readSeedFile(process.env.SEED_FILE ?? 'data/seed.json'));
  console.log('Демо-данные загружены.');
} finally {
  await connection.close();
}
