import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Сквозные тесты идут против настоящего сервера: чистая встроенная база PGlite с демо-данными в
// временной папке, регистрация открыта (первая учётка — администратор). Только CI (часть 2 доработок).
const port = Number(process.env.E2E_PORT ?? 3100);
const work = mkdtempSync(join(tmpdir(), 'tt-e2e-'));

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run db:seed && npm run start',
    cwd: '..',
    url: `http://127.0.0.1:${port}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: join(work, 'data'),
      BACKUP_DIR: join(work, 'backups'),
      BACKUP_AUTO: 'false',
      ALLOW_REGISTRATION: 'true',
    },
  },
});
