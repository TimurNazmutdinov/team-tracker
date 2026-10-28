import { backupPglite, restorePglite } from './backup';
import { loadEnv, readConfig } from './config';

// npm run backup — копия базы в backups/ с датой и временем.
// npm run restore <файл> — восстановление из копии. Оба действия — при остановленном трекере.

loadEnv();
const config = readConfig();

async function main(): Promise<void> {
  const [command, file] = process.argv.slice(2);
  if (config.databaseUrl) {
    throw new Error(
      'Задан DATABASE_URL (PostgreSQL): копии делает pg_dump, в Docker — scripts/backup.sh и scripts/restore.sh.',
    );
  }
  if (command === 'backup') {
    const path = await backupPglite(config.dataDir, config.backupDir, config.backupKeep);
    console.log(`Копия сохранена: ${path}`);
  } else if (command === 'restore') {
    if (!file) throw new Error('Укажите файл копии: npm run restore backups\\tracker-….tar.gz');
    const { previous } = await restorePglite(file, config.dataDir);
    console.log(`База восстановлена из ${file}.`);
    if (previous) console.log(`Прежние данные сохранены в ${previous} (можно удалить).`);
  } else {
    throw new Error('Использование: backup-cli backup | restore <файл>');
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
