import { randomUUID } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
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

/**
 * Регистрация: создаёт человека и учётку. Первая учётка получает роль администратора, остальные —
 * разработчика (ADR-010).
 */
export async function register(
  db: Db,
  input: { email: string; password: string; name: string },
): Promise<{ account: Account; token: string }> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const errors: Record<string, string> = {};
  if (!EMAIL.test(email)) errors.email = 'Введите адрес почты, например ivan@example.com';
  if (name.length === 0 || name.length > 100) errors.name = 'Введите имя (до 100 символов)';
  if (input.password.length < PASSWORD_MIN)
    errors.password = `Пароль не короче ${PASSWORD_MIN} символов`;
  if (Object.keys(errors).length > 0) {
    throw new HttpError(422, 'invalid_data', 'Проверьте поля', Object.values(errors));
  }

  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();
  const role = await db.transaction(async (tx) => {
    await lockWrites(tx);
    const taken = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (taken.length > 0) {
      throw new HttpError(409, 'email_taken', 'Эта почта уже зарегистрирована');
    }
    const [{ count } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const accessRole: Role = count === 0 ? 'admin' : 'developer';
    await tx.insert(people).values({ id, name, role: ROLE_LABELS[accessRole] });
    await tx.insert(users).values({ id, email, passwordHash, accessRole });
    return accessRole;
  });
  const token = await startSession(db, id);
  return { account: { id, name, email, role }, token };
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
  return { account: { id: row.id, name: row.name, email: row.email, role: row.role }, token };
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
      name: people.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(people, eq(people.id, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date())));
  const row = rows[0];
  if (!row || !isRole(row.role)) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function listAccounts(db: Db): Promise<Account[]> {
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.accessRole, name: people.name })
    .from(users)
    .innerJoin(people, eq(people.id, users.id));
  return rows.flatMap((r) => (isRole(r.role) ? [{ ...r, role: r.role }] : []));
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
