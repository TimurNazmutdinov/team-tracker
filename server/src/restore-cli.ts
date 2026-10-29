import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { SAFETY_PREFIX } from './backups/rotation';
import { applyRestore, currentCounts, loadBundle, type Source } from './backups/restore';
import { explain, openCli } from './cli-context';

// npm run restore <папка-комплекта> [--source json|xlsx] [--yes]
// Проверяет комплект, показывает, что будет восстановлено, спрашивает подтверждение, сохраняет
// текущую базу (комплект before-restore_…) и только потом заменяет данные.

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const folder = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--source');

function usage(): never {
  console.error('Использование: npm run restore <папка-комплекта> [--source json|xlsx] [--yes]');
  process.exit(1);
}

const sourceArg = flag('source');
if (!folder) usage();
if (sourceArg !== undefined && sourceArg !== 'json' && sourceArg !== 'xlsx') usage();
const source: Source | 'auto' = sourceArg ?? 'auto';

try {
  const loaded = await loadBundle(resolve(folder), source);
  if (!loaded.ok) {
    console.error('Комплект нельзя восстановить:');
    for (const p of loaded.problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const { connection, backups, release } = await openCli();
  try {
    const now = await currentCounts(connection.db);
    const c = loaded.counts;
    console.log(`Источник: ${loaded.source === 'json' ? 'tracker.json' : 'tracker.xlsx'}`);
    if (loaded.createdAt) console.log(`Копия от: ${loaded.createdAt}`);
    console.log('Будет восстановлено (сейчас в базе → из копии):');
    const rows: [string, number, number][] = [
      ['проекты', now.projects, c.projects],
      ['люди', now.people, c.people],
      ['учётные записи', now.accounts, loaded.snapshot.accounts.length],
      ['спринты', now.sprints, c.sprints],
      ['задачи', now.issues, c.issues],
      ['связи', now.links, c.links],
      ['комментарии', now.comments, c.comments],
      ['история', now.history, c.history],
    ];
    for (const [name, was, will] of rows) console.log(`  ${name.padEnd(16)} ${was} → ${will}`);
    for (const note of loaded.notes) console.log(`Внимание: ${note}`);
    console.log('Все текущие данные будут заменены, все пользователи выйдут из системы.');

    if (!args.includes('--yes')) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question('Восстановить? [y/N] ')).trim().toLowerCase();
      rl.close();
      if (answer !== 'y' && answer !== 'д') {
        console.log('Отменено, данные не изменены.');
        process.exit(0);
      }
    }

    // Текущая база сохраняется автоматически; без этой копии восстановление не начинается
    const safety = await backups.run('перед восстановлением', SAFETY_PREFIX);
    console.log(`Текущая база сохранена: ${safety.dir}`);

    const result = await applyRestore(connection.db, loaded.snapshot);
    console.log('Готово: данные восстановлены.');
    if (result.temporaryPasswords.length > 0) {
      console.log('Временные пароли (показываются один раз, при входе их нужно сменить):');
      for (const t of result.temporaryPasswords) console.log(`  ${t.email}  ${t.password}`);
    }
  } finally {
    await connection.close();
    release();
  }
} catch (e) {
  console.error(explain(e));
  process.exitCode = 1;
}
