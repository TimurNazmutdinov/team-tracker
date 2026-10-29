import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { updateIssue } from '../../src/domain/actions';
import { generateLoadData } from '../../src/domain/loadgen';
import type { Dataset } from '../../src/domain/schema';
import { testCtx, viewOf } from '../../src/domain/testing';
import { buildApp } from './app';
import { openPglite, type Connection } from './db';
import { importDataset } from './seed';

// Сервер на нагрузочных данных (10 000 задач, ~38 000 записей истории): чтение и запись быстрее секунды
// (ADR-015). Раньше одна запись разбирала всю базу (≈ 1,2 с), а загрузка падала на большой вставке.

const BUDGET_MS = 1000;

let connection: Connection;
let app: FastifyInstance;
let ds: Dataset;
let cookie = '';
let userId = '';

beforeAll(async () => {
  ds = generateLoadData();
  connection = await openPglite();
  await importDataset(connection.db, ds);
  app = buildApp({ db: connection.db, allowRegistration: true });
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'load@example.com', password: 'secret-pass', name: 'Нагрузка' },
  });
  cookie = `tt_session=${res.cookies[0]?.value ?? ''}`;
  userId = (res.json() as { id: string }).id;
}, 180_000);

afterAll(async () => {
  await app.close();
  await connection.close();
});

async function timed(url: string): Promise<{ ms: number; body: unknown[] }> {
  const start = performance.now();
  const res = await app.inject({ method: 'GET', url, headers: { cookie } });
  const ms = performance.now() - start;
  expect(res.statusCode).toBe(200);
  return { ms, body: res.json() as unknown[] };
}

describe('сервер на 10 000 задач', () => {
  it('загрузил все данные порциями', async () => {
    const issues = await timed('/api/projects/p1/issues');
    expect(issues.body).toHaveLength(ds.issues.filter((i) => i.projectId === 'p1').length);
    const projects = await timed('/api/projects');
    expect(projects.body).toHaveLength(ds.projects.length);
  });

  it('читает данные проекта для доски, планирования и отчётов быстрее секунды', async () => {
    for (const url of [
      '/api/projects/p1/sprints',
      '/api/projects/p1/issues',
      '/api/projects/p1/links',
      '/api/projects/p1/history',
    ]) {
      const { ms } = await timed(url);
      expect(ms, url).toBeLessThan(BUDGET_MS);
    }
  });

  it('записывает изменение быстрее секунды: проверка ограничена затронутым проектом', async () => {
    const view = viewOf(ds, 'p1');
    const issue = view.issues.find((i) => i.type === 'Task' && i.sprintId === null);
    if (!issue) throw new Error('нет задачи в бэклоге');
    const change = updateIssue(view, issue.id, { priority: 'Highest' }, userId, testCtx());
    if (!change.ok) throw new Error(JSON.stringify(change.errors));
    const start = performance.now();
    const res = await app.inject({
      method: 'POST',
      url: '/api/commit',
      headers: { cookie },
      payload: change.changes,
    });
    const ms = performance.now() - start;
    expect(res.statusCode).toBe(204);
    expect(ms).toBeLessThan(BUDGET_MS);
    const saved = (await timed('/api/projects/p1/issues')).body as {
      id: string;
      priority: string;
    }[];
    expect(saved.find((i) => i.id === issue.id)?.priority).toBe('Highest');
  });

  it('по-прежнему отклоняет нарушение целостности в своём проекте', async () => {
    const view = viewOf(ds, 'p1');
    const sub = view.issues.find((i) => i.type === 'Sub-task' && i.sprintId !== null);
    if (!sub) throw new Error('нет подзадачи в спринте');
    // Sub-task обязана быть в спринте родителя: переносим только её
    const res = await app.inject({
      method: 'POST',
      url: '/api/commit',
      headers: { cookie },
      payload: { issues: [{ ...sub, sprintId: null }] },
    });
    expect(res.statusCode).toBe(422);
  });
});
