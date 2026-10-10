import { newId, type Party } from '../../shared/model';
import { PARTY_TYPES } from '../../shared/schema';
import { Button, Card, ChipInput, focusRow, hasCode, Input, Labelled, RowProblems, Select } from '../components/ui';
import type { SectionProps } from './shared';

const PARTY_TYPE_OPTIONS = PARTY_TYPES.map((type) => ({ value: type.value, label: type.name }));

export function Parties({ form, problems, dispatch }: SectionProps) {
  const add = () => {
    const id = newId();
    dispatch({ type: 'addParty', id });
    focusRow(id);
  };

  return (
    <Card title="Parties" count={form.parties.length} actions={<Button onClick={add}>+ Add party</Button>}>
      {form.parties.length === 0 && <p className="px-4 pb-4 text-sm text-ink-faint">No party. Add the parties of the matter.</p>}
      {form.parties.map((party) => {
        const list = problems.get(party.id);
        const patch = (change: Partial<Pick<Party, 'label' | 'type' | 'fullName' | 'aliases' | 'idNumber' | 'definedTerm'>>) => dispatch({ type: 'party', id: party.id, patch: change });
        return (
          <div key={party.id} id={`row-${party.id}`} className="scroll-mt-4 border-t border-line px-4 py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                Label
                <Input value={party.label} onChange={(label) => patch({ label })} accent invalid={hasCode(list, 'party-label-empty', 'party-label-bracket', 'party-label-duplicate')} data-field="label" width="w-40" />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                Type
                <Select value={party.type} options={PARTY_TYPE_OPTIONS} onChange={(type) => patch({ type })} invalid={hasCode(list, 'party-type')} data-field="type" width="w-36" />
              </label>
              <span className="flex-1" />
              <Button variant="ghost" compact onClick={() => dispatch({ type: 'remove', list: 'parties', id: party.id })}>
                Remove
              </Button>
            </div>
            <RowProblems list={list} only={['party-label-empty', 'party-label-bracket', 'party-label-duplicate', 'party-entity-shared', 'party-label-slug-empty', 'party-type']} />

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
              <div>
                <Labelled label="Full name, as written">
                  <Input value={party.fullName} onChange={(fullName) => patch({ fullName })} data-field="fullName" />
                </Labelled>
                <RowProblems list={list} only={['party-no-name']} />
              </div>
              <Labelled label="ID number">
                <Input value={party.idNumber} onChange={(idNumber) => patch({ idNumber })} mono />
              </Labelled>
              <Labelled label="Short forms and aliases">
                <ChipInput values={party.aliases} onChange={(aliases) => patch({ aliases })} label="Short forms and aliases" />
              </Labelled>
              <Labelled label="Defined term" hint="reference only, never redacted">
                <Input value={party.definedTerm} onChange={(definedTerm) => patch({ definedTerm })} placeholder="the Plaintiff" />
              </Labelled>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
