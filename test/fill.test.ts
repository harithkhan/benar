import { describe, expect, test } from 'vitest';

import { fillFromIntake, proposedRows } from '../src/shared/fill';
import { slug, type FormState } from '../src/shared/model';
import { parse } from '../src/shared/parse';
import { example, text } from './example';

function load(change: (file: ReturnType<typeof example>) => void = () => {}): FormState {
  const file = example();
  file.redact = [];
  change(file);
  const result = parse(text(file));
  if (!result.ok) throw new Error('the test data did not load');
  return result.state;
}

const rows = (state: FormState) => fillFromIntake(state).redact.map(({ text: t, entity, expect: e, type }) => [t, entity, e, type]);

describe('the slug of a label', () => {
  test.each([
    ['[PARTY A]', 'party-a'],
    ['PARTY A', 'party-a'],
    ['[Secretary  1]', 'secretary-1'],
    ['[PARTY A / B]', 'party-a-b'],
  ])('%s gives %s', (label, expected) => {
    expect(slug(label)).toBe(expected);
  });
});

describe('Add rows from intake', () => {
  test('the example gives the rows of the fill table', () => {
    expect(rows(load())).toEqual([
      ['Tan Ah Kow', 'party-a', 'entered', 'party'],
      ['Ah Kow', 'party-a', 'entered', 'party'],
      ['850312-10-5521', 'party-a-id', 'entered', 'nric'],
      ['Bayu Lestari Sdn Bhd', 'party-b', 'entered', 'company'],
      ['Bayu Lestari', 'party-b', 'entered', 'company'],
      ['No. 12, Jalan Mawar 3, Taman Bunga Raya, 43000 Kajang, Selangor', 'party-a-address', 'entered', 'address'],
      ['012-345 6789', 'party-a-phone', 'entered', 'phone'],
    ]);
  });

  test('it says how many rows it added and skipped', () => {
    const { added, skipped } = fillFromIntake(load());
    expect([added, skipped]).toEqual([7, 0]);
  });

  test('a second fill adds nothing', () => {
    const state = load();
    const first = fillFromIntake(state);
    const second = fillFromIntake({ ...state, redact: first.redact });
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(7);
    expect(second.redact).toEqual(first.redact);
  });

  test('a text that a redact row has already is skipped, and new rows go to the end', () => {
    const state = load((file) => {
      file.redact = [
        { text: 'tan  ah KOW', entity: 'p-tan', expect: 'entered', type: 'party' },
        { text: 'Rajesh a/l Muniandy', entity: 'w-rajesh', expect: 'detected', type: 'person' },
      ];
    });
    const result = fillFromIntake(state);
    expect([result.added, result.skipped]).toEqual([6, 1]);
    expect(result.redact.slice(0, 2)).toEqual(state.redact);
    expect(result.redact[2]).toMatchObject({ text: 'Ah Kow', entity: 'party-a' });
  });

  test('a short form that is the same as the full name gives one row', () => {
    const state = load((file) => {
      file.intake.parties[0].aliases = ['Ah Kow', 'TAN AH KOW'];
    });
    const result = fillFromIntake(state);
    expect(result.redact.filter((row) => row.entity === 'party-a')).toHaveLength(2);
    expect(result.skipped).toBe(1);
  });

  test('a firm gets company and company-no', () => {
    const state = load((file) => {
      file.intake.parties = [{ label: '[FIRM 1]', type: 'firm', fullName: 'Messrs Lim & Co', aliases: [], idNumber: 'LLP0012345', definedTerm: null }];
      file.intake.addresses = [];
      file.intake.phones = [];
    });
    expect(rows(state)).toEqual([
      ['Messrs Lim & Co', 'firm-1', 'entered', 'company'],
      ['LLP0012345', 'firm-1-id', 'entered', 'company-no'],
    ]);
  });

  test('a company gets company-no for its ID number', () => {
    const state = load((file) => {
      file.intake.parties[1].idNumber = '201901012345';
    });
    expect(rows(state)).toContainEqual(['201901012345', 'party-b-id', 'entered', 'company-no']);
  });

  test('a party of type other gets party, and no type for its ID number', () => {
    const state = load((file) => {
      file.intake.parties = [{ label: '[PARTY C]', type: 'other', fullName: 'Persatuan Penduduk Taman Bunga Raya', aliases: [], idNumber: 'PPM-001-10', definedTerm: null }];
      file.intake.addresses = [];
      file.intake.phones = [];
    });
    expect(rows(state)).toEqual([
      ['Persatuan Penduduk Taman Bunga Raya', 'party-c', 'entered', 'party'],
      ['PPM-001-10', 'party-c-id', 'entered', ''],
    ]);
  });

  test('an address on several lines gives one row for each line that is not empty', () => {
    const state = load((file) => {
      file.intake.parties = [file.intake.parties[0]];
      file.intake.parties[0].aliases = [];
      file.intake.parties[0].idNumber = null;
      file.intake.addresses = [{ text: 'No. 12, Jalan Mawar 3,\n\n  Taman Bunga Raya,\r\n43000 Kajang, Selangor\n', party: '[PARTY A]' }];
      file.intake.phones = [];
    });
    expect(rows(state)).toEqual([
      ['Tan Ah Kow', 'party-a', 'entered', 'party'],
      ['No. 12, Jalan Mawar 3,', 'party-a-address', 'entered', 'address'],
      ['Taman Bunga Raya,', 'party-a-address', 'entered', 'address'],
      ['43000 Kajang, Selangor', 'party-a-address', 'entered', 'address'],
    ]);
  });

  test('the addresses, emails and phones of one party get numbers', () => {
    const state = load((file) => {
      file.intake.parties = [];
      file.intake.parties = example().intake.parties;
      file.intake.parties[0].aliases = [];
      file.intake.parties[0].idNumber = null;
      file.intake.parties[1].aliases = [];
      file.intake.addresses = [
        { text: 'No. 12, Jalan Mawar 3', party: '[PARTY A]' },
        { text: 'Lot 8, Jalan Industri 2', party: '[PARTY B]' },
        { text: 'No. 3, Lorong Melati', party: '[PARTY A]' },
        { text: 'Peti Surat 55', party: null },
        { text: 'Peti Surat 77', party: null },
      ];
      file.intake.emails = [
        { text: 'tan@example.com', party: '[PARTY A]' },
        { text: 'tan.ak@example.com', party: '[PARTY A]' },
        { text: 'info@example.com', party: null },
      ];
      file.intake.phones = [
        { text: '012-345 6789', party: '[PARTY A]' },
        { text: '03-5555 0101', party: null },
        { text: '03-5555 0102', party: null },
      ];
    });
    expect(rows(state).slice(2)).toEqual([
      ['No. 12, Jalan Mawar 3', 'party-a-address', 'entered', 'address'],
      ['Lot 8, Jalan Industri 2', 'party-b-address', 'entered', 'address'],
      ['No. 3, Lorong Melati', 'party-a-address-2', 'entered', 'address'],
      ['Peti Surat 55', 'address-1', 'entered', 'address'],
      ['Peti Surat 77', 'address-2', 'entered', 'address'],
      ['tan@example.com', 'party-a-email', 'entered', 'email'],
      ['tan.ak@example.com', 'party-a-email-2', 'entered', 'email'],
      ['info@example.com', 'email-1', 'entered', 'email'],
      ['012-345 6789', 'party-a-phone', 'entered', 'phone'],
      ['03-5555 0101', 'phone-1', 'entered', 'phone'],
      ['03-5555 0102', 'phone-2', 'entered', 'phone'],
    ]);
  });

  test('entries of others with no owner', () => {
    const state = load((file) => {
      file.intake.parties = [];
      file.intake.addresses = [];
      file.intake.phones = [];
      file.intake.others = [
        { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
        { type: 'child', text: 'Aiman bin Tan' },
        { type: 'title', text: 'Geran 1234' },
        { type: 'child', text: 'Aina binti Tan' },
        { type: 'party', text: 'Lim Mei Ling' },
        { type: 'person', text: 'Cik Siti', label: '[SECRETARY 1]' },
      ];
    });
    expect(rows(state)).toEqual([
      ['Siti binti Hassan', 'secretary-1', 'entered', 'person'],
      ['Aiman bin Tan', 'child-1', 'entered', 'child'],
      ['Geran 1234', 'title-1', 'entered', 'title'],
      ['Aina binti Tan', 'child-2', 'entered', 'child'],
      ['Lim Mei Ling', 'person-2', 'entered', 'person'],
      ['Cik Siti', 'secretary-1', 'entered', 'person'],
    ]);
  });

  test('an entry of others with an owner', () => {
    const state = load((file) => {
      file.intake.parties = [];
      file.intake.addresses = [];
      file.intake.phones = [];
      file.intake.others = [
        { type: 'nric', text: '900101-01-1234', of: 1 },
        { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
        { type: 'child', text: 'Aiman bin Tan' },
        { type: 'passport', text: 'A1234567', of: 2 },
        { type: 'nric', text: '700707-07-7777' },
      ];
    });
    expect(rows(state)).toEqual([
      ['900101-01-1234', 'secretary-1-nric', 'entered', 'nric'],
      ['Siti binti Hassan', 'secretary-1', 'entered', 'person'],
      ['Aiman bin Tan', 'child-1', 'entered', 'child'],
      ['A1234567', 'child-1-passport', 'entered', 'passport'],
      ['700707-07-7777', 'nric-2', 'entered', 'nric'],
    ]);
  });

  test('the ids depend on the intake only', () => {
    const a = load();
    const b = load((file) => {
      file.redact = [{ text: 'Rajesh a/l Muniandy', entity: 'w-rajesh', expect: 'detected', type: 'person' }];
      file.keep = [];
    });
    const idsOf = (state: FormState) => fillFromIntake(state).redact.filter((row) => row.expect === 'entered').map((row) => [row.text, row.entity]);
    expect(idsOf(b)).toEqual(idsOf(a));
  });

  test('the ids do not depend on the redact rows that are there', () => {
    const a = load((file) => {
      file.redact = [{ text: 'Encik Tan', entity: 'p-tan', expect: 'entered', type: 'party' }];
    });
    const b = load((file) => {
      file.redact = [
        { text: 'Puan Lim', entity: 'p-lim', expect: 'entered', type: 'party' },
        { text: 'Kedai Bayu', entity: 'c-bayu', expect: 'entered', type: 'company' },
      ];
    });
    const newRows = (state: FormState) =>
      fillFromIntake(state)
        .redact.slice(state.redact.length)
        .map((row) => [row.text, row.entity]);
    expect(newRows(a)).toHaveLength(7);
    expect(newRows(b)).toEqual(newRows(a));
  });

  test('an entry of others whose owner is not in the list falls back to its own entity', () => {
    const state = load((file) => {
      file.intake.parties = [];
      file.intake.addresses = [];
      file.intake.phones = [];
      file.intake.others = [
        { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
        { type: 'nric', text: '900101-01-1234', of: 0 },
      ];
    });
    state.others = state.others.slice(1);
    expect(state.others[0]!.ownerId).not.toBeNull();
    expect(rows(state)).toEqual([['900101-01-1234', 'nric-1', 'entered', 'nric']]);
  });

  test('an empty text gives no row', () => {
    const state = load((file) => {
      file.intake.parties[0].fullName = '  ';
      file.intake.phones = [{ text: '', party: '[PARTY A]' }];
    });
    const result = fillFromIntake(state);
    expect(result.redact.map((row) => row.text)).not.toContain('');
    expect(result.redact.every((row) => row.text.trim() !== '')).toBe(true);
    expect(result.skipped).toBe(0);
  });
});

describe('a label with an empty slug', () => {
  test('the names, the ID number and the linked contacts of such a party get an empty entity', () => {
    const state = load((file) => {
      file.intake.addresses.push({ text: 'No. 3, Lorong Melati', party: '[PARTY A]' });
      file.intake.emails = [{ text: 'tan@example.com', party: '[PARTY A]' }];
    });
    state.parties[0]!.label = '[#]';
    expect(rows(state)).toEqual([
      ['Tan Ah Kow', '', 'entered', 'party'],
      ['Ah Kow', '', 'entered', 'party'],
      ['850312-10-5521', '', 'entered', 'nric'],
      ['Bayu Lestari Sdn Bhd', 'party-b', 'entered', 'company'],
      ['Bayu Lestari', 'party-b', 'entered', 'company'],
      ['No. 12, Jalan Mawar 3, Taman Bunga Raya, 43000 Kajang, Selangor', '', 'entered', 'address'],
      ['No. 3, Lorong Melati', '', 'entered', 'address'],
      ['tan@example.com', '', 'entered', 'email'],
      ['012-345 6789', '', 'entered', 'phone'],
    ]);
  });

  test('the contacts with no party keep their numbers', () => {
    const state = load((file) => {
      file.intake.addresses.push({ text: 'Peti Surat 55', party: null }, { text: 'Peti Surat 77', party: null });
      file.intake.emails = [
        { text: 'tan@example.com', party: '[PARTY A]' },
        { text: 'info@example.com', party: null },
      ];
      file.intake.phones.push({ text: '03-5555 0101', party: null });
    });
    state.parties[0]!.label = '[#]';
    expect(rows(state).slice(5)).toEqual([
      ['No. 12, Jalan Mawar 3, Taman Bunga Raya, 43000 Kajang, Selangor', '', 'entered', 'address'],
      ['Peti Surat 55', 'address-1', 'entered', 'address'],
      ['Peti Surat 77', 'address-2', 'entered', 'address'],
      ['tan@example.com', '', 'entered', 'email'],
      ['info@example.com', 'email-1', 'entered', 'email'],
      ['012-345 6789', '', 'entered', 'phone'],
      ['03-5555 0101', 'phone-1', 'entered', 'phone'],
    ]);
  });

  test('an entry of others with such a label, and an entry that it owns, get an empty entity', () => {
    const state = load((file) => {
      file.intake.parties = [];
      file.intake.addresses = [];
      file.intake.phones = [];
      file.intake.others = [
        { type: 'person', text: 'Siti binti Hassan', label: '[#]' },
        { type: 'nric', text: '900101-01-1234', of: 0 },
        { type: 'person', text: 'Lim Mei Ling' },
        { type: 'person', text: 'Cik Siti', label: '[]' },
      ];
    });
    expect(rows(state)).toEqual([
      ['Siti binti Hassan', '', 'entered', 'person'],
      ['900101-01-1234', '', 'entered', 'nric'],
      ['Lim Mei Ling', 'person-2', 'entered', 'person'],
      ['Cik Siti', '', 'entered', 'person'],
    ]);
  });

  test('no entity starts with a hyphen', () => {
    const state = load((file) => {
      file.intake.parties[1].idNumber = '201901012345';
      file.intake.addresses.push({ text: 'Lot 8, Jalan Industri 2', party: '[PARTY B]' }, { text: 'Peti Surat 55', party: '[PARTY B]' });
      file.intake.emails = [{ text: 'tan@example.com', party: '[PARTY A]' }];
      file.intake.others = [
        { type: 'person', text: 'Siti binti Hassan', label: '[?]' },
        { type: 'passport', text: 'A1234567', of: 0 },
      ];
    });
    state.parties[0]!.label = '[#]';
    state.parties[1]!.label = '[ - ]';
    const entities = fillFromIntake(state).redact.map((row) => row.entity);
    expect(entities).toHaveLength(13);
    expect(entities.filter((entity) => entity !== '')).toEqual([]);
    expect(proposedRows(state).filter((row) => row.entity.startsWith('-'))).toEqual([]);
  });
});

describe('the rows that the fill proposes', () => {
  const flat = (state: FormState) => proposedRows(state).map(({ text: t, entity, type, source }) => [t, entity, type, source.section, source.rowId]);

  test('the example: each row has its text, entity, type and source', () => {
    const state = load();
    const [a, b] = state.parties;
    expect(flat(state)).toEqual([
      ['Tan Ah Kow', 'party-a', 'party', 'parties', a!.id],
      ['Ah Kow', 'party-a', 'party', 'parties', a!.id],
      ['850312-10-5521', 'party-a-id', 'nric', 'parties', a!.id],
      ['Bayu Lestari Sdn Bhd', 'party-b', 'company', 'parties', b!.id],
      ['Bayu Lestari', 'party-b', 'company', 'parties', b!.id],
      ['', 'party-b-id', 'company-no', 'parties', b!.id],
      ['No. 12, Jalan Mawar 3, Taman Bunga Raya, 43000 Kajang, Selangor', 'party-a-address', 'address', 'addresses', state.addresses[0]!.id],
      ['012-345 6789', 'party-a-phone', 'phone', 'phones', state.phones[0]!.id],
    ]);
  });

  test('the rows do not depend on the redact rows that are there', () => {
    const state = load();
    const filled = { ...state, redact: fillFromIntake(state).redact };
    expect(filled.redact).toHaveLength(7);
    expect(proposedRows(filled)).toEqual(proposedRows(state));
  });

  test('an email and an entry of others have their row as the source', () => {
    const state = load((file) => {
      file.intake.emails = [{ text: 'info@example.com', party: null }];
      file.intake.phones = [];
      file.intake.others = [{ type: 'party', text: 'Lim Mei Ling' }];
    });
    expect(flat(state).slice(-2)).toEqual([
      ['info@example.com', 'email-1', 'email', 'emails', state.emails[0]!.id],
      ['Lim Mei Ling', 'person-1', 'person', 'others', state.others[0]!.id],
    ]);
  });

  const thingOf = (state: FormState, wanted: string): string => {
    const found = proposedRows(state).filter((row) => row.text === wanted);
    if (found.length !== 1) throw new Error('the test data has no such row, or more than one');
    return found[0]!.thing;
  };

  test('the names of one party are one thing, and its ID number is another thing', () => {
    const state = load((file) => {
      file.intake.parties[1].idNumber = '201901012345';
    });
    const things = ['Tan Ah Kow', 'Ah Kow', '850312-10-5521', 'Bayu Lestari Sdn Bhd', 'Bayu Lestari', '201901012345'].map((name) => thingOf(state, name));
    expect(things[1]).toBe(things[0]);
    expect(things[4]).toBe(things[3]);
    expect(new Set(things).size).toBe(4);
  });

  test('the lines of one address are one thing, and each row of a list is a thing of its own', () => {
    const state = load((file) => {
      file.intake.addresses = [
        { text: 'No. 12, Jalan Mawar 3,\nTaman Bunga Raya', party: '[PARTY A]' },
        { text: 'No. 3, Lorong Melati', party: '[PARTY A]' },
        { text: 'Peti Surat 55', party: null },
      ];
      file.intake.emails = [{ text: 'info@example.com', party: null }];
      file.intake.phones = [{ text: '03-5555 0101', party: null }];
    });
    const things = ['No. 12, Jalan Mawar 3,', 'Taman Bunga Raya', 'No. 3, Lorong Melati', 'Peti Surat 55', 'info@example.com', '03-5555 0101', 'Tan Ah Kow'].map((name) => thingOf(state, name));
    expect(things[1]).toBe(things[0]);
    expect(new Set(things).size).toBe(6);
  });

  test('entries of others with no owner: a label is one thing, and an entry with no label is a thing of its own', () => {
    const state = load((file) => {
      file.intake.others = [
        { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
        { type: 'party', text: 'Cik Siti', label: '[ secretary   1 ]' },
        { type: 'person', text: 'Lim Mei Ling', label: '[SECRETARY-1]' },
        { type: 'child', text: 'Aiman bin Tan' },
        { type: 'child', text: 'Aina binti Tan' },
      ];
    });
    const things = ['Siti binti Hassan', 'Cik Siti', 'Lim Mei Ling', 'Aiman bin Tan', 'Aina binti Tan', 'Tan Ah Kow'].map((name) => thingOf(state, name));
    expect(things[1]).toBe(things[0]);
    expect(new Set(things).size).toBe(5);
  });

  test('an entry of others with an owner: the thing of the owner and its type', () => {
    const state = load((file) => {
      file.intake.others = [
        { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
        { type: 'person', text: 'Cik Siti', label: '[secretary 1]' },
        { type: 'child', text: 'Aiman bin Tan' },
        { type: 'nric', text: '900101-01-1234', of: 0 },
        { type: 'nric', text: '900101011234', of: 1 },
        { type: 'passport', text: 'A1234567', of: 0 },
        { type: 'nric', text: '100101-10-1234', of: 2 },
        { type: 'nric', text: '100101101234', of: 2 },
        { type: 'nric', text: '700707-07-7777' },
      ];
    });
    const things = ['900101-01-1234', '900101011234', 'A1234567', '100101-10-1234', '100101101234', '700707-07-7777', 'Siti binti Hassan', 'Aiman bin Tan'].map((name) => thingOf(state, name));
    expect(things[1]).toBe(things[0]);
    expect(things[4]).toBe(things[3]);
    expect(new Set(things).size).toBe(6);
  });

  test('a label that looks like an owner and a type is not the thing of an owned entry', () => {
    const state = load((file) => {
      file.intake.others = [
        { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
        { type: 'nric', text: '900101-01-1234', of: 0 },
        { type: 'person', text: 'Lim Mei Ling', label: '[SECRETARY 1 NRIC]' },
        { type: 'person', text: 'Cik Siti', label: '[SECRETARY 1/NRIC]' },
        { type: 'person', text: 'Puan Siti', label: '[SECRETARY 1:NRIC]' },
      ];
    });
    const things = ['900101-01-1234', 'Lim Mei Ling', 'Cik Siti', 'Puan Siti'].map((name) => thingOf(state, name));
    expect(new Set(things).size).toBe(4);
  });
});
