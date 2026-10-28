// npm run start — собирает интерфейс (если нужно) и запускает сервер: интерфейс и API на одном
// адресе. С флагом --open после запуска открывает браузер (так делает start.cmd).
// Работает без Docker и без установки PostgreSQL: база — встроенная PGlite (ADR-011).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

try {
  process.loadEnvFile('.env');
} catch {
  // .env нет — значения по умолчанию
}

if (!existsSync('node_modules')) {
  console.error('Не установлены зависимости. Выполните: npm install');
  process.exit(1);
}

// --- сборка интерфейса: нужна, если её нет, она устарела или собрана не для сервера ---
const marker = join('dist', '.build-mode');

function newest(path) {
  if (!existsSync(path)) return 0;
  const info = statSync(path);
  if (!info.isDirectory()) return info.mtimeMs;
  return readdirSync(path).reduce((max, name) => Math.max(max, newest(join(path, name))), 0);
}

function needsBuild() {
  if (!existsSync(join('dist', 'index.html')) || !existsSync(marker)) return true;
  const built = statSync(marker).mtimeMs;
  const sources = ['src', 'public', 'index.html', 'vite.config.ts', 'package-lock.json'];
  return sources.some((p) => newest(p) > built);
}

if (needsBuild()) {
  console.log('Собираю интерфейс…');
  const vite = join('node_modules', 'vite', 'bin', 'vite.js');
  const build = spawnSync(process.execPath, [vite, 'build'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_STORAGE: 'api', VITE_BASE: '/' },
  });
  if (build.status !== 0) {
    console.error('Не удалось собрать интерфейс.');
    process.exit(build.status ?? 1);
  }
  writeFileSync(marker, 'api');
}

// --- сервер ---
const server = spawn(process.execPath, ['--import', 'tsx', 'server/src/main.ts'], {
  stdio: 'inherit',
});
let stopped = false;
server.on('exit', (code) => {
  stopped = true;
  process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(signal, () => server.kill('SIGINT'));
}

// --- браузер ---
function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '""', url], {
      stdio: 'ignore',
      detached: true,
      windowsVerbatimArguments: true,
    }).unref();
  } else {
    spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {
      stdio: 'ignore',
      detached: true,
    })
      .on('error', () => {})
      .unref();
  }
}

if (process.argv.includes('--open')) {
  const port = process.env.PORT || '3000';
  const probe = `http://127.0.0.1:${port}/api/health`;
  for (let i = 0; i < 120 && !stopped; i++) {
    const ok = await fetch(probe)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) {
      openBrowser(`http://localhost:${port}`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
