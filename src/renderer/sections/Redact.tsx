import type { ClipboardEvent } from 'react';

import { fillFromIntake } from '../../shared/fill';
import { newId, type RedactRow } from '../../shared/model';
import { EXPECTS } from '../../shared/schema';
import { Banner, Button, Card, focusRow, hasCode, Input, RemoveButton, RowProblems, Select, type Option } from '../components/ui';
import { entityIds, pasteLines } from '../state';
import { describedBy, TYPE_OPTIONS, type SectionProps } from './shared';

const EXPECT_OPTIONS: readonly Option[] = EXPECTS.map((expect) => ({ value: expect.value, label: expect.value }));
const REDACT_TYPE_OPTIONS: readonly Option[] = [{ value: '', label: 'No type' }, ...TYPE_OPTIONS];

// The columns are narrower in a narrow window, so that the text keeps its room.
const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_8rem_6.75rem_8rem_4.25rem_2rem] items-center gap-2 min-[980px]:grid-cols-[minmax(0,1fr)_11rem_7.5rem_12rem_4.25rem_2rem]';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

interface Props extends SectionProps {
  /** The entity ids of the source matter. */
  knownEntities: readonly string[];
  fillNote: { added: number; skipped: number } | null;
}

export function Redact({ form, problems, dispatch, knownEntities, fillNote }: Props) {
  const rows = form.redact;
  const inUse = entityIds(rows);
  const offered = entityIds(rows, knownEntities);

  const fill = () => dispatch({ type: 'filled', ...fillFromIntake(form) });
  const addRow = () => {
    const id = newId();
    dispatch({ type: 'addRedact', id });
    focusRow(id);
  };
  const addForm = (afterId: string) => {
    const id = newId();
    dispatch({ type: 'addForm', afterId, id });
    focusRow(id);
  };
  // A paste of several lines makes one row for each line.
  const paste = (row: RedactRow) => (event: ClipboardEvent<HTMLInputElement>) => {
    const lines = pasteLines(event.clipboardData.getData('text'));
    if (lines.length < 2) return;
    event.preventDefault();
    dispatch({ type: 'pasteRedact', id: row.id, lines, ids: lines.slice(1).map(() => newId()) });
  };

  return (
    <Card
      title="Redact"
      count={rows.length}
      hint={
        <>
          Delete each row whose text is not in this document. <code className="font-mono text-xs">eval</code> counts it as not found.
        </>
      }
      actions={<Button onClick={fill}>Add rows from intake</Button>}
    >
      <div className="flex flex-col gap-3 px-4 pb-3">
        {fillNote && (
          <Banner kind="info">
            Added {plural(fillNote.added, 'row', 'rows')}. Skipped {plural(fillNote.skipped, 'text', 'texts')} that the list has already.
          </Banner>
        )}
        <details className="text-sm text-ink-muted">
          <summary className="w-fit cursor-pointer rounded-chip text-accent-text">The rules of this list</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li>
              <code className="font-mono text-xs">entered</code> is for a form of an entry of the intake, also a short form that you did not type. <code className="font-mono text-xs">detected</code> is for all other texts, for example a witness.
            </li>
            <li>A text matches whole words. Case, the kind of space, the kind of quote and the kind of dash do not matter.</li>
            <li>A text cannot cross a paragraph. An address on several lines is one row for each line, with the same entity.</li>
            <li>A defined term, for example “the Purchaser”, does not go in this list.</li>
            <li>One entity must map to one label. A party and its ID number are two entities.</li>
          </ul>
        </details>
      </div>

      {rows.length > 0 && (
        <div className="border-t border-line">
          <div className={`${COLUMNS} px-4 pb-1 pt-3 text-overline uppercase text-ink-faint`}>
            <span>Text, as it stands in the document</span>
            <span>Entity</span>
            <span>Expect</span>
            <span>Type</span>
          </div>
          <ul className="flex flex-col px-4 pb-2">
            {rows.map((row, place) => {
              const list = problems.get(row.id);
              const patch = (change: Partial<Pick<RedactRow, 'text' | 'entity' | 'expect' | 'type'>>) => dispatch({ type: 'redact', id: row.id, patch: change });
              const n = place + 1;
              const problemsId = `problems-${row.id}`;
              return (
                <li key={row.id} id={`row-${row.id}`} className="scroll-mt-4 py-1">
                  <div className={COLUMNS}>
                    <Input compact value={row.text} onChange={(text) => patch({ text })} onPaste={paste(row)} invalid={hasCode(list, 'redact-text-empty')} aria-label={`Text of row ${n}`} data-field="text" aria-describedby={describedBy(list, 'text', problemsId)} />
                    <Input compact accent value={row.entity} onChange={(entity) => patch({ entity })} list="entity-ids" invalid={hasCode(list, 'redact-entity-empty')} aria-label={`Entity of row ${n}`} data-field="entity" aria-describedby={describedBy(list, 'entity', problemsId)} />
                    <Select compact value={row.expect} options={EXPECT_OPTIONS} onChange={(expect) => patch({ expect })} invalid={hasCode(list, 'redact-expect')} aria-label={`Expect of row ${n}`} data-field="expect" aria-describedby={describedBy(list, 'expect', problemsId)} />
                    <Select compact value={row.type} options={REDACT_TYPE_OPTIONS} onChange={(type) => patch({ type })} invalid={hasCode(list, 'redact-type')} aria-label={`Type of row ${n}`} data-field="type" aria-describedby={describedBy(list, 'type', problemsId)} />
                    <Button compact onClick={() => addForm(row.id)} aria-label={`Add a form below row ${n}`} title="A new row below with the same entity, expect and type" flush>
                      + form
                    </Button>
                    <RemoveButton label={`Remove row ${n}`} onClick={() => dispatch({ type: 'remove', list: 'redact', id: row.id })} />
                  </div>
                  <RowProblems id={problemsId} list={list} />
                </li>
              );
            })}
          </ul>
          <datalist id="entity-ids">
            {offered.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </div>
      )}

      <div className="flex items-center gap-4 border-t border-line px-4 py-3">
        <Button compact onClick={addRow}>
          + Add row
        </Button>
        <span className="text-xs text-ink-muted">
          {plural(rows.length, 'row', 'rows')} · {plural(inUse.length, 'entity', 'entities')}
        </span>
      </div>
    </Card>
  );
}
