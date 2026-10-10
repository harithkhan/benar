// The permitted values of the `manual-1` format (section 4.2 of the plan).

export const SCHEMA = 'manual-1';

export const NOT_MANUAL_MESSAGE = 'This file is not a `manual-1` ground-truth file.';

export interface Choice {
  readonly value: string;
  readonly name: string;
}

/** The 17 values of `type`, with the name that a select shows. */
export const TYPES: readonly Choice[] = [
  { value: 'party', name: 'Party' },
  { value: 'person', name: 'Person' },
  { value: 'child', name: 'Child' },
  { value: 'company', name: 'Company' },
  { value: 'address', name: 'Address' },
  { value: 'email', name: 'Email' },
  { value: 'phone', name: 'Phone' },
  { value: 'nric', name: 'NRIC' },
  { value: 'passport', name: 'Passport' },
  { value: 'company-no', name: 'Company number (SSM)' },
  { value: 'id-no', name: 'Professional number' },
  { value: 'account', name: 'Account number' },
  { value: 'title', name: 'Land title' },
  { value: 'case-no', name: 'Case number' },
  { value: 'dob', name: 'Date of birth' },
  { value: 'vehicle', name: 'Vehicle number' },
  { value: 'other', name: 'Other' },
];

export const PARTY_TYPES: readonly Choice[] = [
  { value: 'individual', name: 'Individual' },
  { value: 'company', name: 'Company' },
  { value: 'firm', name: 'Firm' },
  { value: 'other', name: 'Other' },
];

export const EXPECTS: readonly Choice[] = [
  { value: 'entered', name: 'Entered' },
  { value: 'detected', name: 'Detected' },
];

const valuesOf = (choices: readonly Choice[]): ReadonlySet<string> => new Set(choices.map((choice) => choice.value));

export const TYPE_VALUES = valuesOf(TYPES);
export const PARTY_TYPE_VALUES = valuesOf(PARTY_TYPES);
export const EXPECT_VALUES = valuesOf(EXPECTS);

/** The types of an entry of `others` that can have an owner. */
export const ID_TYPES: ReadonlySet<string> = new Set(['nric', 'passport', 'company-no', 'id-no']);

/** The types of an entry of `others` that can be an owner. */
export const NAME_TYPES: ReadonlySet<string> = new Set(['party', 'person', 'child', 'company']);
