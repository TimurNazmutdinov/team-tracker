import { buildApp } from './app';
import { openPglite, openPostgres } from './db';

// Запуск: DATABASE_URL — PostgreSQL; без него — встроенная база PGlite в каталоге PGLITE_DIR
// (по умолчанию .data/pglite), чтобы локальная разработка не требовала установки базы.

const url = process.env.DATABASE_URL;
const connection = url
  ? await openPostgres(url)
  : await openPglite(process.env.PGLITE_DIR ?? '.data/pglite');

const app = buildApp({
  db: connection.db,
  staticDir: process.env.STATIC_DIR ?? 'dist',
  secureCookies: process.env.COOKIE_SECURE === 'true',
  logger: true,
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app
      .close()
      .then(() => connection.close())
      .then(() => process.exit(0));
  });
}
