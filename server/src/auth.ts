import { randomUUID } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { DEFAULT_PALETTE, isPalette, type Palette } from '../../src/domain/palettes';
import { ROLE_LABELS, isRole, type Role } from '../../src/domain/permissions';
import { schema, type Db } from './db';
import { HttpError } from './errors';
import { hashPassword, newToken, tokenHash, verifyPassword } from './passwords';
import { lockWrites } from './repo';

const { users, people, sessions } = schema;

export const SESSION_DAYS = 7;
export const PASSWORD_MIN = 8;

export interface Account {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Пароль временный: до его смены доступна только смена пароля. */
  mustChangePassword: boolean;
  /** Цветовая гамма интерфейса из профиля (ADR-013). */
  palette: Palette;
}

/** Гамма из базы; незнакомое значение (например, после отката версии) — по умолчанию. */
function paletteOf(value: string): Palette {
  return isPalette(value) ? value : DEFAULT_PALETTE;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function startSession(db: Db, userId: string): Promise<string> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.insert(sessions).values({ tokenHash: tokenHash(token), userId, expiresAt });
  return token;
}

export interface NewAccount {
  email: string;
  password: string;
  name: string;
  /** Не задана — по числу учёток: первая администратор, остальные разработчики (ADR-010). */
  role?: Role;
  mustChangePassword?: boolean;
}

function checkPassword(password: string): string | null {
  return password.length < PASSWORD_MIN ? `Пароль не короче ${PASSWORD_MIN} символов` : null;
}

/** Создаёт человека и учётку. Общая часть регистрации, создания администратором и `admin:create`. */
export async function createAccount(db: Db, input: NewAccount): Promise<Account> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const errors: string[] = [];
  if (!EMAIL.test(email)) errors.push('Введите адрес почты, например ivan@example.com');
  if (name.length === 0 || name.length > 100) errors.push('Введите имя (до 100 символов)');
  const passwordError = checkPassword(input.password);
  if (passwordError) errors.push(passwordError);
  if (errors.length > 0) throw new HttpError(422, 'invalid_data', 'Проверьте поля', errors);

  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();
  const mustChangePassword = input.mustChangePassword ?? false;
  const role = await db.transaction(async (tx) => {
    await lockWrites(tx);
    const taken = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (taken.length > 0) {
      throw new HttpError(409, 'email_taken', 'Эта почта уже зарегистрирована');
    }
    const [{ count } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const accessRole: Role = input.role ?? (count === 0 ? 'admin' : 'developer');
    await tx.insert(people).values({ id, name, role: ROLE_LABELS[accessRole] });
    await tx.insert(users).values({ id, email, passwordHash, accessRole, mustChangePassword });
    return accessRole;
  });
  return { id, name, email, role, mustChangePassword, palette: DEFAULT_PALETTE };
}

/** Самостоятельная регистрация (только при ALLOW_REGISTRATION=true). */
export async function register(
  db: Db,
  input: { email: string; password: string; name: string },
): Promise<{ account: Account; token: string }> {
  const account = await createAccount(db, input);
  return { account, token: await startSession(db, account.id) };
}

/** Количество учёток; ноль — трекер ещё без администратора. */
export async function countAccounts(db: Db): Promise<number> {
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  return count;
}

const WRONG = 'Неверная почта или пароль';

export async function login(
  db: Db,
  input: { email: string; password: string },
): Promise<{ account: Account; token: string }> {
  const email = normalizeEmail(input.email);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      hash: users.passwordHash,
      role: users.accessRole,
      mustChange: users.mustChangePassword,
      palette: users.palette,
      name: people.name,
    })
    .from(users)
    .innerJoin(people, eq(people.id, users.id))
    .where(eq(users.email, email));
  const row = rows[0];
  // Хэш считается и для неизвестной почты, чтобы по времени ответа нельзя было отличить её от неверного пароля
  const ok = await verifyPassword(
    input.password,
    row?.hash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA',
  );
  if (!row || !ok || !isRole(row.role)) throw new HttpError(401, 'bad_credentials', WRONG);
  const token = await startSession(db, row.id);
  return {
    account: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      mustChangePassword: row.mustChange,
      palette: paletteOf(row.palette),
    },
    token,
  };
}

