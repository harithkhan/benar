import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

import type { Problem } from '../../shared/validate';
import { MESSAGE } from '../messages';

// The small components of the form. They use the tokens of tailwind.preset.js.

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

const FIELD = 'w-full rounded-control border bg-field px-2.5 outline-none placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/35';

interface FieldLook {
  /** Shows the border of an error. */
  invalid?: boolean;
  /** For a path or a number. */
  mono?: boolean;
  /** For a label or an id: mono, in the accent colour. */
  accent?: boolean;
  /** 32px tall, for a row of a table. */
  compact?: boolean;
}

const fieldClass = ({ invalid, mono, accent, compact }: FieldLook, extra?: string): string =>
  cx(FIELD, invalid ? 'border-danger' : 'border-line-strong', accent ? 'text-accent-text' : 'text-ink', (mono || accent) && 'font-mono', compact || mono || accent ? 'text-sm' : 'text-body', compact ? 'h-8 py-1' : 'h-11 py-2', extra);

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & FieldLook & { value: string; onChange: (value: string) => void };

export function Input({ value, onChange, invalid, mono, accent, compact, className, ...rest }: InputProps) {
  return (
    <input
      type="text"
      spellCheck={false}
      autoComplete="off"
      {...rest}
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(event) => onChange(event.target.value)}
      className={fieldClass({ invalid, mono, accent, compact }, className)}
    />
  );
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & FieldLook & { value: string; onChange: (value: string) => void };

export function TextArea({ value, onChange, invalid, mono, accent, compact, className, ...rest }: TextAreaProps) {
  return (
    <textarea
      rows={2}
      spellCheck={false}
      {...rest}
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(event) => onChange(event.target.value)}
      className={cx(fieldClass({ invalid, mono, accent, compact }, className), 'h-auto min-h-8 resize-y leading-snug', compact ? 'py-1.5' : 'py-2')}
    />
  );
}

export interface Option {
  value: string;
  label: string;
}

interface SelectProps extends FieldLook {
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  'aria-label'?: string;
  className?: string;
}

