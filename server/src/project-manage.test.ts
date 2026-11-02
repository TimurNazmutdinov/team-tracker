import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/actions';
import {
  archiveProject,
  deleteProject,
  restoreProject,
  updateProject,
} from '../../src/domain/projects';
import type { Dataset, Project } from '../../src/domain/schema';
import { testCtx } from '../../src/domain/testing';
import { buildApp } from './app';
import { openPglite, type Connection } from './db';
import { importDataset, readSeedFile } from './seed';

// Управление проектами на вкладке «Портфель» (ADR-023): создание, смена названия и ключа, архив, удаление.

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
async function signUp(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'secret-pass', name: email.split('@')[0] },
  });
  const cookie = `tt_session=${res.cookies[0]?.value ?? ''}`;
  return async (method: 'GET' | 'POST', url: string, body?: unknown) => {
    const r = await app.inject({ method, url, headers: { cookie }, payload: body as object });
    return { status: r.statusCode, json: r.body ? (JSON.parse(r.body) as any) : null };
  };
}

describe('управление проектами на сервере', () => {
  let admin: Awaited<ReturnType<typeof signUp>>;
  let dev: Awaited<ReturnType<typeof signUp>>;
  let created: Project;

  beforeAll(async () => {
    admin = await signUp('admin@example.com'); // первая учётка — администратор
    dev = await signUp('dev@example.com');
  });

  const projects = async () => (await admin('GET', '/api/projects')).json as Project[];

  it('администратор создаёт проект с владельцем; шаблоны по умолчанию создаются', async () => {
    const r = createProject(
      await projects(),
      { key: 'NEW', name: 'Новый', ownerId: 'u1' },
      testCtx(),
    );
    if (!r.ok) throw new Error('ожидался успех');
    expect((await admin('POST', '/api/commit', r.changes)).status).toBe(204);
    created = (await projects()).find((p) => p.key === 'NEW') as Project;
    expect(created).toMatchObject({ ownerId: 'u1', archivedAt: null });
    const templates = (await admin('GET', '/api/templates')).json as { projectId: string }[];
    expect(templates.filter((t) => t.projectId === created.id)).toHaveLength(3);
  });

  it('разработчик проекты менять не может', async () => {
    const r = archiveProject(created, '2026-11-02T10:00:00Z');
    if (!r.ok) throw new Error('ожидался успех');
    expect((await dev('POST', '/api/commit', r.changes)).status).toBe(403);
    const del = deleteProject(created, 0);
    if (!del.ok) throw new Error('ожидался успех');
    expect((await dev('POST', '/api/commit', del.changes)).status).toBe(403);
  });

  it('смена названия и ключа, архив и возврат', async () => {
    const rename = updateProject(await projects(), created.id, { key: 'NEWX', name: 'Новый 2' });
    if (!rename.ok) throw new Error('ожидался успех');
    expect((await admin('POST', '/api/commit', rename.changes)).status).toBe(204);
    let now = (await projects()).find((p) => p.id === created.id) as Project;
    expect(now).toMatchObject({ key: 'NEWX', name: 'Новый 2' });

    const arch = archiveProject(now, '2026-11-02T10:00:00Z');
    if (!arch.ok) throw new Error('ожидался успех');
    expect((await admin('POST', '/api/commit', arch.changes)).status).toBe(204);
    now = (await projects()).find((p) => p.id === created.id) as Project;
    expect(now.archivedAt).toBe('2026-11-02T10:00:00Z');

    const back = restoreProject(now);
    if (!back.ok) throw new Error('ожидался успех');
    expect((await admin('POST', '/api/commit', back.changes)).status).toBe(204);
    expect(((await projects()).find((p) => p.id === created.id) as Project).archivedAt).toBeNull();
  });

  it('проект с задачами удалить нельзя, пустой — можно, вместе с шаблонами', async () => {
    const busy = deleteProject(seed.projects[0] as Project, 0);
    if (!busy.ok) throw new Error('ожидался успех');
    expect((await admin('POST', '/api/commit', busy.changes)).status).toBe(409);

    const empty = deleteProject(created, 0);
    if (!empty.ok) throw new Error('ожидался успех');
    expect((await admin('POST', '/api/commit', empty.changes)).status).toBe(204);
    expect((await projects()).some((p) => p.id === created.id)).toBe(false);
    const templates = (await admin('GET', '/api/templates')).json as { projectId: string }[];
    expect(templates.some((t) => t.projectId === created.id)).toBe(false);
  });
});