export async function logout(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
}

/** Пользователь по токену сессии; просроченные и неизвестные токены — null. */
export async function accountByToken(db: Db, token: string | undefined): Promise<Account | null> {
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.accessRole,
      mustChange: users.mustChangePassword,
      palette: users.palette,
      name: people.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(people, eq(people.id, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date())));
  const row = rows[0];
  if (!row || !isRole(row.role)) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    mustChangePassword: row.mustChange,
    palette: paletteOf(row.palette),
  };
}

export async function listAccounts(db: Db): Promise<Account[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.accessRole,
      mustChange: users.mustChangePassword,
      palette: users.palette,
      name: people.name,
    })
    .from(users)
    .innerJoin(people, eq(people.id, users.id));
  return rows.flatMap((r) =>
    isRole(r.role)
      ? [
          {
            id: r.id,
            email: r.email,
            name: r.name,
            role: r.role,
            mustChangePassword: r.mustChange,
            palette: paletteOf(r.palette),
          },
        ]
      : [],
  );
}

/** Меняет роль учётки; последнего администратора понизить нельзя. */
export async function setRole(db: Db, userId: string, role: Role): Promise<void> {
  await db.transaction(async (tx) => {
    await lockWrites(tx);
    const rows = await tx.select().from(users).where(eq(users.id, userId));
    const user = rows[0];
    if (!user) throw new HttpError(404, 'not_found', 'Учётка не найдена');
    if (user.accessRole === 'admin' && role !== 'admin') {
      const admins = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.accessRole, 'admin'));
      if (admins.length <= 1) {
        throw new HttpError(409, 'last_admin', 'Нельзя понизить последнего администратора');
      }
    }
    await tx.update(users).set({ accessRole: role }).where(eq(users.id, userId));
    // Должность в списке людей следует за ролью доступа
    await tx.update(people).set({ role: ROLE_LABELS[role] }).where(eq(people.id, userId));
  });
}

/**
 * Смена своего пароля: нужен текущий. Остальные сессии пользователя закрываются, выдаётся новая.
 */
export async function changePassword(
  db: Db,
  userId: string,
  current: string,
  next: string,
): Promise<string> {
  const rows = await db.select().from(users).where(eq(users.id, userId));
  const user = rows[0];
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    throw new HttpError(401, 'bad_credentials', 'Текущий пароль неверен');
  }
  const error = checkPassword(next);
  if (error) throw new HttpError(422, 'invalid_data', 'Проверьте поля', [error]);
  if (next === current) {
    throw new HttpError(422, 'invalid_data', 'Проверьте поля', [
      'Новый пароль должен отличаться от текущего',
    ]);
  }
  const passwordHash = await hashPassword(next);
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  return startSession(db, userId);
}

/** Администратор выдаёт временный пароль; сессии пользователя закрываются, при входе нужна смена. */
export async function resetPassword(db: Db, userId: string, temporary: string): Promise<void> {
  const error = checkPassword(temporary);
  if (error) throw new HttpError(422, 'invalid_data', 'Проверьте поля', [error]);
  const passwordHash = await hashPassword(temporary);
  const updated = await db
    .update(users)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (updated.length === 0) throw new HttpError(404, 'not_found', 'Учётка не найдена');
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Сохраняет цветовую гамму в профиле: видна пользователю с любого компьютера (ADR-013). */
export async function setPalette(db: Db, userId: string, palette: Palette): Promise<void> {
  const updated = await db
    .update(users)
    .set({ palette })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (updated.length === 0) throw new HttpError(404, 'not_found', 'Учётка не найдена');
}