export function Select({ value, options, onChange, invalid, mono, accent, compact, className, ...rest }: SelectProps) {
  // A loaded file can hold a value that is not permitted. It shows as it is.
  const known = options.some((option) => option.value === value);
  return (
    <select {...rest} value={value} aria-invalid={invalid || undefined} onChange={(event) => onChange(event.target.value)} className={fieldClass({ invalid, mono, accent, compact }, cx('pr-7', className))}>
      {!known && <option value={value}>{value === '' ? 'Not selected' : `${value} · not permitted`}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** A label above a control, with an optional hint. */
export function Labelled({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block min-w-0', className)}>
      <span className="mb-1.5 flex items-baseline gap-2 text-sm text-ink-muted">
        {label}
        {hint && <span className="text-xs text-ink-faint">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** 32px tall, for a row of a table. */
  compact?: boolean;
};

const BUTTON: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent font-bold text-accent-ink hover:bg-accent-hover disabled:bg-panel-2 disabled:text-ink-faint',
  secondary: 'border border-line-strong bg-panel font-semibold text-ink hover:bg-panel-2 disabled:text-ink-faint disabled:hover:bg-panel',
  ghost: 'font-semibold text-ink-muted hover:bg-panel-2 hover:text-ink disabled:text-ink-faint',
  danger: 'border border-danger-line font-semibold text-danger-text hover:bg-danger-soft',
};

export function Button({ variant = 'secondary', compact, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-button disabled:cursor-not-allowed', compact ? 'h-8 px-3 text-sm' : 'h-11 px-4 text-body', BUTTON[variant], className)}
    />
  );
}

/** The remove button of a row: `×` with a spoken name. */
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-button text-[18px] leading-none text-ink-faint hover:bg-panel-2 hover:text-danger-text">
      ×
    </button>
  );
}

export function Card({ id, title, count, hint, actions, children }: { id?: string; title: string; count?: number; hint?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-card border border-line bg-panel">
      <header className="flex items-start gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-baseline gap-2 text-h2">
            {title}
            {count !== undefined && <span className="text-sm font-normal text-ink-faint">{count}</span>}
          </h2>
          {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** The body of a card, with the padding of the card. */
export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('px-4 pb-4', className)}>{children}</div>;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-body">
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className="relative h-5 w-9 rounded-full bg-line-strong transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-ink-muted after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-4 peer-checked:after:bg-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
      {label}
    </label>
  );
}

/** A list of short texts as chips. Enter adds the typed text. */
export function ChipInput({ values, onChange, label, placeholder = 'Add another…' }: { values: readonly string[]; onChange: (values: string[]) => void; label: string; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (value !== '' && !values.includes(value)) onChange([...values, value]);
    setDraft('');
  };
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-control border border-line-strong bg-field px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/35">
      {values.map((value) => (
        <span key={value} className="inline-flex items-center gap-1 rounded-chip bg-panel-2 py-0.5 pl-2 pr-1 text-sm">
          {value}
          <button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((item) => item !== value))} className="rounded-chip px-1 leading-none text-ink-muted hover:text-danger-text">
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        spellCheck={false}
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={add}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add();
          } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        className="h-7 min-w-32 flex-1 bg-transparent px-1 text-ink outline-none placeholder:text-ink-faint"
      />
    </div>
  );
}

const BANNER = {
  info: ['border-info-line bg-info-soft text-info-text', 'Info.'],
  warning: ['border-warn-line bg-warn-soft text-warn-text', 'Warning.'],
  blocking: ['border-danger-line bg-danger-soft text-danger-text', 'Blocking.'],
  success: ['border-ok-line bg-ok-soft text-ok-text', ''],
} as const;

export function Banner({ kind, children }: { kind: keyof typeof BANNER; children: ReactNode }) {
  const [look, lead] = BANNER[kind];
  return (
    <div role={kind === 'blocking' ? 'alert' : 'status'} className={cx('rounded-button border px-3.5 py-2.5 text-sm', look)}>
      {lead && <strong className="mr-1.5 font-bold">{lead}</strong>}
      {children}
    </div>
  );
}

/** A modal dialog. Escape and `onCancel` close it. */
export function Dialog({ title, children, actions, onCancel }: { title: string; children: ReactNode; actions: ReactNode; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(480px,calc(100vw-48px))] rounded-dialog border border-line bg-panel p-6 text-ink shadow-dialog backdrop:bg-black/55"
    >
      <h2 id="dialog-title" className="text-h1">
        {title}
      </h2>
      <div className="mt-2 text-body text-ink-muted">{children}</div>
      <div className="mt-6 flex justify-end gap-2.5">{actions}</div>
    </dialog>
  );
}

export function Toast({ children, actions, onClose }: { children: ReactNode; actions?: ReactNode; onClose: () => void }) {
  return (
    <div role="status" className="fixed bottom-20 right-5 z-10 flex max-w-[560px] items-center gap-3 rounded-card border border-ok-line bg-ok-soft py-2 pl-4 pr-2 text-sm text-ok-text shadow-dialog">
      <span className="min-w-0 break-words">{children}</span>
      {actions}
      <RemoveButton label="Close the message" onClick={onClose} />
    </div>
  );
}

export type ProblemMap = ReadonlyMap<string, readonly Problem[]>;

/** The problems of the file section have this key in a `ProblemMap`. */
export const FILE_KEY = 'file';

export const hasCode = (list: readonly Problem[] | undefined, ...codes: Problem['code'][]): boolean => list?.some((problem) => codes.includes(problem.code)) ?? false;

/** The lines under a row: an error in the danger colour, a warning in the warning colour. */
export function RowProblems({ list, only }: { list: readonly Problem[] | undefined; only?: readonly Problem['code'][] }) {
  const shown = only ? list?.filter((problem) => only.includes(problem.code)) : list;
  if (!shown?.length) return null;
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5">
      {shown.map((problem) => (
        <li key={problem.code} className={cx('text-xs', problem.level === 'error' ? 'text-danger-text' : 'text-warn-text')}>
          {MESSAGE[problem.code]}
        </li>
      ))}
    </ul>
  );
}

/** Puts the cursor in the first control of a row, after the row is on the page. */
export function focusRow(id: string): void {
  setTimeout(() => {
    const row = document.getElementById(`row-${id}`);
    row?.querySelector<HTMLElement>('input, textarea, select')?.focus();
  }, 0);
}
