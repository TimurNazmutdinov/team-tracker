import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PALETTES, PALETTE_LABELS } from '../../domain/palettes';
import { ALL, MINE } from '../../domain/projectScope';
import { searchIssues } from '../../domain/search';
import { ancestors } from '../../domain/tree';
import { usePermissions } from '../../state/current-user';
import { useHelp } from '../../state/help';
import { useCreateDialog } from '../../state/create-dialog';
import { usePalette } from '../../state/palette';
import { useProjectScope } from '../../state/project-scope';
import { useProjectViews } from '../../state/queries';
import { useQuick } from '../../state/quick';
import { Dialog } from '../../ui/Dialog';

interface Item {
  id: string;
  group: 'Задачи' | 'Экраны' | 'Действия';
  label: string;
  hint?: string;
  /** Вторая строка: для задач — путь до родителей («эпик › задача»). */
  sub?: string;
  run: () => void;
}

/** Клавиши после «G»: буква → экран проекта. Справка перечисляет те же буквы. */
export const SCREEN_KEYS: Record<string, string> = {
  b: 'backlog',
  d: 'board',
  s: 'sprints',
  r: 'reports',
  p: 'people',
  h: 'history',
};

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Горячие клавиши: Ctrl+K / ⌘K и «/» открывают палитру, «C» — создание задачи, «G» + буква — переход. */
export function QuickKeys() {
  const show = useQuick((s) => s.show);
  const navigate = useNavigate();
  const { key } = useParams();
  const showCreate = useCreateDialog((s) => s.show);
  const showHelp = useHelp((s) => s.show);
  const canCreate = usePermissions().can('issue.create');
  const goTo = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        show();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      const k = e.key.toLowerCase();
      if (e.key === '?') {
        e.preventDefault();
        showHelp();
      } else if (e.key === '/') {
        e.preventDefault();
        show();
      } else if (goTo.current > Date.now() && SCREEN_KEYS[k] && key) {
        goTo.current = 0;
        void navigate(`/projects/${key}/${SCREEN_KEYS[k]}`);
      } else if (k === 'g') {
        goTo.current = Date.now() + 1000;
      } else if (k === 'c' && key && canCreate) {
        e.preventDefault();
        showCreate();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show, navigate, key, showCreate, showHelp, canCreate]);
  return null;
}

/** Окно палитры: поле ввода + список (combobox/listbox), группы «Задачи», «Экраны», «Действия». */
export function CommandPalette() {
  const open = useQuick((s) => s.open);
  const hide = useQuick((s) => s.hide);
  if (!open) return null;
  return (
    <Dialog title="Быстрый поиск" onClose={hide}>
      <Palette onClose={hide} />
    </Dialog>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { key: routeKey } = useParams();
  const scope = useProjectScope();
  const views = useProjectViews(scope.scope.projects);
  const showCreate = useCreateDialog((s) => s.show);
  const perms = usePermissions();
  const palette = usePalette((s) => s.palette);
  const setPalette = usePalette((s) => s.set);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      void navigate(to);
    };
    const projectKey = routeKey ?? scope.scope.projects[0]?.key;
    const screens: Item[] = [
      { id: 'portfolio', group: 'Экраны', label: 'Портфель', run: go('/portfolio') },
      { id: 'analytics', group: 'Экраны', label: 'Аналитика', run: go('/analytics') },
      { id: 'projects', group: 'Экраны', label: 'Проекты', run: go('/projects') },
      ...(projectKey
        ? [
            ['board', 'Доска', 'G D'],
            ['backlog', 'Планирование спринтов', 'G B'],
            ['history', 'Прошлые спринты', 'G H'],
            ['sprints', 'Спринты', 'G S'],
            ['reports', 'Отчёты', 'G R'],
            ['people', 'Люди', 'G P'],
            ['settings', 'Настройки', ''],
          ].map(([to, label, hint]): Item => ({
            id: `screen-${to}`,
            group: 'Экраны',
            label: `${label} · ${projectKey}`,
            ...(hint ? { hint } : {}),
            run: go(`/projects/${projectKey}/${to}`),
          }))
        : []),
      { id: 'about', group: 'Экраны', label: 'О программе', run: go('/about') },
    ];
    const actions: Item[] = [
      ...(routeKey && perms.can('issue.create')
        ? [
            {
              id: 'create',
              group: 'Действия' as const,
              label: 'Создать задачу',
              hint: 'C',
              run: () => showCreate(),
            },
          ]
        : []),
      {
        id: 'scope-mine',
        group: 'Действия',
        label: 'Проекты: мои',
        run: () => void scope.choose(MINE),
      },
      {
        id: 'scope-all',
        group: 'Действия',
        label: 'Проекты: все',
        run: () => void scope.choose(ALL),
      },
      ...PALETTES.filter((p) => p !== palette).map((p): Item => ({
        id: `palette-${p}`,
        group: 'Действия',
        label: `Гамма: ${PALETTE_LABELS[p]}`,
        run: () => setPalette(p),
      })),
    ];
    const q = norm(query.trim());
    const filter = (list: Item[]) => (q ? list.filter((i) => norm(i.label).includes(q)) : list);
    const found: Item[] =
      q && views
        ? searchIssues(views, query).map((h) => ({
            id: `issue-${h.issue.id}`,
            group: 'Задачи' as const,
            label: `${h.key}  ${h.issue.title}`,
            hint: h.issue.status,
            sub: ancestors(h.issue, views.find((v) => v.projectId === h.project.id)?.issues ?? [])
              .map((a) => a.title)
              .join(' › '),
            run: go(`/projects/${h.project.key}/issues/${h.issue.number}`),
          }))
        : [];
    return [...found, ...filter(screens), ...filter(actions)];
  }, [query, views, routeKey, scope, navigate, showCreate, palette, setPalette, perms]);

  const index = Math.min(active, Math.max(items.length - 1, 0));
  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((index + 1) % Math.max(items.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((index - 1 + items.length) % Math.max(items.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[index]);
    }
  };

  let lastGroup = '';
  return (
    <div className="palette">
      <input
        type="text"
        role="combobox"
        aria-label="Поиск задач, экранов и действий"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={items[index] ? `${listId}-${items[index].id}` : undefined}
        autoFocus
        placeholder="Ключ, название задачи, экран или действие"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} role="listbox" aria-label="Результаты" className="plain-list palette-list">
        {items.length === 0 && (
          <li className="muted" role="presentation">
            Ничего не найдено
          </li>
        )}
        {items.map((item, n) => {
          const head = item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <li key={item.id} role="presentation">
              {head && <div className="palette-group">{item.group}</div>}
              <div
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={n === index}
                className={`palette-item${n === index ? ' active' : ''}`}
                onMouseMove={() => setActive(n)}
                onClick={() => choose(item)}
              >
                <span>
                  {item.label}
                  {item.sub && <span className="palette-sub">{item.sub}</span>}
                </span>
                {item.hint && <kbd>{item.hint}</kbd>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted palette-foot">↑↓ выбрать · Enter открыть · Esc закрыть</p>
    </div>
  );
}
