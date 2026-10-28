import { createInterface } from 'node:readline/promises';
import { createAccount } from './auth';
import { loadEnv, readConfig } from './config';
import { openDatabase } from './db';
import { HttpError } from './errors';
import { acquireLock } from './lock';

// npm run admin:create — создать администратора (почта, имя, пароль). Нужен для первого входа,
// когда регистрация закрыта. Значения можно передать флагами:
//   npm run admin:create -- --email a@b.ru --name "Имя" --password "пароль"
// Пока идёт ввод пароля, он показывается на экране; задайте его флагом, если это неудобно.

loadEnv();

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (label: string, given: string | undefined) =>
  given ?? (await rl.question(`${label}: `)).trim();

const config = readConfig();
let release = () => {};
try {
  release = config.databaseUrl ? release : acquireLock(config.dataDir);
  const email = await ask('Почта', flag('email'));
  const name = await ask('Имя', flag('name'));
  const password = await ask('Пароль (не короче 8 символов)', flag('password'));
  const connection = await openDatabase(config);
  try {
    const account = await createAccount(connection.db, {
      email,
      name,
      password,
      role: 'admin',
    });
    console.log(`Администратор создан: ${account.name} <${account.email}>. Теперь можно входить.`);
  } finally {
    await connection.close();
  }
} catch (e) {
  console.error(
    e instanceof HttpError
      ? [e.message, ...e.details].join(': ')
      : e instanceof Error
        ? e.message
        : String(e),
  );
  process.exitCode = 1;
} finally {
  release();
  rl.close();
}
