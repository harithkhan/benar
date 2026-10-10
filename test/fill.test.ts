import { describe, expect, test } from 'vitest';

import { fillFromIntake } from '../src/shared/fill';
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
