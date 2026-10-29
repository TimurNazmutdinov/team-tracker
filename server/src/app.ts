import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PALETTES } from '../../src/domain/palettes';
import { ROLES, can } from '../../src/domain/permissions';
import * as auth from './auth';
import { changesSchema } from './changes-schema';
import type { Db } from './db';
import { HttpError } from './errors';
import { checkBackupDir, listFolders } from './backups/folders';
import type { BackupService } from './backups/service';
import { commit, findIssueByNumber, readers } from './repo';
import { BACKUP_DIR_KEY, setSetting } from './settings';

const COOKIE = 'tt_session';

export interface AppOptions {
  db: Db;
  /** Каталог собранного приложения (dist); если он есть, сервер отдаёт его же. */
  staticDir?: string;
  /** Резервные копии: если задан, появляются маршруты `/api/admin/backups` (только администратор). */
  backups?: BackupService;
  /** Папка данных встроенной базы: копии не должны лежать внутри неё. */
  dataDir?: string;
  /** Открыта ли самостоятельная регистрация; по умолчанию закрыта (ADR-011). */
  allowRegistration?: boolean;
  /** Ставить cookie только по HTTPS (включать за HTTPS-прокси). */
  secureCookies?: boolean;
  logger?: boolean;
}

const credentials = z.object({ email: z.string(), password: z.string() });
const registration = credentials.extend({ name: z.string() });
const roleBody = z.object({ role: z.enum(ROLES) });
const preferencesBody = z.object({ palette: z.enum(PALETTES) });
const newAccountBody = registration.extend({ role: z.enum(ROLES).optional() });
const passwordBody = z.object({ password: z.string() });
const changePasswordBody = z.object({ current: z.string(), next: z.string() });

/** Простая защита от перебора пароля: не больше MAX_FAILS неудач на почту за окно. */
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

