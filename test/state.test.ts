import { describe, expect, test } from 'vitest';

import { fillFromIntake } from '../src/shared/fill';
import type { FormState } from '../src/shared/model';
import { parse } from '../src/shared/parse';
import { serialise } from '../src/shared/serialise';
import { initialState, isDirty, pasteLines, reducer, type AppAction, type AppState } from '../src/renderer/state';
import { EXAMPLE, example, text } from './example';

function load(value: unknown = EXAMPLE): FormState {
  const result = parse(text(value));
  if (!result.ok) throw new Error('the test data did not load');
  return result.state;
}

function opened(value: unknown = EXAMPLE): AppState {
  return reducer(initialState(), { type: 'opened', form: load(value), folder: '/scratch/matter-1', stem: 'statement', sameFile: true });
}

/** The example with a person and the NRIC of that person in `others`. */
function withOwner(): any {
  const source = example();
  source.intake.others = [{ type: 'person', text: 'Siti binti Hassan' }, { type: 'nric', text: '900101-01-1234', of: 0 }];
  return source;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
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
    const saved = run(changed, { type: 'saved', folder: '/scratch/matter-1', stem: 'statement', json: serialise(changed.form) });
    expect(isDirty(saved)).toBe(false);
    expect(saved.opened).toEqual({ folder: '/scratch/matter-1', stem: 'statement' });
  });

  test('a change that came after the save stays a change', () => {
    const state = opened();
    const json = serialise(state.form);
    const later = run(state, { type: 'batch', value: 'matter-2' }, { type: 'saved', folder: '/scratch/matter-1', stem: 'statement', json });
    expect(isDirty(later)).toBe(true);
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
    const state = opened(withOwner());
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

  describe('each action leaves the previous state unchanged', () => {
    // A write to a frozen object is an error.
    const state = deepFreeze(run(opened(withOwner()), { type: 'addRedact', id: 'row' }, { type: 'addText', list: 'keep', id: 'case' }));
    const { form } = state;
    const party = form.parties[0]!.id;
    const address = form.addresses[0]!.id;
    const [person, nric] = form.others.map((other) => other.id) as [string, string];
    const actions: AppAction[] = [
      { type: 'batchOn', on: false },
      { type: 'batch', value: 'matter-2' },
      { type: 'addParty', id: 'new' },
      { type: 'party', id: party, patch: { label: 'PARTY C', aliases: ['Encik Tan'] } },
      { type: 'addContact', list: 'emails', id: 'new' },
      { type: 'contact', list: 'addresses', id: address, patch: { text: 'No. 12, Jalan Mawar 3', partyId: null } },
      { type: 'addOther', id: 'new' },
      { type: 'other', id: person, patch: { label: 'SECRETARY 1' } },
      { type: 'other', id: nric, patch: { ownerId: null } },
      { type: 'other', id: nric, patch: { type: 'address' } },
      { type: 'alwaysKeep', values: [] },
      { type: 'addRedact', id: 'new' },
      { type: 'addForm', afterId: 'row', id: 'new' },
      { type: 'redact', id: 'row', patch: { text: 'Cik Siti', entity: 'person-1', expect: 'entered', type: 'person' } },
      { type: 'pasteRedact', id: 'row', lines: ['Cik Siti', 'Puan Siti'], ids: ['new'] },
      { type: 'addText', list: 'ownTitles', id: 'new' },
      { type: 'text', list: 'keep', id: 'case', value: 'Lim Ah Chai v Bank Bumi Bhd' },
      { type: 'remove', list: 'parties', id: party },
      { type: 'remove', list: 'addresses', id: address },
      { type: 'remove', list: 'others', id: person },
      { type: 'remove', list: 'redact', id: 'row' },
      { type: 'remove', list: 'keep', id: 'case' },
      { type: 'folder', value: '/scratch/matter-2' },
      { type: 'name', value: 'affidavit' },
      { type: 'target', folder: '/scratch/matter-2', name: 'affidavit' },
      { type: 'filled', ...fillFromIntake(form) },
      { type: 'new' },
      { type: 'opened', form, folder: '/scratch/matter-2', stem: 'affidavit', sameFile: true },
      { type: 'fromMatter', source: form, folder: '/scratch/matter-2' },
      { type: 'nextFile' },
      { type: 'saved', folder: '/scratch/matter-1', stem: 'statement', json: serialise(form) },
    ];

    test.each(actions.map((action, n) => [n, action.type, action] as const))('action %i: %s', (_n, _type, action) => {
      const before = structuredClone(state);
      const next = reducer(state, deepFreeze(action));
      expect(state).toEqual(before);
      // The action did its work, on a copy.
      expect(next).not.toEqual(before);
    });
  });

  test('a remove of an entry of others clears the owner link of the entries that it owned', () => {
    const state = opened(withOwner());
    const [person, nric] = state.form.others;
    expect(nric!.ownerId).toBe(person!.id);
    const next = run(state, { type: 'remove', list: 'others', id: person!.id });
    expect(next.form.others).toEqual([{ ...nric, ownerId: null }]);
    expect(file(next).intake.others).toEqual([{ type: 'nric', text: '900101-01-1234' }]);
  });

  test('the batch switch keeps the value, and off then on is not a change', () => {
    const state = opened();
    const off = run(state, { type: 'batchOn', on: false });
    expect('batch' in file(off)).toBe(false);
    expect(off.form.batch).toBe('matter-1');
    expect(isDirty(off)).toBe(true);
    const on = run(off, { type: 'batchOn', on: true });
    expect(file(on).batch).toBe('matter-1');
    expect(isDirty(on)).toBe(false);
  });

  test('the fill sets the note with the counts, and New and an open clear it', () => {
    const state = opened();
    expect(state.fillNote).toBeNull();
    const filled = run(state, { type: 'filled', ...fillFromIntake(state.form) });
    // Added: two short forms, the address and the phone. Skipped: two full names and one ID number.
    expect(filled.fillNote).toEqual({ added: 4, skipped: 3 });
    expect(filled.form.redact).toHaveLength(9);
    expect(isDirty(filled)).toBe(true);
    expect(run(filled, { type: 'new' }).fillNote).toBeNull();
    expect(run(filled, { type: 'opened', form: load(), folder: '/scratch/matter-1', stem: 'statement', sameFile: true }).fillNote).toBeNull();
  });

  test('the next file two times collects the entity ids of both files', () => {
    const second = run(opened(), { type: 'nextFile' }, { type: 'addRedact', id: 'r' }, { type: 'redact', id: 'r', patch: { text: 'Siti binti Hassan', entity: 'w-siti' } });
    expect(second.knownEntities).toEqual(['c-bayu', 'id-tan', 'p-tan', 'w-rajesh']);
    const third = run(second, { type: 'nextFile' });
    expect(third.knownEntities).toEqual(['c-bayu', 'id-tan', 'p-tan', 'w-rajesh', 'w-siti']);
    expect(third.form.redact).toEqual([]);
  });

  test('+ form and a paste for a row that is not in the list change nothing', () => {
    const state = opened();
    expect(reducer(state, { type: 'addForm', afterId: 'not-a-row', id: 'new' })).toBe(state);
    expect(reducer(state, { type: 'pasteRedact', id: 'not-a-row', lines: ['Cik Siti', 'Puan Siti'], ids: ['new'] })).toBe(state);
    expect(reducer(state, { type: 'pasteRedact', id: state.form.redact[0]!.id, lines: [], ids: [] })).toBe(state);
  });

  test('a paste puts the first line in the row and the other lines in rows directly below', () => {
    const state = opened();
    const source = state.form.redact[1]!;
    const next = run(state, { type: 'pasteRedact', id: source.id, lines: ['Cik Siti', 'Puan Siti', 'Siti binti Hassan'], ids: ['x', 'y'] });
    expect(next.form.redact.slice(0, 5)).toEqual([
      state.form.redact[0],
      { id: source.id, text: 'Cik Siti', entity: 'p-tan', expect: 'entered', type: 'party' },
      { id: 'x', text: 'Puan Siti', entity: 'p-tan', expect: 'entered', type: 'party' },
      { id: 'y', text: 'Siti binti Hassan', entity: 'p-tan', expect: 'entered', type: 'party' },
      state.form.redact[2],
    ]);
    expect(next.form.redact).toHaveLength(7);
    expect(new Set(next.form.redact.map((row) => row.id)).size).toBe(7);
  });

  test('the lines of a paste: CRLF, spaces at the ends and empty lines', () => {
    expect(pasteLines('No. 12, Jalan Mawar 3,\r\nTaman Bunga Raya,\r\n43000 Kajang, Selangor\r\n')).toEqual(['No. 12, Jalan Mawar 3,', 'Taman Bunga Raya,', '43000 Kajang, Selangor']);
    expect(pasteLines('  Cik Siti \n\n \t \nPuan Siti\n')).toEqual(['Cik Siti', 'Puan Siti']);
    expect(pasteLines('Cik Siti')).toEqual(['Cik Siti']);
    expect(pasteLines(' \r\n\n')).toEqual([]);
  });

  test('a patch with the same value is not a change', () => {
    const state = opened(withOwner());
    const { form } = state;
    const same = run(
      state,
      { type: 'batchOn', on: form.batchOn },
      { type: 'batch', value: form.batch },
      { type: 'party', id: form.parties[0]!.id, patch: { label: 'PARTY A', fullName: 'Tan Ah Kow', aliases: ['Ah Kow'] } },
      { type: 'contact', list: 'phones', id: form.phones[0]!.id, patch: { text: '012-345 6789', partyId: form.parties[0]!.id } },
      { type: 'other', id: form.others[1]!.id, patch: { type: 'nric', ownerId: form.others[0]!.id } },
      { type: 'alwaysKeep', values: ['Pejabat Tanah'] },
      { type: 'redact', id: form.redact[0]!.id, patch: { text: 'Tan Ah Kow', entity: 'p-tan', expect: 'entered', type: 'party' } },
      { type: 'folder', value: '/scratch/matter-1' },
      { type: 'name', value: 'statement' },
    );
    expect(isDirty(same)).toBe(false);
    expect(same.form).toEqual(form);
  });

  test('an open of the file that Save writes makes that file the opened file', () => {
    const state = run(initialState(), { type: 'opened', form: load(), folder: '/scratch/matter-1', stem: 'statement', sameFile: true });
    expect(state.opened).toEqual({ folder: '/scratch/matter-1', stem: 'statement' });
    expect(isDirty(state)).toBe(false);
  });

  test('an open of a file that Save does not write gives no opened file', () => {
    // For example `statement.json`: Save writes `statement.truth.json`, and that is another file.
    const state = run(initialState(), { type: 'opened', form: load(), folder: '/scratch/matter-1', stem: 'statement', sameFile: false });
    expect(state.opened).toBeNull();
    expect(state.folder).toBe('/scratch/matter-1');
    expect(state.name).toBe('statement');
    expect(file(state)).toEqual(EXAMPLE);
    expect(isDirty(state)).toBe(false);
    // The save makes the target the file of the form.
    const saved = run(state, { type: 'saved', folder: '/scratch/matter-1', stem: 'statement', json: serialise(state.form) });
    expect(saved.opened).toEqual({ folder: '/scratch/matter-1', stem: 'statement' });
  });
});
