import { useId, useState, type KeyboardEvent } from 'react';
import { suggestLabels, withLabel, type LabelStat } from '../domain/labels';

/**
 * Ввод меток чипами (D-2): Enter или запятая добавляют метку, Backspace в пустом поле убирает последнюю,
 * подсказки — из уже существующих меток (чтобы не плодить опечатки), новая метка добавляется явно.
 */
export function LabelsInput({
  label,
  value,
  onChange,
  stats,
  hint,
  className,
  disabled = false,
}: {
  label: string;
  value: string[];
  onChange: (labels: string[]) => void;
  /** Существующие метки с числом задач — для подсказок. */
  stats: readonly LabelStat[];
  hint?: string;
  className?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const suggestions = suggestLabels(stats, text, value);
  const exact = stats.some(
    (s) => s.label.toLocaleLowerCase('ru') === text.trim().toLocaleLowerCase('ru'),
  );

  const add = (labelText: string) => {
    onChange(withLabel(value, labelText));
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && text.trim()) {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className={`field labels-field${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="chips-input">
        {value.map((l) => (
          <span key={l} className="chip label-chip">
            {l}
            {!disabled && (
              <button
                type="button"
                className="plain"
                aria-label={`Убрать метку ${l}`}
                title="Убрать метку"
                onClick={() => onChange(value.filter((x) => x !== l))}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {disabled && value.length === 0 && <span className="muted">Меток нет</span>}
        <input
          id={id}
          hidden={disabled}
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value.replace(',', ''));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // клик по подсказке успевает сработать до закрытия списка
            window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 ? 'Начните вводить метку' : ''}
          aria-describedby={hint ? `${id}-note` : undefined}
          autoComplete="off"
        />
      </div>
      {open && (suggestions.length > 0 || (text.trim() && !exact)) && (
        <ul className="suggest-list" aria-label="Подсказки меток">
          {suggestions.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s.label)}
              >
                {s.label} <span className="muted">({s.count})</span>
              </button>
            </li>
          ))}
          {text.trim() && !exact && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(text)}
              >
                + новая метка «{text.trim()}»
              </button>
            </li>
          )}
        </ul>
      )}
      {hint && (
        <p id={`${id}-note`} className="hint">
          {hint}
        </p>
      )}
    </div>
  );
}
