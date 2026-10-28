import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  tseslint.configs.strict,
  reactHooks.configs.flat.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // ADR-001: реализации хранения подключаются только в корне приложения и внутри модуля хранения.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/storage/**', 'src/app/create-storage.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/storage/seed-local',
                '**/storage/seed-local/*',
                '**/storage/api',
                '**/storage/api/*',
              ],
              message: 'Данные берутся только через интерфейс TrackerStorage (ADR-001).',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
