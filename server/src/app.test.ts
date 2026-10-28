import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addComment, createIssue, updateIssue, type NewIssueInput } from '../../src/domain/actions';
import type { Changes } from '../../src/domain/changes';
import { testCtx, viewOf } from '../../src/domain/testing';
import type { Dataset } from '../../src/domain/schema';
import { buildApp } from './app';
import { openPglite, type Connection } from './db';
import { importDataset, readSeedFile } from './seed';

let connection: Connection;
let app: FastifyInstance;
let seed: Dataset;

beforeAll(async () => {
  seed = readSeedFile('data/seed.json');
  connection = await openPglite();
  await importDataset(connection.db, seed);
  app = buildApp({ db: connection.db });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await connection.close();
});

/* eslint-disable @typescript-eslint/no-explicit-any -- ответы API в тестах разбираются как произвольный JSON */
interface Client {
  id: string;
  cookie: string;
  call(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    body?: unknown,
  ): Promise<{ status: number; json: any }>;
}

async function signUp(email: string, name: string): Promise<Client> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'secret-pass', name },
  });
  expect(res.statusCode).toBe(201);
  const cookie = `tt_session=${res.cookies[0]?.value ?? ''}`;
  const account = res.json() as { id: string };
  return {
    id: account.id,
    cookie,
    async call(method, url, body) {
      const r = await app.inject({ method, url, headers: { cookie }, payload: body as object });
      return { status: r.statusCode, json: r.body ? safeJson(r.body) : null };
    },
  };
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const view = async (c: Client) => {
  const ds: Dataset = structuredClone(seed);
  ds.people = (await c.call('GET', '/api/people')).json;
  ds.issues = (await c.call('GET', '/api/projects/p1/issues')).json;
  ds.sprints = (await c.call('GET', '/api/projects/p1/sprints')).json;
  ds.links = (await c.call('GET', '/api/projects/p1/links')).json;
  return viewOf(ds);
};

const newIssue = (patch: Partial<NewIssueInput> = {}): NewIssueInput => ({
  type: 'Task',
  title: 'Задача',
  description: '',
  acceptance: '',
  parentId: null,
  priority: 'Medium',
  points: null,
  assigneeId: null,
  labels: [],
  dueDate: null,
  sprintId: null,
  ...patch,
});

function changes(r: { ok: boolean } & { changes?: Changes }): Changes {
  if (!r.ok || !r.changes) throw new Error('ожидался успех');
  return r.changes;
}

