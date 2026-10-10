import { newId, writeLabel, type Other } from '../../shared/model';
import { ID_TYPES, NAME_TYPES } from '../../shared/schema';
import { Button, Card, focusRow, hasCode, Input, RemoveButton, RowProblems, Select, type Option } from '../components/ui';
import { TYPE_OPTIONS, type SectionProps } from './shared';

const NO_OWNER = '';
const UNKNOWN_OWNER = '?';

const ownerName = (other: Other, place: number): string => {
  const text = other.text.trim() === '' ? `Entry ${place + 1}` : other.text.trim();
  return other.label === null ? text : `${writeLabel(other.label)} ${text}`;
};

export function Others({ form, problems, dispatch }: SectionProps) {
  const add = () => {
    const id = newId();
    dispatch({ type: 'addOther', id });
    focusRow(id);
  };
  const ids = new Set(form.others.map((other) => other.id));
  const hasOwner = (other: Other) => other.unknownOf !== undefined || (other.ownerId !== null && ids.has(other.ownerId));

  return (
    <Card
      title="Other people and identifiers"
      count={form.others.length}
      hint="Children, witnesses, title numbers, case numbers, bank accounts. An ID number can belong to a person of this list."
      actions={
        <Button compact onClick={add}>
          + Add
        </Button>
      }
    >
      {form.others.length > 0 && (
        <ul className="flex flex-col border-t border-line">
          {form.others.map((other, place) => {
            const list = problems.get(other.id);
            const patch = (change: Partial<Pick<Other, 'type' | 'text' | 'label' | 'ownerId'>>) => dispatch({ type: 'other', id: other.id, patch: change });
            const owner = other.ownerId === null ? undefined : form.others.find((candidate) => candidate.id === other.ownerId);
            // The entries that can be an owner. The owner of the row stays in the list also when it is not permitted.
            const owners: Option[] = form.others.flatMap((candidate, n) => (candidate.id === other.id || (candidate.id !== owner?.id && (!NAME_TYPES.has(candidate.type) || hasOwner(candidate))) ? [] : [{ value: candidate.id, label: ownerName(candidate, n) }]));
            if (owner?.id === other.id) owners.push({ value: other.id, label: 'This entry' });
            const showOwner = ID_TYPES.has(other.type) || owner !== undefined || other.unknownOf !== undefined;
            return (
              <li key={other.id} id={`row-${other.id}`} className="scroll-mt-4 border-b border-line px-4 py-2.5 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Select compact value={other.type} options={TYPE_OPTIONS} onChange={(type) => patch({ type })} invalid={hasCode(list, 'other-type', 'of-not-id-type')} aria-label={`Type of entry ${place + 1}`} className="w-52" />
                  <Input compact value={other.text} onChange={(text) => patch({ text })} aria-label={`Text of entry ${place + 1}`} placeholder="Text, as it stands in the document" className="min-w-48 flex-1" />
                  <Input
                    compact
                    accent
                    value={other.label ?? ''}
                    onChange={(label) => patch({ label })}
                    onBlur={() => other.label === '' && patch({ label: null })}
                    invalid={hasCode(list, 'other-label-empty', 'other-label-bracket', 'other-label-is-party', 'other-label-shared')}
                    aria-label={`Role label of entry ${place + 1}`}
                    placeholder="ROLE LABEL"
                    className="w-40"
                  />
                  {showOwner && (
                    <label className="flex items-center gap-2 whitespace-nowrap text-xs text-ink-muted">
                      Belongs to
                      <Select
                        compact
                        value={owner ? owner.id : other.unknownOf !== undefined ? UNKNOWN_OWNER : NO_OWNER}
                        options={[{ value: NO_OWNER, label: 'No owner' }, ...(other.unknownOf !== undefined && !owner ? [{ value: UNKNOWN_OWNER, label: 'Not in the list' }] : []), ...owners]}
                        onChange={(value) => value !== UNKNOWN_OWNER && patch({ ownerId: value === NO_OWNER ? null : value })}
                        invalid={hasCode(list, 'of-self', 'of-missing', 'of-owner-type', 'of-owner-has-of')}
                        className="w-48"
                      />
                    </label>
                  )}
                  <RemoveButton label={`Remove entry ${place + 1}`} onClick={() => dispatch({ type: 'remove', list: 'others', id: other.id })} />
                </div>
                <RowProblems list={list} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
