import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { moveIssue } from '../../src/domain/actions';
import type { Changes } from '../../src/domain/changes';
import { addMember, removeMember, setOwner } from '../../src/domain/members';
import type { Dataset, ProjectMember } from '../../src/domain/schema';
import { testCtx, viewOf } from '../../src/domain/testing';
import { buildApp } from './app';
import { openPglite, type Connection } from './db';
import { importDataset, readSeedFile } from './seed';

// Владелец и участники проекта, права продакта и сохранённый выбор проектов (ADR-016).

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

const currentView = async (c: Client) => {
  const ds: Dataset = structuredClone(seed);
  ds.people = (await c.call('GET', '/api/people')).json;
  ds.members = (await c.call('GET', '/api/members')).json;
  ds.projects = (await c.call('GET', '/api/projects')).json;
  ds.issues = (await c.call('GET', '/api/projects/p1/issues')).json;
  ds.sprints = (await c.call('GET', '/api/projects/p1/sprints')).json;
  ds.links = (await c.call('GET', '/api/projects/p1/links')).json;
  return viewOf(ds);
};

const must = (r: { ok: boolean; changes?: Changes }): Changes => {
  if (!r.ok || !r.changes) throw new Error('ожидался успех');
  return r.changes;
};

describe('участники проекта на сервере', () => {
  let admin: Client;
  let product: Client;
  let other: Client;

  it('владелец и участники приходят из базы', async () => {
    admin = await signUp('admin@example.com'); // первая учётка — администратор
    product = await signUp('product@example.com');
    other = await signUp('other@example.com');
    await admin.call('PATCH', `/api/users/${product.id}`, { role: 'product' });
    await admin.call('PATCH', `/api/users/${other.id}`, { role: 'product' });
    const projects = (await admin.call('GET', '/api/projects')).json;
    expect(projects[0].ownerId).toBe('u1');
    const members = (await admin.call('GET', '/api/members')).json as ProjectMember[];
    expect(members.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
    expect((await app.inject({ url: '/api/members' })).statusCode).toBe(401);
  });

  it('продакт не участник проекта не меняет порядок и состав, участник — меняет', async () => {
    const view = await currentView(admin);
    const issue = view.issues.find((i) => i.sprintId === null && i.type === 'Task');
    if (!issue) throw new Error('нет задачи в бэклоге');
    const move = must(
      moveIssue(view, issue.id, { sprintId: 's3', index: 0 }, product.id, testCtx()),
    );

    const denied = await product.call('POST', '/api/commit', move);
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.json)).toContain('только в своих проектах');

    // администратор добавляет продакта участником проекта
    const add = must(addMember(view, { personId: product.id, role: 'product' }, testCtx()));
    expect((await admin.call('POST', '/api/commit', add)).status).toBe(204);
    expect((await product.call('POST', '/api/commit', move)).status).toBe(204);
  });

  it('участников меняют администратор и владелец проекта; чужой продакт — нет', async () => {
    const view = await currentView(admin);
    const add = must(addMember(view, { personId: other.id, role: 'developer' }, testCtx()));
    expect((await other.call('POST', '/api/commit', add)).status).toBe(403);
    // product — участник, но не владелец: тоже нет
    expect((await product.call('POST', '/api/commit', add)).status).toBe(403);
    expect((await admin.call('POST', '/api/commit', add)).status).toBe(204);

    const members = (await admin.call('GET', '/api/members')).json as ProjectMember[];
    const mine = members.find((m) => m.personId === other.id);
    expect(mine).toBeDefined();
    const fresh = await currentView(admin);
    const remove = must(removeMember(fresh, mine?.id ?? ''));
    expect((await other.call('POST', '/api/commit', remove)).status).toBe(403);
    expect((await admin.call('POST', '/api/commit', remove)).status).toBe(204);
    expect(
      ((await admin.call('GET', '/api/members')).json as ProjectMember[]).some(
        (m) => m.personId === other.id,
      ),
    ).toBe(false);
  });

  it('владельца проекта меняет только администратор, прежний остаётся участником', async () => {
    const view = await currentView(admin);
    const change = must(setOwner(view, product.id, testCtx()));
    expect((await product.call('POST', '/api/commit', change)).status).toBe(403);
    expect((await admin.call('POST', '/api/commit', change)).status).toBe(204);
    const projects = (await admin.call('GET', '/api/projects')).json;
    expect(projects[0].ownerId).toBe(product.id);
    const members = (await admin.call('GET', '/api/members')).json as ProjectMember[];
    expect(members.find((m) => m.personId === 'u1')).toMatchObject({ role: 'product' });
    // новый владелец уже не числится участником, но по-прежнему может менять участников
    expect(members.some((m) => m.personId === product.id)).toBe(false);
    const again = must(
      addMember(await currentView(admin), { personId: other.id, role: 'lead' }, testCtx()),
    );
    expect((await product.call('POST', '/api/commit', again)).status).toBe(204);
  });

  it('отклоняет повтор участника и неизвестного человека', async () => {
    const view = await currentView(admin);
    const dup = { members: [{ id: 'dup-1', projectId: 'p1', personId: 'u2', role: 'developer' }] };
    expect((await admin.call('POST', '/api/commit', dup)).status).toBeGreaterThanOrEqual(400);
    const ghost = {
      members: [{ id: 'ghost-1', projectId: 'p1', personId: 'нет', role: 'developer' }],
    };
    expect((await admin.call('POST', '/api/commit', ghost)).status).toBeGreaterThanOrEqual(400);
    expect(view.members.length).toBeGreaterThan(0);
  });
});

describe('сохранённый выбор проектов', () => {
  it('сохраняется в профиле и приходит при входе; гамма не сбрасывает его', async () => {
    const user = await signUp('filter@example.com');
    expect((await user.call('GET', '/api/auth/me')).json.projectFilter).toBeNull();

    const pref = { mode: 'custom', keys: ['DEMO'] };
    const saved = await user.call('PATCH', '/api/auth/preferences', { projectFilter: pref });
    expect(saved.status).toBe(200);
    expect(saved.json.projectFilter).toEqual(pref);
    expect((await user.call('GET', '/api/auth/me')).json.projectFilter).toEqual(pref);

    await user.call('PATCH', '/api/auth/preferences', { palette: 'blue' });
    const me = (await user.call('GET', '/api/auth/me')).json;
    expect(me.palette).toBe('blue');
    expect(me.projectFilter).toEqual(pref);

    await user.call('PATCH', '/api/auth/preferences', { projectFilter: null });
    expect((await user.call('GET', '/api/auth/me')).json.projectFilter).toBeNull();
  });

  it('отклоняет неверные значения и пустое тело', async () => {
    const user = await signUp('filter2@example.com');
    for (const bad of [
      {},
      { projectFilter: { mode: 'все', keys: [] } },
      { projectFilter: { mode: 'custom', keys: ['demo'] } },
      { projectFilter: 'DEMO' },
    ]) {
      expect((await user.call('PATCH', '/api/auth/preferences', bad)).status).toBe(422);
    }
  });
});
