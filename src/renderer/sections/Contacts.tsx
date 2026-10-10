import { newId, writeLabel, type ContactList } from '../../shared/model';
import { Button, Card, focusRow, hasCode, Input, RemoveButton, RowProblems, Select, TextArea, type Option } from '../components/ui';
import { describedBy, type SectionProps } from './shared';

const NAMES: Record<ContactList, { title: string; one: string }> = {
  addresses: { title: 'Addresses', one: 'address' },
  emails: { title: 'Emails', one: 'email' },
  phones: { title: 'Phones', one: 'phone' },
};

const NO_PARTY = '';

/** One list of rows: a text and the party that it is linked to. */
export function Contacts({ list, form, problems, dispatch }: SectionProps & { list: ContactList }) {
  const names = NAMES[list];
  const rows = form[list];
  const partyOptions: Option[] = [{ value: NO_PARTY, label: 'No party' }, ...form.parties.map((party) => ({ value: party.id, label: writeLabel(party.label) }))];

  const add = () => {
    const id = newId();
    dispatch({ type: 'addContact', list, id });
    focusRow(id);
  };

  return (
    <Card
      title={names.title}
      count={rows.length}
      hint={list === 'addresses' ? 'Type each address as it stands in the document, with its lines.' : undefined}
      actions={
        <Button compact onClick={add} aria-label={`+ Add ${names.one}`}>
          + Add
        </Button>
      }
    >
      {rows.length > 0 && (
        <ul className="flex flex-col gap-2 px-4 pb-4">
          {rows.map((row, place) => {
            const rowProblems = problems.get(row.id);
            const linked = row.partyId !== null && form.parties.some((party) => party.id === row.partyId);
            const unknown = !linked && row.unknownParty !== undefined;
            const text = (value: string) => dispatch({ type: 'contact', list, id: row.id, patch: { text: value } });
            const label = `${names.one} ${place + 1}`;
            const problemsId = `problems-${row.id}`;
            return (
              <li key={row.id} id={`row-${row.id}`} className="scroll-mt-4">
                <div className="flex items-start gap-2">
                  {list === 'addresses' ? <TextArea compact value={row.text} onChange={text} aria-label={`Text of ${label}`} className="flex-1" /> : <Input compact value={row.text} onChange={text} aria-label={`Text of ${label}`} mono className="flex-1" />}
                  <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-ink-muted">
                    Linked to
                    <Select
                      compact
                      accent
                      // A label that is not in Parties shows as it is, until the user selects a party.
                      value={unknown ? `?${row.unknownParty}` : linked ? row.partyId! : NO_PARTY}
                      options={unknown ? [{ value: `?${row.unknownParty}`, label: `${row.unknownParty} · not in Parties` }, ...partyOptions] : partyOptions}
                      onChange={(value) => dispatch({ type: 'contact', list, id: row.id, patch: { partyId: value === NO_PARTY ? null : value } })}
                      invalid={hasCode(rowProblems, 'contact-unknown-party')}
                      aria-label={`Linked to, ${label}`}
                      data-field="party"
                      aria-describedby={describedBy(rowProblems, 'party', problemsId)}
                      width="w-36"
                    />
                  </label>
                  <RemoveButton label={`Remove ${label}`} onClick={() => dispatch({ type: 'remove', list, id: row.id })} />
                </div>
                <RowProblems id={problemsId} list={rowProblems} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