export function buildApp(options: AppOptions): FastifyInstance {
  const { db } = options;
  const app = Fastify({ logger: options.logger ?? false });
  const fails = new Map<string, number[]>();

  void app.register(cookie);

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.status).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply
        .status(status)
        .send({ error: { code: 'bad_request', message: 'Некорректный запрос', details: [] } });
    }
    app.log.error(error);
    return reply
      .status(500)
      .send({ error: { code: 'server_error', message: 'Ошибка сервера', details: [] } });
  });

  const setSession = (reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: options.secureCookies ?? false,
      path: '/',
      maxAge: auth.SESSION_DAYS * 24 * 3600,
    });

  /**
   * Пользователь по cookie. Пока пароль временный (его выдал администратор), доступна только
   * смена пароля: `allowTemporaryPassword`.
   */
  async function requireUser(
    req: FastifyRequest,
    allowTemporaryPassword = false,
  ): Promise<auth.Account> {
    const account = await auth.accountByToken(db, req.cookies[COOKIE]);
    if (!account) throw new HttpError(401, 'unauthorized', 'Войдите в систему');
    if (account.mustChangePassword && !allowTemporaryPassword) {
      throw new HttpError(403, 'password_change_required', 'Смените временный пароль');
    }
    return account;
  }

  function parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const r = schema.safeParse(body);
    if (!r.success) {
      throw new HttpError(
        422,
        'invalid_data',
        'Некорректные данные',
        r.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(корень)'}: ${i.message}`),
      );
    }
    return r.data;
  }

  // ---------------------------------------------------------------- вход

  // Публичные настройки для экрана входа
  app.get('/api/config', async () => ({
    registration: options.allowRegistration ?? false,
    needsAdmin: (await auth.countAccounts(db)) === 0,
  }));

  app.post('/api/auth/register', async (req, reply) => {
    if (!(options.allowRegistration ?? false)) {
      throw new HttpError(
        403,
        'registration_closed',
        'Регистрация закрыта: учётки создаёт администратор',
      );
    }
    const body = parse(registration, req.body);
    const { account, token } = await auth.register(db, body);
    setSession(reply, token);
    return reply.status(201).send(account);
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = parse(credentials, req.body);
    const key = auth.normalizeEmail(body.email);
    const now = Date.now();
    const recent = (fails.get(key) ?? []).filter((at) => now - at < FAIL_WINDOW_MS);
    if (recent.length >= MAX_FAILS) {
      throw new HttpError(429, 'too_many_attempts', 'Слишком много попыток: подождите 15 минут');
    }
    try {
      const { account, token } = await auth.login(db, body);
      fails.delete(key);
      setSession(reply, token);
      return account;
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        // Старые записи убираем, чтобы карта не росла бесконечно
        for (const [email, times] of fails)
          if (times.every((at) => now - at >= FAIL_WINDOW_MS)) fails.delete(email);
        fails.set(key, [...recent, now]);
      }
      throw e;
    }
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) await auth.logout(db, token);
    reply.clearCookie(COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/api/auth/me', async (req) => requireUser(req, true));

  // Настройки профиля (цветовая гамма): доступны и до смены временного пароля
  app.patch('/api/auth/preferences', async (req) => {
    const me = await requireUser(req, true);
    const { palette } = parse(preferencesBody, req.body);
    await auth.setPalette(db, me.id, palette);
    return { ...me, palette };
  });

  app.post('/api/auth/password', async (req, reply) => {
    const me = await requireUser(req, true);
    const body = parse(changePasswordBody, req.body);
    setSession(reply, await auth.changePassword(db, me.id, body.current, body.next));
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------- учётки (администратор)

  app.get('/api/users', async (req) => {
    const me = await requireUser(req);
    const accounts = await auth.listAccounts(db);
    // Почты видит только администратор
    return accounts.map((a) => ({ ...a, email: can(me.role, 'users.manage') ? a.email : null }));
  });

  // Администратор создаёт участника с временным паролем; при первом входе его нужно сменить
  app.post('/api/users', async (req, reply) => {
    const me = await requireUser(req);
    if (!can(me.role, 'users.manage')) {
      throw new HttpError(403, 'forbidden', 'Создавать учётки может только администратор');
    }
    const body = parse(newAccountBody, req.body);
    const account = await auth.createAccount(db, {
      ...body,
      role: body.role ?? 'developer',
      mustChangePassword: true,
    });
    return reply.status(201).send(account);
  });

  app.post<{ Params: { id: string } }>('/api/users/:id/password', async (req, reply) => {
    const me = await requireUser(req);
    if (!can(me.role, 'users.manage')) {
      throw new HttpError(403, 'forbidden', 'Выдавать пароли может только администратор');
    }
    await auth.resetPassword(db, req.params.id, parse(passwordBody, req.body).password);
    return reply.status(204).send();
  });

  app.patch<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    const me = await requireUser(req);
    if (!can(me.role, 'users.manage')) {
      throw new HttpError(403, 'forbidden', 'Менять роли может только администратор');
    }
    await auth.setRole(db, req.params.id, parse(roleBody, req.body).role);
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------- резервные копии (ADR-012)

  const backups = options.backups;
  if (backups) {
    const adminOnly = async (req: FastifyRequest) => {
      const me = await requireUser(req);
      if (!can(me.role, 'backups.manage')) {
        throw new HttpError(403, 'forbidden', 'Резервные копии доступны только администратору');
      }
      return me;
    };

    app.get('/api/admin/backups', async (req) => {
      await adminOnly(req);
      return backups.status();
    });

    // Копия не останавливает трекер; результат (в том числе ошибка) виден в состоянии
    app.post('/api/admin/backups', async (req) => {
      await adminOnly(req);
      try {
        await backups.run('вручную');
      } catch (e) {
        if (e instanceof HttpError) throw e;
      }
      return backups.status();
    });

    app.get('/api/admin/backups/excel', async (req, reply) => {
      await adminOnly(req);
      const latest = backups.latestXlsx();
      if (!latest) throw new HttpError(404, 'not_found', 'Копий с Excel-файлом пока нет');
      return reply
        .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header(
          'content-disposition',
          `attachment; filename="tracker.xlsx"; filename*=UTF-8''tracker-${latest.bundle}.xlsx`,
        )
        .send(readFileSync(latest.path));
    });

    app.get<{ Querystring: { path?: string } }>('/api/admin/backups/folders', async (req) => {
      await adminOnly(req);
      return listFolders(req.query.path);
    });

    // Выбор папки для копий: проверка, сохранение и первая копия, чтобы сразу увидеть, что всё работает
    app.put('/api/admin/backups/dir', async (req) => {
      await adminOnly(req);
      const body = parse(z.object({ dir: z.string() }), req.body);
      const dir = checkBackupDir(body.dir, options.dataDir ?? '');
      await setSetting(db, BACKUP_DIR_KEY, dir);
      backups.setDir(dir);
      try {
        await backups.run('смена папки');
      } catch (e) {
        if (e instanceof HttpError) throw e;
      }
      return backups.status();
    });
  }

  // ---------------------------------------------------------------- данные

  app.get('/api/projects', async (req) => (await requireUser(req), readers.projects(db)));
  app.get('/api/people', async (req) => (await requireUser(req), readers.people(db)));

  app.get<{ Params: { id: string } }>('/api/projects/:id/sprints', async (req) => {
    await requireUser(req);
    return readers.sprints(db, req.params.id);
  });
  app.get<{ Params: { id: string } }>('/api/projects/:id/issues', async (req) => {
    await requireUser(req);
    return readers.issues(db, req.params.id);
  });
  app.get<{ Params: { id: string; number: string } }>(
    '/api/projects/:id/issues/:number',
    async (req) => {
      await requireUser(req);
      const number = Number(req.params.number);
      const issue = Number.isSafeInteger(number)
        ? await findIssueByNumber(db, req.params.id, number)
        : null;
      if (!issue) throw new HttpError(404, 'not_found', 'Задача не найдена');
      return issue;
    },
  );
  app.get<{ Params: { id: string } }>('/api/projects/:id/links', async (req) => {
    await requireUser(req);
    return readers.links(db, req.params.id);
  });
  app.get<{ Params: { id: string } }>('/api/projects/:id/history', async (req) => {
    await requireUser(req);
    return readers.projectHistory(db, req.params.id);
  });
  app.get<{ Params: { id: string } }>('/api/issues/:id/comments', async (req) => {
    await requireUser(req);
    return readers.comments(db, req.params.id);
  });
  app.get<{ Params: { id: string } }>('/api/issues/:id/history', async (req) => {
    await requireUser(req);
    return readers.history(db, req.params.id);
  });

  app.post('/api/commit', async (req, reply) => {
    const me = await requireUser(req);
    await commit(db, me, parse(changesSchema, req.body));
    return reply.status(204).send();
  });

  app.get('/api/health', () => ({ status: 'ok' }));

  // ---------------------------------------------------------------- приложение

  const staticDir = options.staticDir ? resolve(options.staticDir) : undefined;
  if (staticDir && existsSync(resolve(staticDir, 'index.html'))) {
    void app.register(fastifyStatic, { root: staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply
        .status(404)
        .send({ error: { code: 'not_found', message: 'Не найдено', details: [] } });
    });
  }

  return app;
}
