import { explain, openCli } from './cli-context';

// npm run backup — комплект копии в папке копий (BACKUP_DIR или выбранной в настройках).
// Со встроенной базой работает при остановленном трекере; при работающем — кнопка в настройках.

try {
  const { connection, backups, release } = await openCli();
  try {
    const result = await backups.run('вручную (командная строка)');
    console.log(`Копия готова: ${result.dir}`);
    for (const w of result.warnings) console.log(`Предупреждение: ${w}`);
  } finally {
    await connection.close();
    release();
  }
} catch (e) {
  console.error(explain(e));
  process.exitCode = 1;
}
