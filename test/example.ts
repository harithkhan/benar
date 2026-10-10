// The invented example of section 4.3 of the plan. It is the only test data.
export const EXAMPLE = {
  schema: 'manual-1',
  batch: 'matter-1',
  intake: {
    parties: [
      { label: '[PARTY A]', type: 'individual', fullName: 'Tan Ah Kow', aliases: ['Ah Kow'], idNumber: '850312-10-5521', definedTerm: 'the Plaintiff' },
      { label: '[PARTY B]', type: 'company', fullName: 'Bayu Lestari Sdn Bhd', aliases: ['Bayu Lestari'], idNumber: null, definedTerm: 'the Defendant' },
    ],
    addresses: [{ text: 'No. 12, Jalan Mawar 3, Taman Bunga Raya, 43000 Kajang, Selangor', party: '[PARTY A]' }],
    emails: [],
    phones: [{ text: '012-345 6789', party: '[PARTY A]' }],
    others: [],
  },
  alwaysKeep: ['Pejabat Tanah'],
  redact: [
    { text: 'Tan Ah Kow', entity: 'p-tan', expect: 'entered', type: 'party' },
    { text: 'Encik Tan', entity: 'p-tan', expect: 'entered', type: 'party' },
    { text: '850312-10-5521', entity: 'id-tan', expect: 'entered', type: 'nric' },
    { text: 'Bayu Lestari Sdn Bhd', entity: 'c-bayu', expect: 'entered', type: 'company' },
    { text: 'Rajesh a/l Muniandy', entity: 'w-rajesh', expect: 'detected', type: 'person' },
  ],
  keep: ['Lim Ah Chai v Bank Bumi Bhd [2015] 3 MLJ 101'],
  ownTitles: ['Tan Ah Kow v Bayu Lestari Sdn Bhd'],
};

export type ExampleFile = typeof EXAMPLE;

/** A deep copy of the example, as a loose object that a test can change. */
export function example(): any {
  return structuredClone(EXAMPLE);
}

export function text(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