describe('сервер', () => {
  let admin: Client;
  let dev: Client;
  let dev2: Client;

  it('без входа данные недоступны', async () => {
    expect((await app.inject({ url: '/api/projects' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/commit', payload: {} })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
  });

  it('первая учётка — администратор, остальные — разработчики', async () => {
    admin = await signUp('Admin@Example.com', 'Админ');
    dev = await signUp('dev@example.com', 'Разработчик Один');
    dev2 = await signUp('dev2@example.com', 'Разработчик Два');
    expect((await admin.call('GET', '/api/auth/me')).json).toMatchObject({
      role: 'admin',
      email: 'admin@example.com',
    });
    expect((await dev.call('GET', '/api/auth/me')).json.role).toBe('developer');
    const people = (await admin.call('GET', '/api/people')).json as { id: string }[];
    expect(people.map((p) => p.id)).toContain(dev.id);
    expect(people).toHaveLength(seed.people.length + 3);
  });

  it('проверяет регистрацию и вход', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'nope', password: '123', name: ' ' },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.details).toHaveLength(3);
    const dup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'DEV@example.com', password: 'secret-pass', name: 'Дубль' },
    });
    expect(dup.statusCode).toBe(409);
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'dev@example.com', password: 'wrong-pass' },
    });
    expect(wrong.statusCode).toBe(401);
    const good = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'dev@example.com', password: 'secret-pass' },
    });
    expect(good.statusCode).toBe(200);
    expect(good.cookies[0]).toMatchObject({ name: 'tt_session', httpOnly: true, sameSite: 'Lax' });
  });

  it('выход закрывает сессию', async () => {
    const tmp = await signUp('tmp@example.com', 'Временный');
    expect((await tmp.call('POST', '/api/auth/logout')).status).toBe(204);
    expect((await tmp.call('GET', '/api/auth/me')).status).toBe(401);
  });

  it('читает данные, как хранилище', async () => {
    const issues = (await dev.call('GET', '/api/projects/p1/issues')).json;
    expect(issues).toHaveLength(seed.issues.length);
    expect((await dev.call('GET', '/api/projects/p1/issues/5')).json.number).toBe(5);
    expect((await dev.call('GET', '/api/projects/p1/issues/999')).status).toBe(404);
    expect((await dev.call('GET', '/api/projects/p1/issues/abc')).status).toBe(404);
    const withLinks = (await dev.call('GET', '/api/projects/p1/links')).json;
    expect(withLinks).toHaveLength(seed.links.length);
    const hist = (await dev.call('GET', '/api/projects/p1/history')).json;
    expect(hist).toHaveLength(seed.history.length);
    expect((await dev.call('GET', '/api/issues/i5/comments')).json).toEqual(
      seed.comments.filter((c) => c.issueId === 'i5'),
    );
    // данные совпадают с seed по содержанию
    const byId = new Map(seed.issues.map((i) => [i.id, i]));
    for (const i of issues as { id: string }[]) expect(i).toEqual(byId.get(i.id));
  });

  it('разработчик создаёт задачу и комментирует', async () => {
    const v = await view(dev);
    const created = changes(
      createIssue(v, newIssue({ title: 'От разработчика' }), dev.id, testCtx()),
    );
    expect((await dev.call('POST', '/api/commit', created)).status).toBe(204);
    const issues = (await dev.call('GET', '/api/projects/p1/issues')).json as { title: string }[];
    expect(issues.some((i) => i.title === 'От разработчика')).toBe(true);

    const v2 = await view(dev);
    const target = v2.issues.find((i) => i.title === 'От разработчика');
    const comment = changes(addComment(v2, target?.id ?? '', dev.id, 'Привет', testCtx()));
    expect((await dev.call('POST', '/api/commit', comment)).status).toBe(204);
    expect((await dev.call('GET', `/api/issues/${target?.id}/comments`)).json).toHaveLength(1);
  });

  it('статус: своя задача — можно, чужая — 403', async () => {
    const v = await view(dev);
    const mine = v.issues.find((i) => i.title === 'От разработчика');
    if (!mine) throw new Error('нет задачи');
    // назначаем на себя, затем меняем статус
    const assign = changes(updateIssue(v, mine.id, { assigneeId: dev.id }, dev.id, testCtx()));
    expect((await dev.call('POST', '/api/commit', assign)).status).toBe(204);
    const v2 = await view(dev);
    const move = changes(updateIssue(v2, mine.id, { status: 'To Do' }, dev.id, testCtx()));
    expect((await dev.call('POST', '/api/commit', move)).status).toBe(204);

    const foreign = changes(updateIssue(v2, 'i5', { status: 'Review' }, dev.id, testCtx()));
    const denied = await dev.call('POST', '/api/commit', foreign);
    expect(denied.status).toBe(403);
    expect(denied.json.error.details[0]).toContain('чужой');
    // тот же набор принимает администратор
    const asAdmin = changes(updateIssue(v2, 'i5', { status: 'Review' }, admin.id, testCtx()));
    expect((await admin.call('POST', '/api/commit', asAdmin)).status).toBe(204);
  });

  it('чужое авторство не принимается', async () => {
    const v = await view(dev);
    const forged = changes(addComment(v, 'i5', dev2.id, 'Подделка', testCtx()));
    expect((await dev.call('POST', '/api/commit', forged)).status).toBe(403);
  });

  it('некорректные изменения отклоняются целиком', async () => {
    const v = await view(admin);
    const c = changes(createIssue(v, newIssue(), admin.id, testCtx()));
    const broken: Changes = {
      ...c,
      issues: (c.issues ?? []).map((i) => ({ ...i, sprintId: 'нет-такого' })),
    };
    const before = ((await admin.call('GET', '/api/projects/p1/issues')).json as unknown[]).length;
    const res = await admin.call('POST', '/api/commit', broken);
    expect([403, 409, 422, 500]).toContain(res.status);
    expect(res.status).not.toBe(500);
    expect(((await admin.call('GET', '/api/projects/p1/issues')).json as unknown[]).length).toBe(
      before,
    );
    expect((await admin.call('POST', '/api/commit', { issues: 'x' })).status).toBe(422);
    expect((await admin.call('POST', '/api/commit', { лишнее: [] })).status).toBe(422);
  });

  it('одинаковый номер задачи от двух клиентов — конфликт, а не дубль', async () => {
    const v = await view(admin);
    const a = changes(createIssue(v, newIssue({ title: 'Гонка А' }), admin.id, testCtx()));
    const b = changes(createIssue(v, newIssue({ title: 'Гонка Б' }), admin.id, testCtx()));
    expect((await admin.call('POST', '/api/commit', a)).status).toBe(204);
    const second = await admin.call('POST', '/api/commit', b);
    expect(second.status).toBeGreaterThanOrEqual(409);
    expect(second.status).toBeLessThan(500);
  });

  it('роли: меняет только администратор, последнего понизить нельзя', async () => {
    expect((await dev.call('PATCH', `/api/users/${dev2.id}`, { role: 'admin' })).status).toBe(403);
    const list = (await dev.call('GET', '/api/users')).json as { email: string | null }[];
    expect(list.every((u) => u.email === null)).toBe(true);
    expect((await admin.call('GET', '/api/users')).json[0].email).toContain('@');

    expect((await admin.call('PATCH', `/api/users/${dev2.id}`, { role: 'lead' })).status).toBe(204);
    expect((await dev2.call('GET', '/api/auth/me')).json.role).toBe('lead');
    // тимлид запускает спринты, но не создаёт проекты
    const last = await admin.call('PATCH', `/api/users/${admin.id}`, { role: 'developer' });
    expect(last.status).toBe(409);
    expect((await admin.call('PATCH', `/api/users/${dev.id}`, { role: 'boss' })).status).toBe(422);
    expect((await admin.call('PATCH', '/api/users/нет', { role: 'lead' })).status).toBe(404);
  });
});
