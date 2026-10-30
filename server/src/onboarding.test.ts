import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { openPglite, type Connection } from './db';
import { importDataset, readSeedFile } from './seed';

// Мастер первого запуска: признак «пройден» хранится на сервере, менять его может только администратор (ADR-020).

let connection: Connection;
let app: FastifyInstance;

beforeAll(async () => {
  connection = await openPglite();
  await importDataset(connection.db, readSeedFile('data/seed.json'));
  app = buildApp({ db: connection.db, allowRegistration: true });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await connection.close();
});

async function signUp(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'secret-pass', name: email.split('@')[0] },
  });
  const cookie = `tt_session=${res.cookies[0]?.value ?? ''}`;
  return (method: 'GET' | 'PUT', body?: unknown) =>
    app.inject({ method, url: '/api/onboarding', headers: { cookie }, payload: body as object });
}

describe('мастер первого запуска на сервере', () => {
  it('без входа недоступен', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/onboarding' })).statusCode).toBe(401);
  });

  it('по умолчанию не пройден; администратор отмечает пройденным и обратно', async () => {
    const admin = await signUp('admin@example.com'); // первая учётка — администратор
    expect((await admin('GET')).json()).toEqual({ done: false });
    expect((await admin('PUT', { done: 'да' })).statusCode).toBe(422);
    expect((await admin('PUT', { done: true })).json()).toEqual({ done: true });
    expect((await admin('GET')).json()).toEqual({ done: true });
    expect((await admin('PUT', { done: false })).json()).toEqual({ done: false });
  });

  it('другие роли читают признак, но менять его не могут', async () => {
    const dev = await signUp('dev@example.com');
    expect((await dev('GET')).statusCode).toBe(200);
    expect((await dev('PUT', { done: true })).statusCode).toBe(403);
  });
});
