import { describe, expect, test } from 'vitest';

import { fillFromIntake } from '../src/shared/fill';
import type { FormState } from '../src/shared/model';
import { parse } from '../src/shared/parse';
import { serialise } from '../src/shared/serialise';
import { cleanStem } from '../src/shared/target';
import { validate } from '../src/shared/validate';
import { entityIds, initialState, isBlankLabel, isDirty, isOwnFile, pasteLines, reducer, shownTargetState, type AppAction, type AppState, type FoundTarget, type Target } from '../src/renderer/state';
import { EXAMPLE, example, text } from './example';

function load(value: unknown = EXAMPLE): FormState {
  const result = parse(text(value));
  if (!result.ok) throw new Error('the test data did not load');
  return result.state;
}

function opened(value: unknown = EXAMPLE): AppState {
  return reducer(initialState(), { type: 'opened', form: load(value), folder: '/scratch/matter-1', stem: 'statement', file: 'statement.truth.json', sameFile: true });
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
    const saved = run(changed, { type: 'saved', folder: '/scratch/matter-1', stem: 'statement', json: serialise(changed.form), formNo: changed.formNo });
    expect(isDirty(saved)).toBe(false);
    expect(saved.opened).toEqual({ folder: '/scratch/matter-1', stem: 'statement' });
  });

  test('a change that came after the save stays a change', () => {
    const state = opened();
    const json = serialise(state.form);
    const later = run(state, { type: 'batch', value: 'matter-2' }, { type: 'saved', folder: '/scratch/matter-1', stem: 'statement', json, formNo: state.formNo });
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

  test('a role label of spaces only is blank when the user leaves the field, and is not trimmed while the user types', () => {
    expect(isBlankLabel(null)).toBe(false);
    expect(isBlankLabel('')).toBe(true);
    expect(isBlankLabel('   ')).toBe(true);
    expect(isBlankLabel(' \t ')).toBe(true);
    expect(isBlankLabel(' SECRETARY 1 ')).toBe(false);
    // A typed `[]` is not blank: the user clears the field to remove it. (A loaded `[]` has the label `''` in the state.)
    expect(isBlankLabel('[]')).toBe(false);

    const target = { folder: '/scratch/matter-1', stem: 'statement', folderExists: true, wordFileExists: true };
    const codes = (state: AppState) => validate(state.form, target).map((problem) => problem.code);
    const typed = run(initialState(), { type: 'addOther', id: 'o' }, { type: 'other', id: 'o', patch: { label: ' ' } });
    expect(typed.form.others[0]!.label).toBe(' ');
    expect(codes(typed)).toContain('other-label-empty');
    // The field, left: the label goes, and the error with it.
    expect(isBlankLabel(typed.form.others[0]!.label)).toBe(true);
    const left = run(typed, { type: 'other', id: 'o', patch: { label: null } });
    expect(left.form.others[0]!.label).toBeNull();
    expect(codes(left)).not.toContain('other-label-empty');
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

  test('the next file takes the intake as it is now, also a change that is not saved', () => {
    // The question before the next file says this: the next file keeps the intake as it is now.
    const state = opened();
    const changed = run(state, { type: 'party', id: state.form.parties[0]!.id, patch: { fullName: 'Tan Ah Kau' } });
    expect(isDirty(changed)).toBe(true);
    const next = run(changed, { type: 'nextFile' });
    expect(file(next).intake.parties[0].fullName).toBe('Tan Ah Kau');
    expect(file(next).redact).toEqual([]);
  });

  test('after a save with a folder text that has a slash at its end, the form is not dirty', () => {
    const state = run(opened(), { type: 'folder', value: '/scratch/matter-1/' });
    const saved = run(state, { type: 'saved', folder: '/scratch/matter-1/', stem: 'statement', json: serialise(state.form), formNo: state.formNo });
    expect(isDirty(saved)).toBe(false);
  });

  test('a new file from a file of the same matter keeps the same parts', () => {
    const source = opened().form;
    const next = run(initialState(), { type: 'fromMatter', source, folder: '/scratch/matter-1' });
    expect(file(next)).toEqual({ ...EXAMPLE, redact: [], keep: [], ownTitles: [] });
    expect(next.knownEntities).toEqual(['c-bayu', 'id-tan', 'p-tan', 'w-rajesh']);
    expect(next.opened).toBeNull();
  });

  test('the next file and a new file of the same matter keep the ids of the rows of the intake', () => {
    // So the page needs the number of the form to give a new form new components.
    const state = opened(withOwner());
    const intakeIds = ({ parties, addresses, emails, phones, others }: FormState) => [parties, addresses, emails, phones, others].map((rows) => rows.map((row) => row.id));
    expect(state.form.parties).toHaveLength(2);

    const next = run(state, { type: 'nextFile' });
    expect(next.form.parties.map((party) => party.id)).toEqual(state.form.parties.map((party) => party.id));
    expect(intakeIds(next.form)).toEqual(intakeIds(state.form));
    expect(next.formNo).not.toBe(state.formNo);

    const fromMatter = run(initialState(), { type: 'fromMatter', source: state.form, folder: '/scratch/matter-1' });
    expect(fromMatter.form.parties.map((party) => party.id)).toEqual(state.form.parties.map((party) => party.id));
    expect(intakeIds(fromMatter.form)).toEqual(intakeIds(state.form));
    expect(fromMatter.formNo).not.toBe(initialState().formNo);
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
      { type: 'pickedFolder', value: '/scratch/matter-2' },
      { type: 'target', folder: '/scratch/matter-2', name: 'affidavit' },
      { type: 'filled', ...fillFromIntake(form) },
      { type: 'new' },
      { type: 'opened', form, folder: '/scratch/matter-2', stem: 'affidavit', file: 'affidavit.truth.json', sameFile: true },
      { type: 'fromMatter', source: form, folder: '/scratch/matter-2' },
      { type: 'nextFile' },
      { type: 'saved', folder: '/scratch/matter-1', stem: 'statement', json: serialise(form), formNo: state.formNo },
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
    expect(run(filled, { type: 'opened', form: load(), folder: '/scratch/matter-1', stem: 'statement', file: 'statement.truth.json', sameFile: true }).fillNote).toBeNull();
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

  test('a paste gives each new row an id that no other row has, also with too few ids and for a second paste', () => {
    const lines = ['Cik Siti', 'Puan Siti', 'Siti binti Hassan'];
    const ids = (state: AppState) => state.form.redact.map((row) => row.id);
    const texts = (state: AppState) => state.form.redact.map((row) => row.text);
    const start = run(initialState(), { type: 'addRedact', id: 'r' });

    // The action has no id for the two new rows. No line is lost.
    const first = run(start, { type: 'pasteRedact', id: 'r', lines, ids: [] });
    expect(texts(first)).toEqual(lines);
    expect(ids(first)[0]).toBe('r');
    expect(new Set(ids(first)).size).toBe(3);

    // A second paste into the same row, and a paste into a row that the first paste made.
    const second = run(first, { type: 'pasteRedact', id: 'r', lines, ids: [] });
    expect(texts(second)).toEqual(['Cik Siti', 'Puan Siti', 'Siti binti Hassan', 'Puan Siti', 'Siti binti Hassan']);
    expect(new Set(ids(second)).size).toBe(5);
    const third = run(second, { type: 'pasteRedact', id: ids(second)[1]!, lines, ids: [] });
    expect(texts(third)).toHaveLength(7);
    expect(new Set(ids(third)).size).toBe(7);
    // The rows that were there keep their ids.
    expect(ids(third).filter((id) => ids(second).includes(id))).toEqual(ids(second));

    // One id for two new rows: the first new row gets it.
    const some = run(second, { type: 'pasteRedact', id: 'r', lines, ids: ['x'] });
    expect(ids(some).slice(0, 2)).toEqual(['r', 'x']);
    expect(new Set(ids(some)).size).toBe(7);

    // An id for each new row, two times.
    const full = run(start, { type: 'pasteRedact', id: 'r', lines, ids: ['x', 'y'] }, { type: 'pasteRedact', id: 'r', lines, ids: ['z', 'w'] });
    expect(ids(full)).toEqual(['r', 'z', 'w', 'x', 'y']);
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
    const state = run(initialState(), { type: 'opened', form: load(), folder: '/scratch/matter-1', stem: 'statement', file: 'statement.truth.json', sameFile: true });
    expect(state.opened).toEqual({ folder: '/scratch/matter-1', stem: 'statement' });
    expect(isDirty(state)).toBe(false);
  });

  test('an open of a file that Save does not write gives no opened file', () => {
    // For example `statement.json`: Save writes `statement.truth.json`, and that is another file.
    const state = run(initialState(), { type: 'opened', form: load(), folder: '/scratch/matter-1', stem: 'statement', file: 'statement.json', sameFile: false });
    expect(state.opened).toBeNull();
    expect(state.folder).toBe('/scratch/matter-1');
    expect(state.name).toBe('statement');
    expect(file(state)).toEqual(EXAMPLE);
    expect(isDirty(state)).toBe(false);
    // The save makes the target the file of the form.
    const saved = run(state, { type: 'saved', folder: '/scratch/matter-1', stem: 'statement', json: serialise(state.form), formNo: state.formNo });
    expect(saved.opened).toEqual({ folder: '/scratch/matter-1', stem: 'statement' });
  });

  test('when a party goes, its emails change to no party', () => {
    const source = example();
    source.intake.emails = [
      { text: 'tan@example.test', party: '[PARTY A]' },
      { text: 'bayu@example.test', party: '[PARTY B]' },
    ];
    const state = opened(source);
    const next = run(state, { type: 'remove', list: 'parties', id: state.form.parties[0]!.id });
    expect(file(next).intake.emails).toEqual([
      { text: 'tan@example.test', party: null },
      { text: 'bayu@example.test', party: '[PARTY B]' },
    ]);
  });

  test('a space at the end of the folder text is not a change', () => {
    const state = opened();
    expect(isDirty(run(state, { type: 'folder', value: '/scratch/matter-1 ' }))).toBe(false);
    expect(isDirty(run(state, { type: 'folder', value: ' /scratch/matter-1\t' }))).toBe(false);
    expect(isDirty(run(state, { type: 'folder', value: '/scratch/matter-2 ' }))).toBe(true);
  });

  test('the entity ids of the rows: no space at the ends, no empty id, each id one time, in order', () => {
    const row = (entity: string) => ({ id: entity, text: 'Tan Ah Kow', entity, expect: 'entered', type: 'party' });
    expect(entityIds([row(' p-tan '), row('c-bayu'), row('p-tan'), row(''), row('   '), row('P-tan')])).toEqual(['P-tan', 'c-bayu', 'p-tan']);
    expect(entityIds([row('p-tan')], ['w-rajesh', 'c-bayu', 'p-tan', ''])).toEqual(['c-bayu', 'p-tan', 'w-rajesh']);
    expect(entityIds([])).toEqual([]);
  });
});

describe('the name of the file in the top bar', () => {
  const open = (file: string, sameFile: boolean) => run(initialState(), { type: 'opened', form: load(), folder: '/scratch/matter-1', stem: 'statement', file, sameFile });

  test('a new file has no name', () => {
    expect(initialState().fileName).toBeNull();
  });

  test('an open of the file that Save writes gives the name of that file', () => {
    expect(open('statement.truth.json', true).fileName).toBe('statement.truth.json');
  });

  test.each(['statement.json', 'statement.TRUTH.JSON'])('an open of a file that Save does not write gives the name of the picked file: %s', (name) => {
    const state = open(name, false);
    expect(state.fileName).toBe(name);
    // Save still asks before it replaces `statement.truth.json`, and the form has no unsaved change.
    expect(state.opened).toBeNull();
    expect(isDirty(state)).toBe(false);
  });

  test('a save gives the name of the file that the save wrote', () => {
    const state = open('statement.json', false);
    const saved = run(state, { type: 'saved', folder: '/scratch/matter-1', stem: 'statement', json: serialise(state.form), formNo: state.formNo });
    expect(saved.fileName).toBe('statement.truth.json');

    const first = run(initialState(), { type: 'target', folder: '/scratch/matter-1', name: 'affidavit.docx' });
    expect(first.fileName).toBeNull();
    expect(run(first, { type: 'saved', folder: '/scratch/matter-1', stem: 'affidavit', json: serialise(first.form), formNo: first.formNo }).fileName).toBe('affidavit.truth.json');
  });

  test('a change of the form, the folder or the name keeps the name of the file', () => {
    const state = run(open('statement.json', false), { type: 'batch', value: 'matter-2' }, { type: 'folder', value: '/scratch/matter-2' }, { type: 'name', value: 'affidavit' }, { type: 'pickedFolder', value: '/scratch/matter-3' });
    expect(state.fileName).toBe('statement.json');
    expect(isDirty(state)).toBe(true);
  });

  test.each<[string, AppAction]>([
    ['New', { type: 'new' }],
    ['New from same matter', { type: 'fromMatter', source: load(), folder: '/scratch/matter-1' }],
    ['the next file', { type: 'nextFile' }],
  ])('%s clears the name', (_name, action) => {
    expect(run(open('statement.truth.json', true), action).fileName).toBeNull();
    expect(run(open('statement.json', false), action).fileName).toBeNull();
  });
});

describe('the files that Save replaces with no question', () => {
  const FOLDER = '/scratch/matter-1';
  const open = (file: string, sameFile: boolean) => run(initialState(), { type: 'opened', form: load(), folder: FOLDER, stem: 'statement', file, sameFile });
  /** The result of a save of the target that the form has now. */
  const save = (state: AppState) => run(state, { type: 'saved', folder: state.folder.trim(), stem: cleanStem(state.name), json: serialise(state.form), formNo: state.formNo });
  const rename = (state: AppState, value: string) => run(state, { type: 'name', value });
  /** `true` when Save replaces the target that the form has now with no question. */
  const isOwn = (state: AppState) => isOwnFile(state, state.folder.trim(), cleanStem(state.name));

  test('a new form has no file', () => {
    expect(initialState().ownFiles).toEqual([]);
    expect(isOwn(run(initialState(), { type: 'target', folder: FOLDER, name: 'statement' }))).toBe(false);
  });

  test('the opened file, also after a save under another name and a change back', () => {
    const state = open('statement.truth.json', true);
    expect(isOwn(state)).toBe(true);

    // Another name: the form did not open that file and did not save it.
    const other = rename(state, 'affidavit');
    expect(isOwn(other)).toBe(false);
    const saved = save(other);
    expect(isOwn(saved)).toBe(true);

    // The name of the opened file again: the form did open it.
    const back = rename(saved, 'statement');
    expect(isOwn(back)).toBe(true);
    expect(isOwn(save(back))).toBe(true);
    expect(isOwn(rename(save(back), 'affidavit'))).toBe(true);
    // A third name is the name of no file of the form.
    expect(isOwn(rename(back, 'reply'))).toBe(false);
  });

  test('an open of a file that Save does not write gives no file, until the save', () => {
    // For example `statement.json`: Save writes `statement.truth.json`, and the form did not open that file.
    const state = open('statement.json', false);
    expect(state.ownFiles).toEqual([]);
    expect(isOwn(state)).toBe(false);
    expect(isOwn(save(state))).toBe(true);
  });

  test('a file is the same file with another way to write the folder, and not in another folder', () => {
    const state = open('statement.truth.json', true);
    expect(isOwnFile(state, `${FOLDER}/`, 'statement')).toBe(true);
    expect(isOwnFile(state, ` ${FOLDER} `, 'statement')).toBe(true);
    expect(isOwnFile(state, '/scratch/matter-2', 'statement')).toBe(false);
    expect(isOwn(run(state, { type: 'pickedFolder', value: '/scratch/matter-2' }))).toBe(false);
    // The comparison is of the text. A name with other capital letters is another name.
    expect(isOwnFile(state, FOLDER, 'Statement')).toBe(false);
  });

  test('a second save of a file does not add the file again', () => {
    const state = save(rename(open('statement.truth.json', true), 'affidavit'));
    expect(state.ownFiles).toHaveLength(2);
    expect(save(save(state)).ownFiles).toEqual(state.ownFiles);
    expect(save(rename(state, 'statement')).ownFiles).toEqual(state.ownFiles);
  });

  test.each<[string, AppAction, string[]]>([
    ['New', { type: 'new' }, []],
    ['an open of another file', { type: 'opened', form: load(), folder: '/scratch/matter-2', stem: 'reply', file: 'reply.truth.json', sameFile: true }, ['reply']],
    ['an open of a file that Save does not write', { type: 'opened', form: load(), folder: FOLDER, stem: 'statement', file: 'statement.json', sameFile: false }, []],
    ['New from same matter', { type: 'fromMatter', source: load(), folder: FOLDER }, []],
    ['the next file', { type: 'nextFile' }, []],
  ])('after %s, the form forgets the files of the form before it', (_name, action, own) => {
    const before = save(rename(open('statement.truth.json', true), 'affidavit'));
    expect(before.ownFiles).toHaveLength(2);
    const next = run(before, action);
    expect(next.ownFiles).toHaveLength(own.length);
    for (const stem of ['statement', 'affidavit']) expect(isOwnFile(next, FOLDER, stem)).toBe(false);
    for (const stem of own) expect(isOwnFile(next, next.folder, stem)).toBe(true);
    // The next file keeps the folder: a save of the old name there asks again.
    expect(isOwn(rename(next, 'affidavit'))).toBe(false);
  });

  test('the result of a save of another form adds no file', () => {
    const before = rename(open('statement.truth.json', true), 'affidavit');
    const next = run(before, { type: 'nextFile' });
    const late = run(next, { type: 'saved', folder: FOLDER, stem: 'affidavit', json: serialise(before.form), formNo: before.formNo });
    expect(late.ownFiles).toEqual([]);
  });
});

describe('a save result that comes late', () => {
  const others: [string, AppAction][] = [
    ['New', { type: 'new' }],
    ['an open', { type: 'opened', form: load(), folder: '/scratch/matter-2', stem: 'affidavit', file: 'affidavit.truth.json', sameFile: true }],
    ['New from same matter', { type: 'fromMatter', source: load(), folder: '/scratch/matter-1' }],
    ['the next file', { type: 'nextFile' }],
  ];

  test.each(others)('after %s, the result of a save of the form before it changes nothing', (_name, action) => {
    const before = run(opened(), { type: 'batch', value: 'matter-2' });
    const saved: AppAction = { type: 'saved', folder: before.folder, stem: cleanStem(before.name), json: serialise(before.form), formNo: before.formNo };
    const next = run(before, action);
    expect(next.formNo).not.toBe(before.formNo);
    expect(reducer(next, saved)).toBe(next);
  });

  test('an open of the same file again is another form', () => {
    const before = run(opened(), { type: 'batch', value: 'matter-2' });
    const again = run(before, { type: 'opened', form: load(), folder: '/scratch/matter-1', stem: 'statement', file: 'statement.truth.json', sameFile: true }, { type: 'batch', value: 'matter-3' });
    const late = run(again, { type: 'saved', folder: '/scratch/matter-1', stem: 'statement', json: serialise(before.form), formNo: before.formNo });
    expect(late).toBe(again);
    expect(isDirty(late)).toBe(true);
  });

  test('a change of the rows, the folder or the name is not another form', () => {
    const before = opened();
    const later = run(before, { type: 'batch', value: 'matter-2' }, { type: 'folder', value: '/scratch/matter-2' }, { type: 'name', value: 'affidavit' }, { type: 'pickedFolder', value: '/scratch/matter-3' }, { type: 'target', folder: '/scratch/matter-4', name: 'reply' });
    expect(later.formNo).toBe(before.formNo);
    const saved = run(later, { type: 'saved', folder: '/scratch/matter-1', stem: 'statement', json: serialise(before.form), formNo: before.formNo });
    expect(saved.opened).toEqual({ folder: '/scratch/matter-1', stem: 'statement' });
    // The form has another target and another batch now.
    expect(isDirty(saved)).toBe(true);
  });

  test('each new form has a number that no form before it had', () => {
    const numbers = [initialState()];
    for (const [, action] of [...others, ...others]) numbers.push(run(numbers.at(-1)!, action));
    expect(new Set(numbers.map((state) => state.formNo)).size).toBe(numbers.length);
  });
});

describe('the state of the disk that the form shows', () => {
  const MISSING = { folderExists: false, truthExists: false, wordFileExists: false };
  const NO_WORD_FILE = { folderExists: true, truthExists: true, wordFileExists: false };

  const targetOf = (state: AppState): Target => ({ folder: state.folder, stem: cleanStem(state.name), targetNo: state.targetNo });
  const resultFor = (state: AppState, found: FoundTarget['state']): FoundTarget => ({ ...targetOf(state), state: found });
  /** The problems of the disk that the form shows, as `App` gets them. */
  const diskProblems = (state: AppState, last: FoundTarget | null) => {
    const found = shownTargetState(targetOf(state), last);
    const target = { folder: state.folder, stem: cleanStem(state.name), folderExists: found?.folderExists ?? true, wordFileExists: found?.wordFileExists ?? true };
    return validate(state.form, target)
      .map((problem) => problem.code)
      .filter((code) => code === 'target-folder-missing' || code === 'no-word-file');
  };

  // Each command that gives the form a new target.
  const commands: [string, AppAction][] = [
    ['Open', { type: 'opened', form: load(), folder: '/scratch/matter-2', stem: 'affidavit', file: 'affidavit.truth.json', sameFile: true }],
    ['Browse', { type: 'pickedFolder', value: '/scratch/matter-2' }],
    ['Take from a Word file', { type: 'target', folder: '/scratch/matter-2', name: 'affidavit' }],
    ['New', { type: 'new' }],
    ['New from same matter', { type: 'fromMatter', source: load(), folder: '/scratch/matter-2' }],
    ['the next file', { type: 'nextFile' }],
  ];

  test('with no result, the form shows no state', () => {
    expect(shownTargetState(targetOf(opened()), null)).toBeNull();
    expect(diskProblems(opened(), null)).toEqual([]);
  });

  test('the result for the target of the form is the state', () => {
    const state = opened();
    expect(shownTargetState(targetOf(state), resultFor(state, MISSING))).toBe(MISSING);
    expect(diskProblems(state, resultFor(state, MISSING))).toEqual(['target-folder-missing']);
    expect(diskProblems(state, resultFor(state, NO_WORD_FILE))).toEqual(['no-word-file']);
  });

  describe.each(commands)('after %s', (_name, command) => {
    test.each([
      ['a folder that does not exist', MISSING],
      ['no Word file', NO_WORD_FILE],
    ])('an old result of %s gives no state and no problem', (_what, found) => {
      const before = opened();
      const last = resultFor(before, found);
      const next = run(before, command);
      expect(shownTargetState(targetOf(next), last)).toBeNull();
      expect(diskProblems(next, last)).toEqual([]);
    });

    test('an old result gives no state when the user types before the new result comes', () => {
      const before = opened();
      const last = resultFor(before, MISSING);
      const next = run(before, command, { type: 'folder', value: '/scratch/matter-3' }, { type: 'name', value: 'reply' });
      expect(shownTargetState(targetOf(next), last)).toBeNull();
    });

    test('the result for the new target is the state', () => {
      const next = run(opened(), command);
      expect(shownTargetState(targetOf(next), resultFor(next, MISSING))).toBe(MISSING);
    });
  });

  test('while the user types in the folder field, the form shows the last result', () => {
    const before = run(opened(), { type: 'folder', value: '/scratch/matter' });
    const last = resultFor(before, MISSING);
    let state = before;
    for (const value of ['/scratch/matter-', '/scratch/matter-2', '/scratch/matter-2/', '/scratch/matter-2/a']) {
      state = run(state, { type: 'folder', value });
      expect(shownTargetState(targetOf(state), last)).toBe(MISSING);
      expect(diskProblems(state, last)).toEqual(['target-folder-missing']);
    }
    // The new result replaces the last one.
    const found = resultFor(state, NO_WORD_FILE);
    expect(shownTargetState(targetOf(state), found)).toBe(NO_WORD_FILE);
    expect(diskProblems(state, found)).toEqual(['no-word-file']);
  });

  test('while the user types in the name field, the form shows the last result', () => {
    const before = opened();
    const last = resultFor(before, NO_WORD_FILE);
    let state = before;
    for (const value of ['statement-', 'statement-2', 'statement-2.docx']) {
      state = run(state, { type: 'name', value });
      expect(shownTargetState(targetOf(state), last)).toBe(NO_WORD_FILE);
      expect(diskProblems(state, last)).toEqual(['no-word-file']);
    }
  });

  test('a change of the rows does not change the target', () => {
    const before = opened();
    const next = run(before, { type: 'batch', value: 'matter-2' }, { type: 'addParty', id: 'new' }, { type: 'saved', folder: before.folder, stem: 'statement', json: serialise(before.form), formNo: before.formNo });
    expect(targetOf(next)).toEqual(targetOf(before));
  });

  test('a command that gives the same folder and name keeps the result of that target', () => {
    const before = opened();
    const last = resultFor(before, NO_WORD_FILE);
    const again = run(before, { type: 'target', folder: before.folder, name: 'statement.docx' });
    expect(again.targetNo).not.toBe(before.targetNo);
    expect(shownTargetState(targetOf(again), last)).toBe(NO_WORD_FILE);
  });

  test('after a command that gives the same folder and name, a typed change shows only a result that came after the command', () => {
    const before = opened();
    const last = resultFor(before, NO_WORD_FILE);
    const again = run(before, { type: 'target', folder: before.folder, name: 'statement' });
    expect(targetOf(again)).toEqual({ ...targetOf(before), targetNo: again.targetNo });
    expect(again.targetNo).not.toBe(before.targetNo);
    expect(shownTargetState(targetOf(again), last)).toBe(NO_WORD_FILE);
    expect(diskProblems(again, last)).toEqual(['no-word-file']);

    // The user types. The old result is for another folder and name now, and it came before the command.
    const typed = run(again, { type: 'name', value: 'statement-2' });
    expect(typed.targetNo).toBe(again.targetNo);
    expect(shownTargetState(targetOf(typed), last)).toBeNull();
    expect(diskProblems(typed, last)).toEqual([]);

    // The result that came after the command has the number of the command. The form shows it while the user types.
    const found = resultFor(again, MISSING);
    expect(shownTargetState(targetOf(typed), found)).toBe(MISSING);
    expect(diskProblems(typed, found)).toEqual(['target-folder-missing']);
    // The result for the typed target replaces it.
    expect(shownTargetState(targetOf(typed), resultFor(typed, NO_WORD_FILE))).toBe(NO_WORD_FILE);
  });
});

