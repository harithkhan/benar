import type { Code, Problem } from '../../shared/validate';
import { Button, FILE_KEY, type FieldName } from '../components/ui';

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The control that each problem is about. The control has the name in `data-field`. */
const FIELD_OF: Record<Code, FieldName> = {
  'party-label-empty': 'label',
  'party-label-bracket': 'label',
  'party-label-duplicate': 'label',
  'party-type': 'type',
  'party-no-name': 'fullName',
  'party-label-slug-shared': 'label',
  'party-label-slug-empty': 'label',
  'contact-unknown-party': 'party',
  'other-type': 'type',
  'of-not-id-type': 'type',
  'of-self': 'owner',
  'of-missing': 'owner',
  'of-owner-type': 'owner',
  'of-owner-has-of': 'owner',
  'other-label-empty': 'label',
  'other-label-bracket': 'label',
  'other-label-is-party': 'label',
  'other-label-shared': 'label',
  'other-label-slug-shared': 'label',
  'other-label-slug-empty': 'label',
  'redact-text-empty': 'text',
  'redact-entity-empty': 'entity',
  'redact-expect': 'expect',
  'redact-type': 'type',
  'redact-duplicate': 'text',
  'redact-defined-term': 'text',
  'target-folder-empty': 'folder',
  'target-name-empty': 'name',
  'target-name-bad': 'name',
  'target-folder-missing': 'folder',
  'no-word-file': 'name',
  'batch-empty': 'batch',
};

/** Shows the row of a problem and puts the cursor in the control that the problem is about. */
export function goToProblem(problem: Problem): void {
  const row = document.getElementById(`row-${problem.rowId ?? FILE_KEY}`);
  if (!row) return;
  const control = row.querySelector<HTMLElement>(`[data-field="${FIELD_OF[problem.code]}"]`) ?? row.querySelector<HTMLElement>('input, textarea, select');
  (control ?? row).scrollIntoView({ block: 'center', behavior: 'smooth' });
  control?.focus({ preventScroll: true });
}

interface Props {
  problems: readonly Problem[];
  /** Not given while Save is not available: a save is in progress, or the app does not know the state of the target. */
  onSave?: () => void;
}

/** The footer is always in the window: the counts at the left, Save at the right. */
export function Footer({ problems, onSave }: Props) {
  const errors = problems.filter((problem) => problem.level === 'error');
  const warnings = problems.filter((problem) => problem.level === 'warning');
  const first = errors[0] ?? warnings[0];
  return (
    <footer className="flex h-[68px] shrink-0 items-center gap-4 border-t border-line px-5">
      {first ? (
        <button type="button" onClick={() => goToProblem(first)} title="Go to the first one" className="flex items-center gap-2 rounded-button px-2 py-1.5 text-sm hover:bg-panel-2">
          <span className={errors.length > 0 ? 'font-semibold text-danger-text' : 'text-ink-faint'}>{plural(errors.length, 'error')}</span>
          <span className="text-ink-faint">·</span>
          <span className={warnings.length > 0 ? 'font-semibold text-warn-text' : 'text-ink-faint'}>{plural(warnings.length, 'warning')}</span>
        </button>
      ) : (
        <span className="px-2 text-sm text-ok-text">No errors · no warnings</span>
      )}
      <span className="flex-1" />
      {errors.length > 0 && <span className="text-xs text-ink-faint">Save is not available while the form has an error.</span>}
      <Button variant="primary" disabled={errors.length > 0 || !onSave} onClick={onSave} className="min-w-28">
        Save
      </Button>
    </footer>
  );
}
