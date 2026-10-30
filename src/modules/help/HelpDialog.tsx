import { useState } from 'react';
import { DEFAULT_ROLES } from '../../domain/permissions';
import { useHelp } from '../../state/help';
import { useOnboarding } from '../../state/onboarding';
import { useRoles } from '../../state/queries';
import { Dialog } from '../../ui/Dialog';
import { HOTKEYS, RULES, permissionRows } from './content';

const TABS = [
  { id: 'keys', label: 'Клавиши' },
  { id: 'rules', label: 'Правила' },
  { id: 'roles', label: 'Кто что может' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Встроенная справка (wireframes.md, 23.2): клавиши, правила простым языком, таблица прав по ролям. */
export function HelpDialog() {
  const open = useHelp((s) => s.open);
  const hide = useHelp((s) => s.hide);
  if (!open) return null;
  return (
    <Dialog title="Справка" onClose={hide}>
      <HelpBody onClose={hide} />
    </Dialog>
  );
}

function HelpBody({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('keys');
  const onboarding = useOnboarding();
  const roles = useRoles().data ?? DEFAULT_ROLES;
  return (
    <div className="help">
      <div className="md-tabs" role="group" aria-label="Разделы справки">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            className={tab === t.id ? 'on' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'keys' && (
        <>
          <table className="help-table">
            <caption className="visually-hidden">Горячие клавиши</caption>
            <thead>
              <tr>
                <th scope="col">Клавиши</th>
                <th scope="col">Действие</th>
              </tr>
            </thead>
            <tbody>
              {HOTKEYS.map((h) => (
                <tr key={h.keys}>
                  <td>
                    <kbd>{h.keys}</kbd>
                  </td>
                  <td>{h.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Клавиши не срабатывают, пока фокус в поле ввода.</p>
        </>
      )}
      {tab === 'rules' && (
        <dl className="help-rules">
          {RULES.map((r) => (
            <div key={r.title}>
              <dt>{r.title}</dt>
              <dd>{r.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {tab === 'roles' && (
        <>
          <table className="help-table">
            <caption className="visually-hidden">Права по ролям</caption>
            <thead>
              <tr>
                <th scope="col">Действие</th>
                {roles.map((r) => (
                  <th key={r.id} scope="col">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionRows(roles).map((row) => (
                <tr key={row.action}>
                  <th scope="row">{row.label}</th>
                  {roles.map((r) => (
                    <td key={r.id}>
                      <span aria-label={row.allowed[r.id] ? 'можно' : 'нельзя'}>
                        {row.allowed[r.id] ? '✓' : '—'}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            Недоступные действия в интерфейсе скрыты или отключены; сервер проверяет права сам.
          </p>
        </>
      )}
      {onboarding.isAdmin && (
        <p>
          <button
            type="button"
            onClick={() => {
              void onboarding.set(false);
              onClose();
            }}
          >
            Запустить мастер первого запуска
          </button>
        </p>
      )}
    </div>
  );
}
