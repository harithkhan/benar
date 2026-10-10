// The state of the form. Each row has a stable `id`. A link from one row to
// another holds that `id`, not a label and not a place number. So a rename, a
// delete or a new order needs no repair of the links.

export interface Party {
  id: string;
  /** The label as the user typed it. `writeLabel` gives the form of the file. */
  label: string;
  type: string;
  fullName: string;
  aliases: string[];
  /** Empty when the party has none. */
  idNumber: string;
  /** Empty when the party has none. */
  definedTerm: string;
  /** Has no control. Kept as loaded. */
  idLabel?: unknown;
}

/** An address, an email or a phone. */
export interface Contact {
  id: string;
  text: string;
  partyId: string | null;
  /** Only from a loaded file: a party label that is not in `parties`. */
  unknownParty?: string;
  /** Has no control. Kept as loaded. */
  label?: unknown;
}

export interface Other {
  id: string;
  type: string;
  text: string;
  /** The label of a role. `null` when the entry has none. */
  label: string | null;
  ownerId: string | null;
  /** Only from a loaded file: an `of` that is not a place in the list. */
  unknownOf?: number;
}

export interface RedactRow {
  id: string;
  text: string;
  entity: string;
  expect: string;
  /** Empty for "none". */
  type: string;
}

export interface TextRow {
  id: string;
  text: string;
}

export interface FormState {
  batchOn: boolean;
  batch: string;
  parties: Party[];
  addresses: Contact[];
  emails: Contact[];
  phones: Contact[];
  others: Other[];
  alwaysKeep: string[];
  redact: RedactRow[];
  keep: TextRow[];
  ownTitles: TextRow[];
}

export type ContactList = 'addresses' | 'emails' | 'phones';
export type TextList = 'keep' | 'ownTitles';

let lastId = 0;

export function newId(): string {
  lastId += 1;
  return `r${lastId}`;
}

export function emptyForm(): FormState {
  return {
    batchOn: false,
    batch: '',
    parties: [],
    addresses: [],
    emails: [],
    phones: [],
    others: [],
    alwaysKeep: [],
    redact: [],
    keep: [],
    ownTitles: [],
  };
}

/** A label with no square brackets around it. */
export function labelInner(label: string): string {
  let inner = label.trim();
  if (inner.startsWith('[')) inner = inner.slice(1);
  if (inner.endsWith(']')) inner = inner.slice(0, -1);
  return inner.trim();
}

/** The form in which two labels are compared. */
export function labelKey(label: string): string {
  return labelInner(label).toLowerCase().replace(/\s+/g, ' ');
}

/** The form in which the app writes a label. */
export function writeLabel(label: string): string {
  return `[${labelInner(label)}]`;
}

/** `[PARTY A]` gives `party-a`. */
export function slug(label: string): string {
  return labelInner(label)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The form in which two texts are compared: case, the kind of space, the kind
 * of quote and the kind of dash do not matter.
 */
export function textKey(text: string): string {
  return text
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The next free label: `PARTY A`, `PARTY B`, …, `PARTY Z`, `PARTY AA`, … */
export function nextPartyLabel(parties: readonly Party[]): string {
  const used = new Set(parties.map((party) => labelKey(party.label)));
  for (let n = 0; ; n += 1) {
    let letters = '';
    for (let rest = n; rest >= 0; rest = Math.floor(rest / 26) - 1) {
      letters = String.fromCharCode(65 + (rest % 26)) + letters;
    }
    const label = `PARTY ${letters}`;
    if (!used.has(labelKey(label))) return label;
  }
}
