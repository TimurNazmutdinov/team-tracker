import { useId, useState, type ChangeEvent, type ReactNode } from 'react';
import { Markdown } from './Markdown';

interface BaseProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
}

function Wrapper({
  label,
  error,
  hint,
  required,
  className,
  id,
  children,
}: BaseProps & { id: string; children: ReactNode }) {
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-note`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-note`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function describe(id: string, error?: string, hint?: string) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? `${id}-note` : undefined,
  } as const;
}

export function TextField(
  props: BaseProps & {
    name: string;
    value: string;
    onChange: (value: string) => void;
    type?: 'text' | 'date' | 'number' | 'password';
    min?: string | undefined;
    disabled?: boolean | undefined;
    onBlur?: (() => void) | undefined;
  },
) {
  const id = useId();
  const { name, value, onChange, type = 'text', min, disabled, onBlur } = props;
  return (
    <Wrapper {...props} id={id}>
      <input
        {...describe(id, props.error, props.hint)}
        name={name}
        type={type}
        min={min}
        value={value}
        disabled={disabled}
        onBlur={onBlur}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </Wrapper>
  );
}

export function TextArea(
  props: BaseProps & {
    name: string;
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    disabled?: boolean | undefined;
  },
) {
  const id = useId();
  const { name, value, onChange, rows = 3, disabled } = props;
  return (
    <Wrapper {...props} id={id}>
      <textarea
        {...describe(id, props.error, props.hint)}
        name={name}
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </Wrapper>
  );
}

/** Текстовое поле с Markdown: вкладки «Правка» и «Предпросмотр». */
export function MarkdownField(
  props: BaseProps & {
    name: string;
    value: string;
    onChange: (value: string) => void;
    rows?: number;
  },
) {
  const id = useId();
  const [preview, setPreview] = useState(false);
  const { name, value, onChange, rows = 3 } = props;
  return (
    <Wrapper {...props} id={id}>
      <div className="md-tabs" role="group" aria-label={`${props.label}: режим`}>
        <button
          type="button"
          aria-pressed={!preview}
          className={preview ? undefined : 'on'}
          onClick={() => setPreview(false)}
        >
          Правка
        </button>
        <button
          type="button"
          aria-pressed={preview}
          className={preview ? 'on' : undefined}
          onClick={() => setPreview(true)}
        >
          Предпросмотр
        </button>
        <span className="muted md-help">Markdown: **жирный**, - списки, - [ ] пункты</span>
      </div>
      {preview ? (
        <div className="md-preview" aria-live="polite">
          {value.trim() ? <Markdown text={value} /> : <span className="muted">Пока пусто</span>}
        </div>
      ) : (
        <textarea
          {...describe(id, props.error, props.hint)}
          name={name}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Wrapper>
  );
}

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectField(
  props: BaseProps & {
    name: string;
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    disabled?: boolean | undefined;
  },
) {
  const id = useId();
  const { name, value, options, onChange, disabled } = props;
  return (
    <Wrapper {...props} id={id}>
      <select
        {...describe(id, props.error, props.hint)}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}
