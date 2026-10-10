import { describe, expect, test } from 'vitest';

import { emptyForm } from '../src/shared/model';
import { parse } from '../src/shared/parse';
import { NOT_MANUAL_MESSAGE } from '../src/shared/schema';
import { serialise } from '../src/shared/serialise';
import { EXAMPLE, example, text } from './example';

function load(value: unknown) {
  const result = parse(typeof value === 'string' ? value : text(value));
  if (!result.ok) throw new Error('the test data did not load');
  return result.state;
}

describe('round trip', () => {
  test('the example goes through parse and serialise with no change', () => {
    expect(serialise(load(EXAMPLE))).toBe(text(EXAMPLE));
  });

  test('a file with entries of others, labels and owners does not change', () => {
    const file = example();
    file.intake.others = [
      { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
      { type: 'nric', text: '900101-01-1234', of: 0 },
      { type: 'title', text: 'Geran 1234' },
    ];
    file.intake.emails = [{ text: 'tan@example.com', party: null }];
    expect(serialise(load(file))).toBe(text(file));
  });

  test('a file with no batch does not change', () => {
    const file = example();
    delete file.batch;
    expect(serialise(load(file))).toBe(text(file));
  });

  test('an empty batch value stays in the file', () => {
    const file = example();
    file.batch = '';
    expect(serialise(load(file))).toBe(text(file));
  });

  test('idLabel of a party and label of an address stay as loaded', () => {
    const file = example();
    file.intake.parties[0].idLabel = 'NRIC No.';
    file.intake.addresses[0].label = '[OFFICE]';
    expect(serialise(load(file))).toBe(text(file));
  });

  test('a redact row with no type has no type key', () => {
    const file = example();
    delete file.redact[4].type;
    const out = JSON.parse(serialise(load(file)));
    expect(Object.keys(out.redact[4])).toEqual(['text', 'entity', 'expect']);
  });

  test('the output has two spaces of indent and one line feed at the end', () => {
    const out = serialise(load(EXAMPLE));
    expect(out.startsWith('{\n  "schema": "manual-1",\n')).toBe(true);
    expect(out.endsWith('}\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });
});

describe('key order', () => {
  test('the keys are in the order of section 4.1', () => {
    const file = example();
    file.intake.others = [
      { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
      { type: 'nric', text: '900101-01-1234', of: 0 },
    ];
    const out = JSON.parse(serialise(load(file)));
    expect(Object.keys(out)).toEqual(['schema', 'batch', 'intake', 'alwaysKeep', 'redact', 'keep', 'ownTitles']);
    expect(Object.keys(out.intake)).toEqual(['parties', 'addresses', 'emails', 'phones', 'others']);
    expect(Object.keys(out.intake.parties[0])).toEqual(['label', 'type', 'fullName', 'aliases', 'idNumber', 'definedTerm']);
    expect(Object.keys(out.intake.addresses[0])).toEqual(['text', 'party']);
    expect(Object.keys(out.intake.phones[0])).toEqual(['text', 'party']);
    expect(Object.keys(out.intake.others[0])).toEqual(['type', 'text', 'label']);
    expect(Object.keys(out.intake.others[1])).toEqual(['type', 'text', 'of']);
    expect(Object.keys(out.redact[0])).toEqual(['text', 'entity', 'expect', 'type']);
  });

  test('an empty form writes all lists, and no batch', () => {
    const out = JSON.parse(serialise(emptyForm()));
    expect(out).toEqual({
      schema: 'manual-1',
      intake: { parties: [], addresses: [], emails: [], phones: [], others: [] },
      alwaysKeep: [],
      redact: [],
      keep: [],
      ownTitles: [],
    });
    expect(Object.keys(out)).toEqual(['schema', 'intake', 'alwaysKeep', 'redact', 'keep', 'ownTitles']);
  });

  test('an empty idNumber and an empty definedTerm become null', () => {
    const state = load(EXAMPLE);
    state.parties[0]!.idNumber = '';
    state.parties[0]!.definedTerm = '  ';
    const out = JSON.parse(serialise(state));
    expect(out.intake.parties[0].idNumber).toBeNull();
    expect(out.intake.parties[0].definedTerm).toBeNull();
  });

  test('the batch key follows the switch', () => {
    const state = load(EXAMPLE);
    state.batchOn = false;
    expect('batch' in JSON.parse(serialise(state))).toBe(false);
  });

  test('a label is written in square brackets', () => {
    const state = load(EXAMPLE);
    state.parties[0]!.label = '  claimant 1 ';
    const out = JSON.parse(serialise(state));
    expect(out.intake.parties[0].label).toBe('[claimant 1]');
    expect(out.intake.addresses[0].party).toBe('[claimant 1]');
  });
});

describe('links', () => {
  test('a rename of a party changes the party of its address', () => {
    const state = load(EXAMPLE);
    state.parties[0]!.label = 'VENDOR';
    const out = JSON.parse(serialise(state));
    expect(out.intake.addresses[0].party).toBe('[VENDOR]');
    expect(out.intake.phones[0].party).toBe('[VENDOR]');
  });

  test('a delete of a party changes its address to no party', () => {
    const state = load(EXAMPLE);
    state.parties = state.parties.slice(1);
    const out = JSON.parse(serialise(state));
    expect(out.intake.addresses[0].party).toBeNull();
  });

  const withOwners = () => {
    const file = example();
    file.intake.others = [
      { type: 'person', text: 'Siti binti Hassan' },
      { type: 'nric', text: '900101-01-1234', of: 0 },
      { type: 'child', text: 'Aiman bin Tan' },
      { type: 'passport', text: 'A1234567', of: 2 },
    ];
    return load(file);
  };

  test('of stays correct after a delete', () => {
    const state = withOwners();
    state.others = state.others.slice(1);
    const out = JSON.parse(serialise(state));
    expect(out.intake.others).toEqual([
      { type: 'nric', text: '900101-01-1234' },
      { type: 'child', text: 'Aiman bin Tan' },
      { type: 'passport', text: 'A1234567', of: 1 },
    ]);
  });

  test('of stays correct after a new order', () => {
    const state = withOwners();
    const [a, b, c, d] = state.others;
    state.others = [c!, d!, b!, a!];
    const out = JSON.parse(serialise(state));
    expect(out.intake.others).toEqual([
      { type: 'child', text: 'Aiman bin Tan' },
      { type: 'passport', text: 'A1234567', of: 0 },
      { type: 'nric', text: '900101-01-1234', of: 3 },
      { type: 'person', text: 'Siti binti Hassan' },
    ]);
  });
});

describe('a loaded file', () => {
  const refused: [string, () => string][] = [
    ['text that is not JSON', () => '{ not json'],
    ['an empty text', () => ''],
    ['a list', () => '[]'],
    ['null', () => 'null'],
    ['a text value', () => '"manual-1"'],
    ['no schema', () => { const f = example(); delete f.schema; return text(f); }],
    ['another schema', () => { const f = example(); f.schema = 'manual-2'; return text(f); }],
    ['no intake', () => { const f = example(); delete f.intake; return text(f); }],
    ['an intake that is a list', () => { const f = example(); f.intake = []; return text(f); }],
    ['an intake that is null', () => { const f = example(); f.intake = null; return text(f); }],
    ['no redact', () => { const f = example(); delete f.redact; return text(f); }],
    ['a redact that is not a list', () => { const f = example(); f.redact = {}; return text(f); }],
    ...(['parties', 'addresses', 'emails', 'phones', 'others'] as const).flatMap((list): [string, () => string][] => [
      [`no intake.${list}`, () => { const f = example(); delete f.intake[list]; return text(f); }],
      [`an intake.${list} that is not a list`, () => { const f = example(); f.intake[list] = 'x'; return text(f); }],
    ]),
    ['a party that is not an object', () => { const f = example(); f.intake.parties = ['Tan Ah Kow']; return text(f); }],
    ['a redact row that is not an object', () => { const f = example(); f.redact = ['Tan Ah Kow']; return text(f); }],
    ['a keep that is not a list', () => { const f = example(); f.keep = 'x'; return text(f); }],
    ['a batch that is not text', () => { const f = example(); f.batch = 3; return text(f); }],
    ['an entry of others that is not an object', () => { const f = example(); f.intake.others = ['Siti binti Hassan']; return text(f); }],
    ...(['addresses', 'emails', 'phones'] as const).map((list): [string, () => string] => [
      `an entry of intake.${list} that is not an object`,
      () => { const f = example(); f.intake[list] = ['x']; return text(f); },
    ]),
    ['a redact row with a text that is not text', () => { const f = example(); f.redact[0].text = 5; return text(f); }],
    ['two byte order marks at the start', () => `\uFEFF\uFEFF${text(EXAMPLE)}`],
  ];

  test.each(refused)('refuses %s', (_name, make) => {
    expect(parse(make())).toEqual({ ok: false, message: NOT_MANUAL_MESSAGE });
  });

  test('the message is the one of the plan', () => {
    expect(NOT_MANUAL_MESSAGE).toBe('This file is not a `manual-1` ground-truth file.');
  });

  test.each(['alwaysKeep', 'keep', 'ownTitles'] as const)('a missing %s loads as an empty list', (key) => {
    const file = example();
    delete file[key];
    const state = load(file);
    expect(state[key]).toEqual([]);
    expect(JSON.parse(serialise(state))[key]).toEqual([]);
  });

  test('a file that starts with a byte order mark loads', () => {
    const state = load(`\uFEFF${text(EXAMPLE)}`);
    expect(serialise(state)).toBe(text(EXAMPLE));
  });

  test('a batch that is null loads as not part of a batch', () => {
    const file = example();
    file.batch = null;
    const state = load(file);
    expect(state.batchOn).toBe(false);
    expect(state.batch).toBe('');
    expect('batch' in JSON.parse(serialise(state))).toBe(false);
  });

  test('aliases that are null load as an empty list', () => {
    const file = example();
    file.intake.parties[0].aliases = null;
    const state = load(file);
    expect(state.parties[0]!.aliases).toEqual([]);
    expect(JSON.parse(serialise(state)).intake.parties[0].aliases).toEqual([]);
  });

  test('missing aliases load as an empty list', () => {
    const file = example();
    delete file.intake.parties[0].aliases;
    const state = load(file);
    expect(state.parties[0]!.aliases).toEqual([]);
    expect(JSON.parse(serialise(state)).intake.parties[0].aliases).toEqual([]);
  });

  test('a label and an of that are null on an entry of others load as no label and no owner', () => {
    const file = example();
    file.intake.others = [
      { type: 'person', text: 'Siti binti Hassan', label: null, of: null },
      { type: 'nric', text: '900101-01-1234', label: null, of: null },
    ];
    const state = load(file);
    expect(state.others.map((other) => [other.label, other.ownerId, other.unknownOf])).toEqual([
      [null, null, undefined],
      [null, null, undefined],
    ]);
    expect(JSON.parse(serialise(state)).intake.others).toEqual([
      { type: 'person', text: 'Siti binti Hassan' },
      { type: 'nric', text: '900101-01-1234' },
    ]);
  });

  test('a label that is null on an address stays as loaded', () => {
    const file = example();
    file.intake.addresses[0].label = null;
    expect(serialise(load(file))).toBe(text(file));
  });

  test('the batch switch is on when the file has a batch', () => {
    expect(load(EXAMPLE).batchOn).toBe(true);
    const file = example();
    delete file.batch;
    expect(load(file).batchOn).toBe(false);
  });

  test('a value outside the permitted values loads as it is', () => {
    const file = example();
    file.intake.parties[0].type = 'trust';
    file.redact[0].expect = 'maybe';
    file.redact[1].type = 'thing';
    file.intake.others = [{ type: 'pet', text: 'Comel' }];
    const state = load(file);
    expect(state.parties[0]!.type).toBe('trust');
    expect(state.redact[0]!.expect).toBe('maybe');
    expect(state.redact[1]!.type).toBe('thing');
    expect(state.others[0]!.type).toBe('pet');
    expect(serialise(state)).toBe(text(file));
  });

  test('a party label that is not in parties stays as loaded', () => {
    const file = example();
    file.intake.addresses[0].party = '[PARTY Z]';
    expect(serialise(load(file))).toBe(text(file));
  });

  test('an of that is outside the list stays as loaded', () => {
    const file = example();
    file.intake.others = [{ type: 'nric', text: '900101-01-1234', of: 7 }];
    expect(serialise(load(file))).toBe(text(file));
  });

  test('a party label is found without regard to case and spaces', () => {
    const file = example();
    file.intake.addresses[0].party = '[ party   a ]';
    const state = load(file);
    expect(state.addresses[0]!.partyId).toBe(state.parties[0]!.id);
  });

  test('each row has an id of its own', () => {
    const state = load(EXAMPLE);
    const ids = [...state.parties, ...state.addresses, ...state.phones, ...state.redact, ...state.keep, ...state.ownTitles].map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
