import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIssue, type NewIssueInput } from '../../src/domain/actions';
import type { Dataset, Issue } from '../../src/domain/schema';
import { DEFAULT_ROLES } from '../../src/domain/roles';
import { testCtx, viewOf } from '../../src/domain/testing';
import { buildApp } from './app';
import { openPglite, type Connection } from './db';
import { importDataset, readSeedFile } from './seed';

// Роли и права настраиваются в интерфейсе (ADR-021): таблица ролей, защищённый администратор, назначение
// ролей учёткам и действие прав на сервере, в том числе роль «только чтение».

let connection: Connection;
let app: FastifyInstance;
let seed: Dataset;

beforeAll(async () => {
  seed = readSeedFile('data/seed.json');
  connection = await openPglite();
  await importDataset(connection.db, seed);
  app = buildApp({ db: connection.db, allowRegistration: true });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await connection.close();
});

/* eslint-disable @typescript-eslint/no-explicit-any -- ответы API в тестах разбираются как произвольный JSON */
interface Client {
  id: string;
  call(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    body?: unknown,
  ): Promise<{ status: number; json: any }>;
}

async function signUp(email: string): Promise<Client> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'secret-pass', name: email.split('@')[0] },
  });
  expect(res.statusCode).toBe(201);
  const cookie = `tt_session=${res.cookies[0]?.value ?? ''}`;
  return {
    id: (res.json() as { id: string }).id,
    async call(method, url, body) {
      const r = await app.inject({ method, url, headers: { cookie }, payload: body as object });
      return { status: r.statusCode, json: r.body ? JSON.parse(r.body) : null };
    },
  };
}

const input: NewIssueInput = {
  type: 'Task',
  title: 'Задача от наблюдателя',
  description: '',
  acceptance: '',
  parentId: null,
  priority: 'Medium',
  points: null,
  assigneeId: null,
  labels: [],
  dueDate: null,
  sprintId: null,
};

describe('роли на сервере', () => {
  let admin: Client;
  let viewer: Client;
  const viewerRole = {
    id: 'viewer',
    name: 'Наблюдатель',
    permissions: [] as string[],
    system: false,
  };

  beforeAll(async () => {
    admin = await signUp('admin@example.com'); // первая учётка — администратор
    viewer = await signUp('viewer@example.com');
  });

  it('таблица ролей по умолчанию читается любым вошедшим', async () => {
    const roles = (await viewer.call('GET', '/api/roles')).json as { id: string }[];
    expect(roles.map((r) => r.id).sort()).toEqual(DEFAULT_ROLES.map((r) => r.id).sort());
  });

  it('администратор добавляет роль и назначает её учётке', async () => {
    expect((await admin.call('POST', '/api/commit', { roles: [viewerRole] })).status).toBe(204);
    const roles = (await admin.call('GET', '/api/roles')).json as { id: string }[];
    expect(roles.map((r) => r.id)).toContain('viewer');
    expect((await admin.call('PATCH', `/api/users/${viewer.id}`, { role: 'viewer' })).status).toBe(
      204,
    );
    const accounts = (await admin.call('GET', '/api/users')).json as { id: string; role: string }[];
    expect(accounts.find((a) => a.id === viewer.id)?.role).toBe('viewer');
  });

  it('неизвестную роль назначить нельзя', async () => {
    const r = await admin.call('PATCH', `/api/users/${viewer.id}`, { role: 'нет-такой' });
    expect(r.status).toBe(422);
  });

  it('роль без галочек — только чтение: создать задачу, прокомментировать, править нельзя', async () => {
    const me = await viewer.call('GET', '/api/auth/me');
    expect(me.json.role).toBe('viewer');
    const view = viewOf(
      {
        ...seed,
        issues: (await viewer.call('GET', '/api/projects/p1/issues')).json as Issue[],
      },
      'p1',
    );
    const made = createIssue(view, input, viewer.id, testCtx());
    if (!made.ok) throw new Error('ожидался успех');
    const denied = await viewer.call('POST', '/api/commit', made.changes);
    expect(denied.status).toBe(403);
    expect(denied.json.error.details[0]).toContain('ваша роль');
    // чтение остаётся
    expect((await viewer.call('GET', '/api/projects/p1/issues')).status).toBe(200);
  });

  it('галочка включает право сразу после сохранения', async () => {
    const withCreate = { ...viewerRole, permissions: ['issue.create'] };
    expect((await admin.call('POST', '/api/commit', { roles: [withCreate] })).status).toBe(204);
    const view = viewOf(
      {
        ...seed,
        issues: (await viewer.call('GET', '/api/projects/p1/issues')).json as Issue[],
      },
      'p1',
    );
    const made = createIssue(view, input, viewer.id, testCtx());
    if (!made.ok) throw new Error('ожидался успех');
    expect((await viewer.call('POST', '/api/commit', made.changes)).status).toBe(204);
  });

  it('менять роли может только тот, у кого есть право на учётки и роли', async () => {
    const r = await viewer.call('POST', '/api/commit', {
      roles: [{ ...viewerRole, permissions: ['users.manage'] }],
    });
    expect(r.status).toBe(403);
  });

  it('роль «Администратор» защищена: права не снять, удалить нельзя', async () => {
    const adminRole = DEFAULT_ROLES.find((r) => r.system);
    if (!adminRole) throw new Error('нет роли администратора');
    const weaker = await admin.call('POST', '/api/commit', {
      roles: [{ ...adminRole, permissions: ['issue.create'] }],
    });
    expect(weaker.status).toBe(403);
    expect((await admin.call('POST', '/api/commit', { deleteRoleIds: ['admin'] })).status).toBe(
      403,
    );
  });

  it('роль, назначенную учётке, удалить нельзя; свободную — можно', async () => {
    const busy = await admin.call('POST', '/api/commit', { deleteRoleIds: ['viewer'] });
    expect(busy.status).toBe(409);
    await admin.call('PATCH', `/api/users/${viewer.id}`, { role: 'developer' });
    expect((await admin.call('POST', '/api/commit', { deleteRoleIds: ['viewer'] })).status).toBe(
      204,
    );
    const roles = (await admin.call('GET', '/api/roles')).json as { id: string }[];
    expect(roles.map((r) => r.id)).not.toContain('viewer');
  });
});
