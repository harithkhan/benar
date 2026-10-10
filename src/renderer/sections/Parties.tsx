import { newId, type Party } from '../../shared/model';
import { PARTY_TYPES } from '../../shared/schema';
import { Button, ChipInput, focusRow, hasCode, Input, Labelled, RowProblems, Select } from '../components/ui';
import { describedBy, type SectionProps } from './shared';

const PARTY_TYPE_OPTIONS = PARTY_TYPES.map((type) => ({ value: type.value, label: type.name }));

// Each party is a card of its own. The look is the look of `Card`.
const PARTY_CARD = 'rounded-card border border-line bg-panel px-4 py-4';

export function Parties({ form, problems, dispatch }: SectionProps) {
  const add = () => {
    const id = newId();
    dispatch({ type: 'addParty', id });
    focusRow(id);
  };

  return (
    <section className="flex flex-col gap-3">
      {/* The heading has the look of the header of a card. It is as far from the side as that header: the padding, and 1px for the border. */}
      <header className="mx-px flex items-center gap-3 px-4">
        <h2 className="flex min-w-0 flex-1 items-baseline gap-2 text-h2">
          Parties
          <span className="text-sm font-normal text-ink-faint">{form.parties.length}</span>
        </h2>
        <Button onClick={add}>+ Add party</Button>
      </header>
      {form.parties.length === 0 && <p className={`${PARTY_CARD} text-sm text-ink-faint`}>No party. Add the parties of the matter.</p>}
      {form.parties.length > 0 && (
        <ul className="flex flex-col gap-4">
          {form.parties.map((party, place) => {
            const list = problems.get(party.id);
            const patch = (change: Partial<Pick<Party, 'label' | 'type' | 'fullName' | 'aliases' | 'idNumber' | 'definedTerm'>>) => dispatch({ type: 'party', id: party.id, patch: change });
            const problemsId = `problems-${party.id}`;
            const nameProblemsId = `problems-${party.id}-name`;
            return (
              <li key={party.id} id={`row-${party.id}`} className={`scroll-mt-4 ${PARTY_CARD}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <label className="flex items-center gap-2 text-sm text-ink-muted">
                    Label
                    <Input value={party.label} onChange={(label) => patch({ label })} accent invalid={hasCode(list, 'party-label-empty', 'party-label-bracket', 'party-label-duplicate')} data-field="label" aria-describedby={describedBy(list, 'label', problemsId)} width="w-40" />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink-muted">
                    Type
                    <Select value={party.type} options={PARTY_TYPE_OPTIONS} onChange={(type) => patch({ type })} invalid={hasCode(list, 'party-type')} data-field="type" aria-describedby={describedBy(list, 'type', problemsId)} width="w-36" />
                  </label>
                  <span className="flex-1" />
                  <Button variant="ghost" compact onClick={() => dispatch({ type: 'remove', list: 'parties', id: party.id })} aria-label={`Remove party ${place + 1}`}>
                    Remove
                  </Button>
                </div>
                <RowProblems id={problemsId} list={list} only={['party-label-empty', 'party-label-bracket', 'party-label-duplicate', 'party-entity-shared', 'party-label-slug-empty', 'party-type']} />

                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                  <div>
                    <Labelled label="Full name, as written">
                      <Input value={party.fullName} onChange={(fullName) => patch({ fullName })} data-field="fullName" aria-describedby={describedBy(list, 'fullName', nameProblemsId)} />
                    </Labelled>
                    <RowProblems id={nameProblemsId} list={list} only={['party-no-name']} />
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
