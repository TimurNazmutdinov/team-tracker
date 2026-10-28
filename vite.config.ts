import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages отдаёт 404.html на неизвестные пути, поэтому после сборки копируем в него index.html
// (ADR-005). Базовый путь для Pages задаётся переменной VITE_BASE, например /team-tracker/.
export default defineConfig({
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
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
