// npm run transfer:pack — архив для переноса трекера на другой компьютер (docs/handover.md).
// Собирает в team-tracker-transfer-ГГГГММДД-ЧЧММ.zip всё, чего нет в GitHub: базу (DATA_DIR),
// .env, резервные копии, папку «Обратная связь», архивы базы перед обновлением и инструкцию PDF.
// Метку работающего трекера (local-data.lock) не берёт. Трекер должен быть остановлен.
import { createReadStream, createWriteStream, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';

try {
  process.loadEnvFile('.env');
} catch {
  // .env нет — значения по умолчанию
}

const root = process.cwd();
const port = process.env.PORT || '3000';
const dataDir = resolve(root, process.env.DATA_DIR || './local-data');

// 1. Трекер должен быть остановлен: копия работающей базы получится испорченной.
const running = await fetch(`http://127.0.0.1:${port}/api/health`, {
  signal: AbortSignal.timeout(1500),
})
  .then((r) => r.ok)
  .catch(() => false);
if (running) {
  console.error(
    'Трекер запущен. Закройте его окно и повторите команду: базу работающего трекера копировать нельзя.',
  );
  process.exit(1);
}

// 2. Что кладём в архив: [путь на диске, имя в архиве]
const items = [];
const add = (path, name) => {
  if (existsSync(path)) items.push([path, name]);
};
if (process.env.DATABASE_URL) {
  console.log(
    'База — PostgreSQL (DATABASE_URL): её переносят копией (npm run backup / restore), в архив она не входит.',
  );
} else if (existsSync(dataDir)) {
  add(dataDir, 'local-data');
} else {
  console.error(`Папка базы не найдена: ${dataDir}. Проверьте DATA_DIR в .env.`);
  process.exit(1);
}
add(join(root, '.env'), '.env');
add(join(root, 'backups'), 'backups');
const backupDir = process.env.BACKUP_DIR ? resolve(root, process.env.BACKUP_DIR) : null;
if (backupDir && backupDir !== join(root, 'backups')) {
  if (isAbsolute(relative(root, backupDir)) || relative(root, backupDir).startsWith('..')) {
    console.log(`Копии в ${backupDir} (BACKUP_DIR) — вне папки проекта, в архив не входят.`);
  } else add(backupDir, relative(root, backupDir));
}
add(join(root, 'Обратная связь'), 'Обратная связь');
const parent = dirname(dataDir);
const prefix = `${basename(dataDir)}-before-update-`;
for (const f of existsSync(parent) ? readdirSync(parent) : []) {
  if (f.startsWith(prefix)) add(join(parent, f), f);
}
add(join(root, 'docs', 'pdf', 'handover.pdf'), 'ИНСТРУКЦИЯ — перенос team-tracker.pdf');

// 3. Список файлов
const files = [];
const walk = (path, name) => {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const f of readdirSync(path)) walk(join(path, f), `${name}/${f}`);
  } else files.push([path, name, st.size]);
};
for (const [path, name] of items) walk(path, name);

// 4. Архив: сжатые файлы — без повторного сжатия
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const out = join(root, `team-tracker-transfer-${stamp}.zip`);
const stream = createWriteStream(out);
const done = new Promise((ok, fail) => {
  stream.on('finish', ok);
  stream.on('error', fail);
});
const zip = new Zip((err, chunk, final) => {
  if (err) throw err;
  stream.write(chunk);
  if (final) stream.end();
});
const packed = /\.(zip|gz|tgz|mp4|mov|mkv|jpe?g|png|xlsx|docx|pdf)$/i;
for (const [path, name] of files) {
  const entry = packed.test(name) ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
  zip.add(entry);
  for await (const chunk of createReadStream(path)) {
    entry.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length), false);
    // большие файлы (видео) не держим в памяти: ждём, пока диск примет записанное
    if (stream.writableNeedDrain) await new Promise((ok) => stream.once('drain', ok));
  }
  entry.push(new Uint8Array(0), true);
}
zip.end();
await done;

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} МБ`;
console.log('\nВ архиве:');
for (const [, name] of items) {
  const total = files
    .filter(([, n]) => n === name || n.startsWith(`${name}/`))
    .reduce((s, f) => s + f[2], 0);
  console.log(`  ${name} — ${mb(total)}`);
}
console.log(`\nГотово: ${out} (${mb(statSync(out).size)})`);
console.log('Перенесите этот файл на новый компьютер; что делать дальше — в PDF внутри архива.');
