import { describe, expect, test } from 'vitest';

import { parse } from '../src/shared/parse';
import { serialise } from '../src/shared/serialise';
import { initialState, isDirty, reducer, type AppAction, type AppState } from '../src/renderer/state';
import { EXAMPLE, example, text } from './example';

function opened(value: unknown = EXAMPLE): AppState {
  const result = parse(text(value));
  if (!result.ok) throw new Error('the test data did not load');
  return reducer(initialState(), { type: 'opened', form: result.state, folder: '/scratch/matter-1', stem: 'statement' });
}

const run = (state: AppState, ...actions: AppAction[]) => actions.reduce(reducer, state);
const file = (state: AppState) => JSON.parse(serialise(state.form));

describe('the reducer', () => {
  test('a new form is not dirty, and a change makes it dirty', () => {
    const state = initialState();
    expect(isDirty(state)).toBe(false);
    expect(isDirty(run(state, { type: 'addParty', id: 'a' }))).toBe(true);
    expect(isDirty(run(state, { type: 'name', value: 'statement' }))).toBe(true);
  });

  test('an opened file is not dirty, and a save clears the dirty state', () => {
    const state = opened();
    expect(isDirty(state)).toBe(false);
    const changed = run(state, { type: 'batch', value: 'matter-2' });
    expect(isDirty(changed)).toBe(true);
    expect(isDirty(run(changed, { type: 'saved', folder: '/scratch/matter-1', stem: 'statement' }))).toBe(false);
  });

  test('a typed ending of the name is not a change', () => {
    expect(isDirty(run(opened(), { type: 'name', value: 'statement.docx' }))).toBe(false);
  });

  test('Add party gives the next free label', () => {
    const state = run(initialState(), { type: 'addParty', id: 'a' }, { type: 'addParty', id: 'b' }, { type: 'remove', list: 'parties', id: 'a' }, { type: 'addParty', id: 'c' });
    expect(file(state).intake.parties.map((party: { label: string }) => party.label)).toEqual(['[PARTY B]', '[PARTY A]']);
  });

  test('when a party goes, its addresses and phones change to no party', () => {
    const state = opened();
    const next = run(state, { type: 'remove', list: 'parties', id: state.form.parties[0]!.id });
    expect(file(next).intake.addresses[0].party).toBeNull();
    expect(file(next).intake.phones[0].party).toBeNull();
  });

  test('a choice of a party replaces a label that is not in parties', () => {
    const source = example();
    source.intake.addresses[0].party = '[PARTY Z]';
    const state = opened(source);
    const next = run(state, { type: 'contact', list: 'addresses', id: state.form.addresses[0]!.id, patch: { partyId: null } });
    expect(file(next).intake.addresses[0].party).toBeNull();
  });

  test('an entry of others loses its owner when its type is not an ID type', () => {
    const source = example();
    source.intake.others = [{ type: 'person', text: 'Siti binti Hassan' }, { type: 'nric', text: '900101-01-1234', of: 0 }];
    const state = opened(source);
    const id = state.form.others[1]!.id;
    expect(file(run(state, { type: 'other', id, patch: { type: 'passport' } })).intake.others[1].of).toBe(0);
    expect('of' in file(run(state, { type: 'other', id, patch: { type: 'address' } })).intake.others[1]).toBe(false);
  });

  test('an empty role label is no label', () => {
    const state = run(initialState(), { type: 'addOther', id: 'o' }, { type: 'other', id: 'o', patch: { label: 'SECRETARY 1' } });
    expect(file(state).intake.others[0].label).toBe('[SECRETARY 1]');
    expect('label' in file(run(state, { type: 'other', id: 'o', patch: { label: '' } })).intake.others[0]).toBe(false);
  });

  test('+ form adds a row below with the same entity, expect and type', () => {
    const state = opened();
    const next = run(state, { type: 'addForm', afterId: state.form.redact[0]!.id, id: 'new' });
    expect(file(next).redact.slice(0, 3)).toEqual([
      { text: 'Tan Ah Kow', entity: 'p-tan', expect: 'entered', type: 'party' },
      { text: '', entity: 'p-tan', expect: 'entered', type: 'party' },
      { text: 'Encik Tan', entity: 'p-tan', expect: 'entered', type: 'party' },
    ]);
  });

  test('Add row adds an empty row with detected', () => {
    expect(file(run(initialState(), { type: 'addRedact', id: 'r' })).redact).toEqual([{ text: '', entity: '', expect: 'detected' }]);
  });

  test('a paste of several lines makes one row for each line', () => {
    const state = run(initialState(), { type: 'addRedact', id: 'r' }, { type: 'redact', id: 'r', patch: { entity: 'party-a-address', type: 'address', expect: 'entered' } });
    const next = run(state, { type: 'pasteRedact', id: 'r', lines: ['No. 12, Jalan Mawar 3,', 'Taman Bunga Raya,', '43000 Kajang, Selangor'], ids: ['x', 'y'] });
    expect(file(next).redact).toEqual([
      { text: 'No. 12, Jalan Mawar 3,', entity: 'party-a-address', expect: 'entered', type: 'address' },
      { text: 'Taman Bunga Raya,', entity: 'party-a-address', expect: 'entered', type: 'address' },
      { text: '43000 Kajang, Selangor', entity: 'party-a-address', expect: 'entered', type: 'address' },
    ]);
  });

  test('the next file of the matter keeps batch, intake, alwaysKeep and the folder', () => {
    const state = opened();
    const next = run(state, { type: 'nextFile' });
    expect(file(next)).toEqual({ ...EXAMPLE, redact: [], keep: [], ownTitles: [] });
    expect(next.folder).toBe('/scratch/matter-1');
    expect(next.name).toBe('');
    expect(next.opened).toBeNull();
    expect(next.knownEntities).toEqual(['c-bayu', 'id-tan', 'p-tan', 'w-rajesh']);
    expect(isDirty(next)).toBe(false);
  });

  test('a new file from a file of the same matter keeps the same parts', () => {
    const source = opened().form;
    const next = run(initialState(), { type: 'fromMatter', source, folder: '/scratch/matter-1' });
    expect(file(next)).toEqual({ ...EXAMPLE, redact: [], keep: [], ownTitles: [] });
    expect(next.knownEntities).toEqual(['c-bayu', 'id-tan', 'p-tan', 'w-rajesh']);
    expect(next.opened).toBeNull();
  });

  test('New clears the form', () => {
    const next = run(opened(), { type: 'new' });
    expect(next.form.parties).toEqual([]);
    expect(next.folder).toBe('');
    expect(next.knownEntities).toEqual([]);
  });
});
