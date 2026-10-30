import { copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages отдаёт 404.html на неизвестные пути, поэтому после сборки копируем в него index.html
// (ADR-005). Базовый путь для Pages задаётся переменной VITE_BASE, например /team-tracker/.
const version = (JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string })
  .version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    {
      name: 'spa-404-fallback',
      apply: 'build',
      closeBundle() {
        copyFileSync(resolve('dist/index.html'), resolve('dist/404.html'));
      },
    },
  ],
  // Разработка с сервером: запросы /api уходят на сервер (тот же адрес — без CORS, ADR-010)
  server: { proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:3000' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
