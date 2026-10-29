import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import readXlsxFile from 'read-excel-file/node';
import writeXlsxFile from 'write-excel-file/node';
import { ROLE_LABELS, isRole } from '../../../src/domain/permissions';
import { velocity } from '../../../src/domain/reports';
import type { Issue, Link, Sprint } from '../../../src/domain/schema';
import { FORMAT, countsOf, type AccountRecord, type Entities, type Snapshot } from './types';

// tracker.xlsx — копия для чтения человеком и запасной путь восстановления (ADR-012).
// Слева — читаемые колонки с русскими заголовками, в последних колонках — служебные id (по ним
// восстанавливаются связи). Даты хранятся текстом ISO, чтобы Excel их не «исправлял».

/** Предел Excel на длину текста в ячейке. */
const CELL_LIMIT = 32767;

const FIELD_LABELS: Record<string, string> = {
  created: 'Создание',
  status: 'Статус',
  assigneeId: 'Исполнитель',
  points: 'Points',
  sprintId: 'Спринт',
  title: 'Название',
  description: 'Описание',
  acceptance: 'Критерии',
  priority: 'Приоритет',
  parentId: 'Родитель',
  labels: 'Метки',
  dueDate: 'Срок',
};
const LINK_LABELS: Record<Link['type'], string> = {
  blocks: 'блокирует',
  relates: 'связана с',
  duplicates: 'дублирует',
};
const STATE_LABELS: Record<Sprint['state'], string> = {
  planned: 'запланирован',
  active: 'идёт',
  closed: 'закрыт',
};

export const SHEETS = {
  summary: 'Сводка',
  projects: 'Проекты',
  people: 'Люди',
  sprints: 'Спринты',
  issues: 'Задачи',
  links: 'Связи',
  comments: 'Комментарии',
  history: 'История',
} as const;

type Cell = string | number | null | undefined;

interface SheetSpec {
  name: string;
  /** Заголовки; служебные начинаются с `~` (в файле `~` убирается) и идут последними. */
  headers: string[];
  rows: Cell[][];
  widths: number[];
}

