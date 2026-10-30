import { z } from 'zod';
import { myProjects } from './members';
import type { Project, ProjectMember } from './schema';

// Выбор проектов («фильтр по проектам», ADR-016): какие проекты показывают доска, планирование,
// «Прошлые спринты», отчёты и «Портфель». Чистая логика: разбор адреса, сохранённый выбор, набор проектов.

export const SCOPE_MODES = ['mine', 'all', 'custom'] as const;
export type ScopeMode = (typeof SCOPE_MODES)[number];

/** Выбор: «мои», «все» или перечень ключей проектов. */
export const scopePrefSchema = z.object({
  mode: z.enum(SCOPE_MODES),
  /** Ключи проектов при mode = custom. */
  keys: z.array(z.string().regex(/^[A-Z]{2,10}$/)).max(200),
});
export type ScopePref = z.infer<typeof scopePrefSchema>;

export const MINE: ScopePref = { mode: 'mine', keys: [] };
export const ALL: ScopePref = { mode: 'all', keys: [] };

export function customPref(keys: string[]): ScopePref {
  return { mode: 'custom', keys: [...new Set(keys)] };
}

/** Значение параметра адреса `projects`: `mine`, `all` или ключи через запятую. */
export function parseScopeParam(param: string | null): ScopePref | null {
  if (param === null) return null;
  const value = param.trim();
  if (value === 'mine') return MINE;
  if (value === 'all') return ALL;
  const keys = value
    .split(',')
    .map((k) => k.trim())
    .filter((k) => /^[A-Z]{2,10}$/.test(k));
  return keys.length > 0 ? customPref(keys) : null;
}

export function scopeParam(pref: ScopePref): string {
  return pref.mode === 'custom' ? pref.keys.join(',') : pref.mode;
}

/** Разбор сохранённого значения (JSON); повреждённое считается «не сохранено». */
export function parseStoredPref(raw: string | null | undefined): ScopePref | null {
  if (!raw) return null;
  try {
    const parsed = scopePrefSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface ScopeInput {
  projects: Project[];
  members: ProjectMember[];
  /** Текущий пользователь (для «Мои проекты»). */
  personId: string | null;
  /** Выбор из адреса страницы. */
  fromUrl: ScopePref | null;
  /** Сохранённый выбор пользователя. */
  saved: ScopePref | null;
  /** Проект из адреса `/projects/:key/…`: выбор по умолчанию, пока ничего не выбрано. */
  current: Project | undefined;
}

export interface Scope {
  pref: ScopePref;
  projects: Project[];
  /** Откуда взят выбор. */
  source: 'url' | 'saved' | 'current' | 'default';
}

const byKey = (a: Project, b: Project) => a.key.localeCompare(b.key);

/** Проекты по выбору. Адрес важнее сохранённого выбора, сохранённый — важнее проекта из адреса. */
export function resolveScope(input: ScopeInput): Scope {
  const { projects, members, personId, current } = input;
  let source: Scope['source'];
  let pref: ScopePref;
  if (input.fromUrl) {
    pref = input.fromUrl;
    source = 'url';
  } else if (input.saved) {
    pref = input.saved;
    source = 'saved';
  } else if (current) {
    pref = customPref([current.key]);
    source = 'current';
  } else {
    pref = MINE;
    source = 'default';
  }

  let list: Project[];
  if (pref.mode === 'all') list = projects;
  else if (pref.mode === 'mine') list = myProjects(projects, members, personId);
  else list = projects.filter((p) => pref.keys.includes(p.key));
  // Выбранных проектов уже нет (удалены, ключ из чужой ссылки): остаётся проект из адреса
  if (list.length === 0 && pref.mode === 'custom' && current) list = [current];
  return { pref, projects: [...list].sort(byKey), source };
}

/** Подпись кнопки фильтра: «Мои (2)», «Все (5)», «DEMO», «DEMO, SHOP», «3 проекта». */
export function scopeLabel(scope: Scope, total: number): string {
  const n = scope.projects.length;
  if (scope.pref.mode === 'mine') return `Мои (${n})`;
  if (scope.pref.mode === 'all' || (n === total && total > 1)) return `Все (${n})`;
  if (n === 0) return 'Не выбраны';
  if (n <= 2) return scope.projects.map((p) => p.key).join(', ');
  return `${n} ${n >= 5 ? 'проектов' : 'проекта'}`;
}
