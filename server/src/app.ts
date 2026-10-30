import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PALETTES } from '../../src/domain/palettes';
import { can, type Action } from '../../src/domain/permissions';
import { scopePrefSchema } from '../../src/domain/projectScope';
import * as auth from './auth';
import { changesSchema } from './changes-schema';
import type { Db } from './db';
import { HttpError } from './errors';
import { checkBackupDir, listFolders } from './backups/folders';
import type { BackupService } from './backups/service';
import { buildDiagnostics, type AboutInfo } from './about';
import type { LogStore } from './logs';
import { commit, findIssueByNumber, readers } from './repo';
import { BACKUP_DIR_KEY, ONBOARDING_KEY, getSetting, setSetting } from './settings';

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
  /** Журналы ошибок в DATA_DIR/logs; без них журнал и диагностика недоступны. */
  logs?: LogStore;
  /** Сведения о программе для экрана «О программе» и диагностики. */
  about?: AboutInfo;
  /** Настройки без секретов для архива диагностики. */
  settings?: Record<string, string | number | boolean>;
  /** Ставить cookie только по HTTPS (включать за HTTPS-прокси). */
  secureCookies?: boolean;
  logger?: boolean;
}

const credentials = z.object({ email: z.string(), password: z.string() });
const registration = credentials.extend({ name: z.string() });
const roleBody = z.object({ role: z.string().min(1) });
const preferencesBody = z
  .object({ palette: z.enum(PALETTES), projectFilter: scopePrefSchema.nullable() })
  .partial()
  .refine((b) => b.palette !== undefined || b.projectFilter !== undefined, {
    message: 'Нужно хотя бы одно поле',
  });
const newAccountBody = registration.extend({ role: z.string().min(1).optional() });
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
    const path = `${_req.method} ${_req.url.split('?')[0] ?? ''}`;
    const err = error instanceof Error ? error : new Error(String(error));
    options.logs?.write('server', {
      message: `${path}: ${err.message}`,
      stack: err.stack,
      where: path,
    });
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

  /** Разрешено ли действие роли пользователя по актуальной таблице ролей (ADR-021). */
  async function may(me: auth.Account, action: Action): Promise<boolean> {
    return can(await readers.roles(db), me.role, action);
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
    const body = parse(preferencesBody, req.body);
    let next = me;
    if (body.palette !== undefined) {
      await auth.setPalette(db, me.id, body.palette);
      next = { ...next, palette: body.palette };
    }
    if (body.projectFilter !== undefined) {
      await auth.setProjectFilter(db, me.id, body.projectFilter);
      next = { ...next, projectFilter: body.projectFilter };
    }
    return next;
  });

  app.post('/api/auth/password', async (req, reply) => {
    const me = await requireUser(req, true);
    const body = parse(changePasswordBody, req.body);
    setSession(reply, await auth.changePassword(db, me.id, body.current, body.next));
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------- мастер первого запуска (ADR-020)

  app.get('/api/onboarding', async (req) => {
    await requireUser(req);
    return { done: (await getSetting(db, ONBOARDING_KEY)) === 'done' };
  });

  app.put('/api/onboarding', async (req) => {
    const me = await requireUser(req);
    if (!(await may(me, 'users.manage'))) {
      throw new HttpError(403, 'forbidden', 'Мастер первого запуска настраивает администратор');
    }
    const body = parse(z.object({ done: z.boolean() }), req.body);
    await setSetting(db, ONBOARDING_KEY, body.done ? 'done' : 'pending');
    return { done: body.done };
  });

  // ---------------------------------------------------------------- учётки (администратор)

  app.get('/api/users', async (req) => {
    const me = await requireUser(req);
    const accounts = await auth.listAccounts(db);
    // Почты видит только администратор
    const seesEmail = await may(me, 'users.manage');
    return accounts.map((a) => ({ ...a, email: seesEmail ? a.email : null }));
  });

  // Администратор создаёт участника с временным паролем; при первом входе его нужно сменить
  app.post('/api/users', async (req, reply) => {
    const me = await requireUser(req);
    if (!(await may(me, 'users.manage'))) {
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
    if (!(await may(me, 'users.manage'))) {
      throw new HttpError(403, 'forbidden', 'Выдавать пароли может только администратор');
    }
    await auth.resetPassword(db, req.params.id, parse(passwordBody, req.body).password);
    return reply.status(204).send();
  });

  app.patch<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    const me = await requireUser(req);
    if (!(await may(me, 'users.manage'))) {
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
      if (!(await may(me, 'backups.manage'))) {
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

  // ---------------------------------------------------------------- о программе и журнал ошибок (ADR-015)

  app.get('/api/about', async (req) => {
    await requireUser(req);
    return options.about ?? null;
  });

  // Ошибки клиента: принимаются и до входа, но ограничены по размеру и частоте
  const clientErrorBody = z.object({
    message: z.string().max(2000),
    stack: z.string().max(6000).optional(),
    where: z.string().max(300).optional(),
  });
  const clientErrorTimes: number[] = [];
  app.post('/api/client-errors', async (req, reply) => {
    const body = parse(clientErrorBody, req.body);
    const now = Date.now();
    while (clientErrorTimes.length > 0 && now - (clientErrorTimes[0] ?? 0) > 60_000) {
      clientErrorTimes.shift();
    }
    if (clientErrorTimes.length >= 60) return reply.status(429).send();
    clientErrorTimes.push(now);
    options.logs?.write('client', body);
    return reply.status(204).send();
  });

  const diagnoseOnly = async (req: FastifyRequest) => {
    const me = await requireUser(req);
    if (!(await may(me, 'system.diagnose'))) {
      throw new HttpError(403, 'forbidden', 'Журнал и диагностика доступны только администратору');
    }
    return me;
  };

  app.get<{ Querystring: { limit?: string } }>('/api/admin/log', async (req) => {
    await diagnoseOnly(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    return options.logs?.recent(limit) ?? [];
  });

  app.get('/api/admin/diagnostics', async (req, reply) => {
    await diagnoseOnly(req);
    if (!options.about) throw new HttpError(404, 'not_found', 'Диагностика недоступна');
    const zip = buildDiagnostics({
      about: options.about,
      settings: options.settings ?? {},
      backups: options.backups?.status() ?? null,
      logs: options.logs ?? null,
    });
    const day = new Date().toISOString().slice(0, 10);
    return reply
      .header('content-type', 'application/zip')
      .header('content-disposition', `attachment; filename="diagnostics-${day}.zip"`)
      .send(Buffer.from(zip));
  });

  // ---------------------------------------------------------------- данные

  app.get('/api/projects', async (req) => (await requireUser(req), readers.projects(db)));
  app.get('/api/people', async (req) => (await requireUser(req), readers.people(db)));
  app.get('/api/templates', async (req) => (await requireUser(req), readers.templates(db)));
  app.get('/api/roles', async (req) => (await requireUser(req), readers.roles(db)));
  app.get('/api/absences', async (req) => (await requireUser(req), readers.absences(db)));
  app.get('/api/members', async (req) => (await requireUser(req), readers.members(db)));

  app.get<{ Params: { id: string } }>('/api/projects/:id/retro', async (req) => {
    await requireUser(req);
    return readers.retroItems(db, req.params.id);
  });

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