export interface XlsxMeta {
  createdAt: Date;
  reason: string;
  appVersion: string;
  schemaVersion: number | null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** ГГГГ-ММ-ДД ЧЧ:ММ:СС по местному времени. */
export function localStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function specs(snapshot: Snapshot, meta: XlsxMeta): SheetSpec[] {
  const { data, accounts } = snapshot;
  const project = new Map(data.projects.map((p) => [p.id, p]));
  const person = new Map(data.people.map((p) => [p.id, p]));
  const sprint = new Map(data.sprints.map((s) => [s.id, s]));
  const issue = new Map(data.issues.map((i) => [i.id, i]));
  const account = new Map(accounts.map((a) => [a.id, a]));
  const keyOf = (i: Issue | undefined) =>
    i ? `${project.get(i.projectId)?.key ?? '?'}-${i.number}` : '';
  const nameOf = (id: string | null) => (id ? (person.get(id)?.name ?? id) : '');

  // velocity закрытых спринтов считается так же, как в отчётах
  const bars = new Map<string, { velocity: number; scope: number }>();
  for (const p of data.projects) {
    const sprints = data.sprints.filter((s) => s.projectId === p.id);
    const issues = data.issues.filter((i) => i.projectId === p.id);
    for (const b of velocity(sprints, issues, data.history).bars) bars.set(b.sprintId, b);
  }

  const counts = countsOf(data);
  const summary: SheetSpec = {
    name: SHEETS.summary,
    headers: ['Параметр', 'Значение'],
    rows: [
      ['Дата копии', localStamp(meta.createdAt)],
      ['Причина', meta.reason],
      ['Версия трекера', meta.appVersion],
      ['Формат копии', FORMAT],
      ['Версия схемы базы', meta.schemaVersion],
      ['Проектов', counts.projects],
      ['Людей', counts.people],
      ['Учётных записей', accounts.length],
      ['Спринтов', counts.sprints],
      ['Задач', counts.issues],
      ['Связей', counts.links],
      ['Комментариев', counts.comments],
      ['Записей истории', counts.history],
    ],
    widths: [26, 40],
  };

  return [
    summary,
    {
      name: SHEETS.projects,
      headers: [
        'Ключ',
        'Название',
        'Длительность спринта, дн.',
        'Префикс спринта',
        'Номер следующего спринта',
        'Старт следующего спринта',
        '~id',
      ],
      rows: data.projects.map((p) => [
        p.key,
        p.name,
        p.sprintDurationDays,
        p.sprintPrefix,
        p.nextSprintNumber,
        p.nextSprintStart,
        p.id,
      ]),
      widths: [10, 30, 14, 16, 14, 16, 36],
    },
    {
      name: SHEETS.people,
      headers: ['Имя', 'Должность', 'Почта', 'Роль доступа', '~id', '~accessRole'],
      rows: data.people.map((p) => {
        const a = account.get(p.id);
        return [p.name, p.role, a?.email, a ? ROLE_LABELS[a.accessRole] : null, p.id, a?.accessRole];
      }),
      widths: [28, 24, 30, 24, 36, 14],
    },
    {
      name: SHEETS.sprints,
      headers: [
        'Проект',
        'Название',
        'Цель',
        'Старт',
        'Конец',
        'Состояние',
        'Закрыт (closedAt)',
        'Velocity, sp',
        'Объём, sp',
        '~id',
        '~projectId',
        '~state',
      ],
      rows: data.sprints.map((s) => {
        const bar = bars.get(s.id);
        return [
          project.get(s.projectId)?.key,
          s.name,
          s.goal,
          s.start,
          s.end,
          STATE_LABELS[s.state],
          s.closedAt,
          s.state === 'closed' ? bar?.velocity : null,
          s.state === 'planned' ? null : bar?.scope,
          s.id,
          s.projectId,
          s.state,
        ];
      }),
      widths: [10, 20, 40, 12, 12, 14, 22, 12, 12, 36, 36, 10],
    },
    {
      name: SHEETS.issues,
      headers: [
        'Ключ',
        'Тип',
        'Название',
        'Родитель (ключ)',
        'Статус',
        'Приоритет',
        'Points',
        'Исполнитель',
        'Автор',
        'Спринт',
        'Метки',
        'Срок',
        'Создана',
        'Обновлена',
        'Описание',
        'Критерии приёмки',
        '~id',
        '~projectId',
        '~number',
        '~parentId',
        '~assigneeId',
        '~reporterId',
        '~sprintId',
        '~order',
      ],
      rows: data.issues.map((i) => [
        keyOf(i),
        i.type,
        i.title,
        keyOf(i.parentId ? issue.get(i.parentId) : undefined),
        i.status,
        i.priority,
        i.points,
        nameOf(i.assigneeId),
        nameOf(i.reporterId),
        i.sprintId ? (sprint.get(i.sprintId)?.name ?? i.sprintId) : '',
        i.labels.join(', '),
        i.dueDate,
        i.createdAt,
        i.updatedAt,
        i.description,
        i.acceptance,
        i.id,
        i.projectId,
        i.number,
        i.parentId,
        i.assigneeId,
        i.reporterId,
        i.sprintId,
        i.order,
      ]),
      widths: [11, 10, 40, 14, 13, 11, 8, 20, 20, 16, 20, 12, 21, 21, 60, 50, 36, 36, 8, 36, 36, 36, 36, 8],
    },
    {
      name: SHEETS.links,
      headers: ['Тип связи', 'От (ключ)', 'К (ключ)', '~id', '~fromId', '~toId', '~type'],
      rows: data.links.map((l) => [
        LINK_LABELS[l.type],
        keyOf(issue.get(l.fromId)),
        keyOf(issue.get(l.toId)),
        l.id,
        l.fromId,
        l.toId,
        l.type,
      ]),
      widths: [14, 14, 14, 36, 36, 36, 12],
    },
    {
      name: SHEETS.comments,
      headers: ['Задача (ключ)', 'Автор', 'Дата', 'Текст', '~id', '~issueId', '~authorId'],
      rows: data.comments.map((c) => [
        keyOf(issue.get(c.issueId)),
        nameOf(c.authorId),
        c.createdAt,
        c.text,
        c.id,
        c.issueId,
        c.authorId,
      ]),
      widths: [14, 20, 21, 70, 36, 36, 36],
    },
    {
      name: SHEETS.history,
      headers: [
        'Задача (ключ)',
        'Дата',
        'Автор',
        'Что изменилось',
        'Было',
        'Стало',
        '~id',
        '~issueId',
        '~authorId',
        '~field',
        '~from',
        '~to',
      ],
      rows: data.history.map((h) => {
        // идентификаторы людей, спринтов и задач показываем названиями
        const show = (v: string | null) => {
          if (v === null) return '';
          if (h.field === 'assigneeId') return nameOf(v);
          if (h.field === 'sprintId') return sprint.get(v)?.name ?? v;
          if (h.field === 'parentId') return keyOf(issue.get(v)) || v;
          return v;
        };
        return [
          keyOf(issue.get(h.issueId)),
          h.at,
          nameOf(h.authorId),
          FIELD_LABELS[h.field] ?? h.field,
          show(h.from),
          show(h.to),
          h.id,
          h.issueId,
          h.authorId,
          h.field,
          h.from,
          h.to,
        ];
      }),
      widths: [14, 21, 20, 18, 40, 40, 36, 36, 36, 12, 36, 36],
    },
  ];
}

export interface BuiltXlsx {
  data: Uint8Array;
  /** Предупреждения: например, обрезанные слишком длинные ячейки. */
  warnings: string[];
}

/** Excel-файл копии: закреплённая первая строка, автофильтр, ширина колонок, русские заголовки. */
export async function buildXlsx(snapshot: Snapshot, meta: XlsxMeta): Promise<BuiltXlsx> {
  const sheets = specs(snapshot, meta);
  const warnings: string[] = [];
  let truncated = 0;

  const text = (v: string) => {
    if (v.length <= CELL_LIMIT) return v;
    truncated += 1;
    return `${v.slice(0, CELL_LIMIT - 20)}… [обрезано]`;
  };

  const file = await writeXlsxFile(
    sheets.map((s) => ({
      sheet: s.name,
      stickyRowsCount: 1,
      columns: s.widths.map((width) => ({ width })),
      data: [
        s.headers.map((h) => ({
          value: h.replace(/^~/, ''),
          type: String,
          fontWeight: 'bold' as const,
          backgroundColor: h.startsWith('~') ? '#e5e7eb' : '#dbeafe',
          alignVertical: 'center' as const,
        })),
        ...s.rows.map((row) =>
          row.map((v) =>
            v === null || v === undefined || v === ''
              ? null
              : typeof v === 'number'
                ? { value: v, type: Number }
                : { value: text(v), type: String, wrap: true, alignVertical: 'top' as const },
          ),
        ),
      ],
    })),
  ).toBuffer();

  if (truncated > 0) {
    warnings.push(`обрезано ячеек длиннее ${CELL_LIMIT} символов: ${truncated} (полный текст — в tracker.json)`);
  }
  return { data: addAutoFilters(new Uint8Array(file), sheets), warnings };
}

/** write-excel-file не умеет автофильтр: дописываем его в XML листов и имена фильтров в книгу. */
function addAutoFilters(xlsx: Uint8Array, sheets: SheetSpec[]): Uint8Array {
  const files = unzipSync(xlsx);
  const names: string[] = [];
  sheets.forEach((s, i) => {
    const path = `xl/worksheets/sheet${i + 1}.xml`;
    const xml = files[path];
    if (!xml) throw new Error(`в xlsx нет листа ${path}`);
    const ref = `A1:${columnLetter(s.headers.length - 1)}${s.rows.length + 1}`;
    files[path] = strToU8(strFromU8(xml).replace('</sheetData>', `</sheetData><autoFilter ref="${ref}"/>`));
    const abs = `$A$1:$${columnLetter(s.headers.length - 1)}$${s.rows.length + 1}`;
    names.push(
      `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${s.name}'!${abs}</definedName>`,
    );
  });
  const wb = files['xl/workbook.xml'];
  if (!wb) throw new Error('в xlsx нет workbook.xml');
  files['xl/workbook.xml'] = strToU8(
    strFromU8(wb).replace(/<definedNames\s*\/>/, `<definedNames>${names.join('')}</definedNames>`),
  );
  return zipSync(files);
}

// ---------------------------------------------------------------- чтение

type Row = Record<string, unknown>;

function sheetRows(sheets: { sheet: string; data: unknown[][] }[], name: string): Row[] {
  const sheet = sheets.find((s) => s.sheet === name);
  if (!sheet) throw new Error(`в Excel-файле нет листа «${name}»`);
  const [header, ...rows] = sheet.data;
  if (!header) throw new Error(`лист «${name}» пуст`);
  const names = header.map((h) => (h === null || h === undefined ? '' : String(h)));
  return rows
    .filter((r) => r.some((v) => v !== null && v !== undefined && v !== ''))
    .map((r) => Object.fromEntries(names.map((n, i) => [n, r[i] ?? null])));
}

function need(row: Row, key: string, sheet: string): unknown {
  if (!(key in row)) throw new Error(`на листе «${sheet}» нет колонки «${key}»`);
  return row[key];
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

export interface ReadXlsx {
  snapshot: Snapshot;
  createdAt: string | null;
}

/** Разбирает tracker.xlsx в снимок. Пароли в Excel не хранятся, поэтому у учёток `passwordHash = null`. */
export async function readXlsx(buffer: Uint8Array): Promise<ReadXlsx> {
  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    sheets = (await readXlsxFile(Buffer.from(buffer))) as { sheet: string; data: unknown[][] }[];
  } catch (e) {
    throw new Error(`не удалось прочитать Excel-файл: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    });
  }

  const summary = new Map(
    sheetRows(sheets, SHEETS.summary).map((r) => [str(r['Параметр']), r['Значение']]),
  );
  if (Number(summary.get('Формат копии')) !== FORMAT) {
    throw new Error(`формат копии ${str(summary.get('Формат копии'))} не поддерживается`);
  }

  const S = SHEETS;
  const projects = sheetRows(sheets, S.projects).map((r) => ({
    id: str(need(r, 'id', S.projects)),
    key: str(need(r, 'Ключ', S.projects)),
    name: str(need(r, 'Название', S.projects)),
    sprintDurationDays: Number(need(r, 'Длительность спринта, дн.', S.projects)),
    sprintPrefix: str(need(r, 'Префикс спринта', S.projects)),
    nextSprintNumber: Number(need(r, 'Номер следующего спринта', S.projects)),
    nextSprintStart: strOrNull(need(r, 'Старт следующего спринта', S.projects)),
  }));

  const accounts: AccountRecord[] = [];
  const people = sheetRows(sheets, S.people).map((r) => {
    const id = str(need(r, 'id', S.people));
    const email = strOrNull(need(r, 'Почта', S.people));
    const role = strOrNull(need(r, 'accessRole', S.people));
    if (email && isRole(role)) {
      accounts.push({ id, email, passwordHash: null, accessRole: role, mustChangePassword: true, createdAt: null });
    }
    return { id, name: str(need(r, 'Имя', S.people)), role: str(need(r, 'Должность', S.people)) };
  });

  const sprints = sheetRows(sheets, S.sprints).map((r) => ({
    id: str(need(r, 'id', S.sprints)),
    projectId: str(need(r, 'projectId', S.sprints)),
    name: str(need(r, 'Название', S.sprints)),
    goal: str(need(r, 'Цель', S.sprints)),
    start: str(need(r, 'Старт', S.sprints)),
    end: str(need(r, 'Конец', S.sprints)),
    state: str(need(r, 'state', S.sprints)) as Sprint['state'],
    closedAt: strOrNull(need(r, 'Закрыт (closedAt)', S.sprints)),
  }));

  const issues = sheetRows(sheets, S.issues).map((r) => ({
    id: str(need(r, 'id', S.issues)),
    projectId: str(need(r, 'projectId', S.issues)),
    number: Number(need(r, 'number', S.issues)),
    type: str(need(r, 'Тип', S.issues)) as Issue['type'],
    title: str(need(r, 'Название', S.issues)),
    description: str(need(r, 'Описание', S.issues)),
    acceptance: str(need(r, 'Критерии приёмки', S.issues)),
    status: str(need(r, 'Статус', S.issues)) as Issue['status'],
    priority: str(need(r, 'Приоритет', S.issues)) as Issue['priority'],
    points: numOrNull(need(r, 'Points', S.issues)),
    assigneeId: strOrNull(need(r, 'assigneeId', S.issues)),
    reporterId: str(need(r, 'reporterId', S.issues)),
    parentId: strOrNull(need(r, 'parentId', S.issues)),
    sprintId: strOrNull(need(r, 'sprintId', S.issues)),
    labels: str(need(r, 'Метки', S.issues))
      .split(',')
      .map((l) => l.trim())
      .filter((l) => l.length > 0),
    order: Number(need(r, 'order', S.issues)),
    dueDate: strOrNull(need(r, 'Срок', S.issues)),
    createdAt: str(need(r, 'Создана', S.issues)),
    updatedAt: str(need(r, 'Обновлена', S.issues)),
  }));

  const links = sheetRows(sheets, S.links).map((r) => ({
    id: str(need(r, 'id', S.links)),
    fromId: str(need(r, 'fromId', S.links)),
    toId: str(need(r, 'toId', S.links)),
    type: str(need(r, 'type', S.links)) as Link['type'],
  }));

  const comments = sheetRows(sheets, S.comments).map((r) => ({
    id: str(need(r, 'id', S.comments)),
    issueId: str(need(r, 'issueId', S.comments)),
    authorId: str(need(r, 'authorId', S.comments)),
    text: str(need(r, 'Текст', S.comments)),
    createdAt: str(need(r, 'Дата', S.comments)),
  }));

  const history = sheetRows(sheets, S.history).map((r) => ({
    id: str(need(r, 'id', S.history)),
    issueId: str(need(r, 'issueId', S.history)),
    authorId: str(need(r, 'authorId', S.history)),
    field: str(need(r, 'field', S.history)) as Entities['history'][number]['field'],
    from: strOrNull(need(r, 'from', S.history)),
    to: strOrNull(need(r, 'to', S.history)),
    at: str(need(r, 'Дата', S.history)),
  }));

  const created = summary.get('Дата копии');
  return {
    snapshot: { data: { projects, people, sprints, issues, links, comments, history }, accounts },
    createdAt: created ? str(created) : null,
  };
}
