import { describe, expect, test } from 'vitest';

import { newId, type FormState } from '../src/shared/model';
import { parse } from '../src/shared/parse';
import { validate, type Problem, type TargetInfo } from '../src/shared/validate';
import { EXAMPLE, example, text } from './example';

const TARGET: TargetInfo = { folder: '/scratch/matter-1', stem: 'statement', folderExists: true, wordFileExists: true };

function load(value: unknown = EXAMPLE): FormState {
  const result = parse(text(value));
  if (!result.ok) throw new Error('the test data did not load');
  return result.state;
}

function withOthers(others: unknown[]): FormState {
  const file = example();
  file.intake.others = others;
  return load(file);
}

const codes = (problems: Problem[], level: Problem['level']) => problems.filter((p) => p.level === level).map((p) => p.code);

describe('the example', () => {
  test('has no error and no warning', () => {
    expect(validate(load(), TARGET)).toEqual([]);
  });
});

describe('errors', () => {
  test('1: a party label is empty', () => {
    const state = load();
    state.parties[0]!.label = ' [ ] ';
    expect(validate(state, TARGET)).toContainEqual({ level: 'error', section: 'parties', rowId: state.parties[0]!.id, code: 'party-label-empty' });
  });

  test.each(['PARTY [A', 'PARTY ]A', '[[PARTY A]]'])('1: a party label has a bracket inside it: %s', (label) => {
    const state = load();
    state.parties[0]!.label = label;
    expect(validate(state, TARGET)).toContainEqual({ level: 'error', section: 'parties', rowId: state.parties[0]!.id, code: 'party-label-bracket' });
  });

  test('1: a party label is the label of another party', () => {
    const state = load();
    state.parties[1]!.label = '[party   a]';
    const problems = validate(state, TARGET);
    expect(problems).toContainEqual({ level: 'error', section: 'parties', rowId: state.parties[0]!.id, code: 'party-label-duplicate' });
    expect(problems).toContainEqual({ level: 'error', section: 'parties', rowId: state.parties[1]!.id, code: 'party-label-duplicate' });
  });

  test.each(['addresses', 'emails', 'phones'] as const)('2: an entry of %s names a party that is not in parties', (list) => {
    const file = example();
    file.intake[list] = [{ text: 'x', party: '[PARTY Z]' }];
    const state = load(file);
    expect(validate(state, TARGET)).toContainEqual({ level: 'error', section: list, rowId: state[list][0]!.id, code: 'contact-unknown-party' });
  });

  test('3: an entry with an of is not an ID type', () => {
    const state = withOthers([{ type: 'person', text: 'Siti binti Hassan' }, { type: 'address', text: 'Lot 5', of: 0 }]);
    expect(codes(validate(state, TARGET), 'error')).toEqual(['of-not-id-type']);
  });

  test.each(['nric', 'passport', 'company-no', 'id-no'])('3: an entry of type %s can have an of', (type) => {
    const state = withOthers([{ type: 'person', text: 'Siti binti Hassan' }, { type, text: '123', of: 0 }]);
    expect(validate(state, TARGET)).toEqual([]);
  });

  test('3: the owner is the entry itself', () => {
    const state = withOthers([{ type: 'nric', text: '900101-01-1234', of: 0 }]);
    expect(codes(validate(state, TARGET), 'error')).toContain('of-self');
  });

  test.each([5, -1, 1.5])('3: the owner is not in the list: %s', (of) => {
    const state = withOthers([{ type: 'nric', text: '900101-01-1234', of }]);
    expect(validate(state, TARGET)).toContainEqual({ level: 'error', section: 'others', rowId: state.others[0]!.id, code: 'of-missing' });
  });

  test('3: the type of the owner is not a name type', () => {
    const state = withOthers([{ type: 'title', text: 'Geran 1234' }, { type: 'nric', text: '900101-01-1234', of: 0 }]);
    expect(validate(state, TARGET)).toContainEqual({ level: 'error', section: 'others', rowId: state.others[1]!.id, code: 'of-owner-type' });
  });

  test.each(['party', 'person', 'child', 'company'])('3: an owner of type %s is permitted', (type) => {
    const state = withOthers([{ type, text: 'Siti binti Hassan' }, { type: 'nric', text: '900101-01-1234', of: 0 }]);
    expect(validate(state, TARGET)).toEqual([]);
  });

  test('3: the owner has an of itself', () => {
    const state = withOthers([
      { type: 'person', text: 'Siti binti Hassan' },
      { type: 'nric', text: '900101-01-1234', of: 0 },
      { type: 'passport', text: 'A1234567', of: 1 },
    ]);
    const problems = validate(state, TARGET);
    expect(problems).toContainEqual({ level: 'error', section: 'others', rowId: state.others[2]!.id, code: 'of-owner-has-of' });
  });

  test('3: an owner that the user removed is no owner, and no error', () => {
    const state = withOthers([{ type: 'person', text: 'Siti binti Hassan' }, { type: 'nric', text: '900101-01-1234', of: 0 }]);
    state.others = state.others.slice(1);
    expect(validate(state, TARGET)).toEqual([]);
  });

  test('4: a label of an entry of others is empty', () => {
    const state = withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[]' }]);
    expect(validate(state, TARGET)).toContainEqual({ level: 'error', section: 'others', rowId: state.others[0]!.id, code: 'other-label-empty' });
  });

  test('4: an entry of others with no label is no error', () => {
    const state = withOthers([{ type: 'person', text: 'Siti binti Hassan' }]);
    expect(validate(state, TARGET)).toEqual([]);
  });

  test('4: a label of an entry of others has a bracket inside it', () => {
    const state = withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[SEC]RETARY]' }]);
    expect(codes(validate(state, TARGET), 'error')).toEqual(['other-label-bracket']);
  });

  test('4: a label of an entry of others is the label of a party', () => {
    const state = withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[party a]' }]);
    expect(codes(validate(state, TARGET), 'error')).toEqual(['other-label-is-party']);
  });

  test('4: two entries share a label and do not have the same type', () => {
    const state = withOthers([
      { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
      { type: 'company', text: 'Siti Enterprise', label: '[SECRETARY 1]' },
    ]);
    const problems = validate(state, TARGET);
    expect(codes(problems, 'error')).toEqual(['other-label-shared', 'other-label-shared']);
    expect(problems.map((p) => p.rowId)).toEqual(state.others.map((o) => o.id));
  });

  test('4: two entries share a label that differs in case and spaces, and do not have the same type', () => {
    const state = withOthers([
      { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
      { type: 'company', text: 'Siti Enterprise', label: '[ secretary   1 ]' },
    ]);
    expect(validate(state, TARGET)).toEqual([
      { level: 'error', section: 'others', rowId: state.others[0]!.id, code: 'other-label-shared' },
      { level: 'error', section: 'others', rowId: state.others[1]!.id, code: 'other-label-shared' },
    ]);
  });

  test('4: two entries share a label and have the same type', () => {
    const state = withOthers([
      { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
      { type: 'person', text: 'Cik Siti', label: '[secretary 1]' },
    ]);
    expect(validate(state, TARGET)).toEqual([]);
  });

  test('4: party counts as person for a shared label', () => {
    const state = withOthers([
      { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
      { type: 'party', text: 'Cik Siti', label: '[SECRETARY 1]' },
    ]);
    expect(validate(state, TARGET)).toEqual([]);
  });

  test('4: two entries share a label and one of them has an of', () => {
    const state = withOthers([
      { type: 'person', text: 'Siti binti Hassan' },
      { type: 'nric', text: '900101-01-1234', label: '[SITI ID]' },
      { type: 'nric', text: '900101011234', label: '[SITI ID]', of: 0 },
    ]);
    expect(codes(validate(state, TARGET), 'error')).toEqual(['other-label-shared', 'other-label-shared']);
  });

  test('5: a redact row has an empty text', () => {
    const state = load();
    state.redact[1]!.text = '   ';
    expect(validate(state, TARGET)).toContainEqual({ level: 'error', section: 'redact', rowId: state.redact[1]!.id, code: 'redact-text-empty' });
  });

  test('5: a redact row has an empty entity', () => {
    const state = load();
    state.redact[2]!.entity = '';
    expect(validate(state, TARGET)).toContainEqual({ level: 'error', section: 'redact', rowId: state.redact[2]!.id, code: 'redact-entity-empty' });
  });

  test('6: the folder of the save target is empty', () => {
    expect(validate(load(), { ...TARGET, folder: '  ', folderExists: false })).toEqual([{ level: 'error', section: 'file', rowId: null, code: 'target-folder-empty' }]);
  });

  test('6: the name of the save target is empty', () => {
    expect(validate(load(), { ...TARGET, stem: '' })).toEqual([{ level: 'error', section: 'file', rowId: null, code: 'target-name-empty' }]);
  });

  test('6: the folder does not exist', () => {
    expect(validate(load(), { ...TARGET, folderExists: false, wordFileExists: false })).toEqual([{ level: 'error', section: 'file', rowId: null, code: 'target-folder-missing' }]);
  });

  test('6: the name has a path separator', () => {
    expect(codes(validate(load(), { ...TARGET, stem: '../statement' }), 'error')).toEqual(['target-name-bad']);
  });

  test('a value outside the permitted values is an error on its row', () => {
    const file = example();
    file.intake.parties[0].type = 'trust';
    file.redact[0].expect = 'maybe';
    file.redact[1].type = 'thing';
    file.intake.others = [{ type: 'pet', text: 'Comel' }];
    const state = load(file);
    const problems = validate(state, TARGET);
    expect(problems).toContainEqual({ level: 'error', section: 'parties', rowId: state.parties[0]!.id, code: 'party-type' });
    expect(problems).toContainEqual({ level: 'error', section: 'redact', rowId: state.redact[0]!.id, code: 'redact-expect' });
    expect(problems).toContainEqual({ level: 'error', section: 'redact', rowId: state.redact[1]!.id, code: 'redact-type' });
    expect(problems).toContainEqual({ level: 'error', section: 'others', rowId: state.others[0]!.id, code: 'other-type' });
  });
});

describe('warnings', () => {
  test('batch is on and its value is empty', () => {
    const state = load();
    state.batch = ' ';
    expect(validate(state, TARGET)).toEqual([{ level: 'warning', section: 'file', rowId: null, code: 'batch-empty' }]);
    state.batchOn = false;
    expect(validate(state, TARGET)).toEqual([]);
  });

  test('two redact rows have the same text', () => {
    const state = load();
    const row = { id: newId(), text: '  tan  AH kow ', entity: 'x', expect: 'entered', type: '' };
    state.redact.push(row);
    expect(validate(state, TARGET)).toEqual([{ level: 'warning', section: 'redact', rowId: row.id, code: 'redact-duplicate' }]);
  });

  test('the same text with another kind of quote and dash is the same text', () => {
    const state = load();
    state.redact[0]!.text = 'Tan’s "Kedai" 2010–2012';
    const row = { id: newId(), text: "Tan's “Kedai” 2010-2012", entity: 'x', expect: 'entered', type: '' };
    state.redact.push(row);
    expect(codes(validate(state, TARGET), 'warning')).toEqual(['redact-duplicate']);
  });

  test('the same text with another kind of space is the same text', () => {
    const state = load();
    const row = { id: newId(), text: 'Tan\u00a0Ah\tKow', entity: 'x', expect: 'entered', type: '' };
    state.redact.push(row);
    expect(validate(state, TARGET)).toEqual([{ level: 'warning', section: 'redact', rowId: row.id, code: 'redact-duplicate' }]);
  });

  test('a redact text is the defined term of a party', () => {
    const state = load();
    state.redact[4]!.text = 'The  plaintiff';
    expect(validate(state, TARGET)).toEqual([{ level: 'warning', section: 'redact', rowId: state.redact[4]!.id, code: 'redact-defined-term' }]);
  });

  test('no Word file is in the target folder', () => {
    expect(validate(load(), { ...TARGET, wordFileExists: false })).toEqual([{ level: 'warning', section: 'file', rowId: null, code: 'no-word-file' }]);
  });

  test('a party has no full name', () => {
    const state = load();
    state.parties[1]!.fullName = '';
    expect(validate(state, TARGET)).toEqual([{ level: 'warning', section: 'parties', rowId: state.parties[1]!.id, code: 'party-no-name' }]);
  });

  test('two party labels that are not the same label give the same slug', () => {
    const state = load();
    state.parties[1]!.label = '[PARTY-A]';
    expect(validate(state, TARGET)).toEqual([
      { level: 'warning', section: 'parties', rowId: state.parties[0]!.id, code: 'party-label-slug-shared' },
      { level: 'warning', section: 'parties', rowId: state.parties[1]!.id, code: 'party-label-slug-shared' },
    ]);
  });

  test('a party label and a label of an entry of others give the same slug', () => {
    const state = withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[PARTY-B]' }]);
    expect(validate(state, TARGET)).toEqual([
      { level: 'warning', section: 'parties', rowId: state.parties[1]!.id, code: 'party-label-slug-shared' },
      { level: 'warning', section: 'others', rowId: state.others[0]!.id, code: 'other-label-slug-shared' },
    ]);
  });

  test('two labels of entries of others that are not the same label give the same slug', () => {
    const state = withOthers([
      { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
      { type: 'person', text: 'Cik Siti', label: '[secretary  1]' },
      { type: 'person', text: 'Lim Mei Ling', label: '[SECRETARY-1]' },
      { type: 'person', text: 'Rajesh a/l Muniandy', label: '[WITNESS 1]' },
    ]);
    expect(validate(state, TARGET)).toEqual(
      state.others.slice(0, 3).map((other) => ({ level: 'warning', section: 'others', rowId: other.id, code: 'other-label-slug-shared' })),
    );
  });

  test('labels that are the same label get no warning for the slug', () => {
    const parties = load();
    parties.parties[1]!.label = '[party   a]';
    expect(codes(validate(parties, TARGET), 'warning')).toEqual([]);

    const partyAndOther = withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[party a]' }]);
    expect(codes(validate(partyAndOther, TARGET), 'warning')).toEqual([]);

    const others = withOthers([
      { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
      { type: 'company', text: 'Siti Enterprise', label: '[ secretary   1 ]' },
    ]);
    expect(codes(validate(others, TARGET), 'warning')).toEqual([]);
  });

  test('a party label with no letter and no digit has an empty slug', () => {
    const state = load();
    state.parties[1]!.label = '[#]';
    expect(validate(state, TARGET)).toEqual([{ level: 'warning', section: 'parties', rowId: state.parties[1]!.id, code: 'party-label-slug-empty' }]);
  });

  test('a label of an entry of others with no letter and no digit has an empty slug', () => {
    const state = withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[#]' }]);
    expect(validate(state, TARGET)).toEqual([{ level: 'warning', section: 'others', rowId: state.others[0]!.id, code: 'other-label-slug-empty' }]);
  });

  test('two labels with an empty slug do not share a slug', () => {
    const state = withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[?]' }]);
    state.parties[1]!.label = '[#]';
    expect(codes(validate(state, TARGET), 'warning')).toEqual(['party-label-slug-empty', 'other-label-slug-empty']);
    expect(codes(validate(state, TARGET), 'error')).toEqual([]);
  });

  test('a label that is empty or has a bracket inside it gets no warning for an empty slug', () => {
    const state = withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' }]);
    state.parties[0]!.label = '[ ]';
    state.parties[1]!.label = '[[]';
    state.others[0]!.label = '[]]';
    const problems = validate(state, TARGET);
    expect(codes(problems, 'error')).toEqual(['party-label-empty', 'party-label-bracket', 'other-label-bracket']);
    expect(codes(problems, 'warning')).toEqual([]);
  });
});
