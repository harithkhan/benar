import { newId, slug, textKey, type Contact, type FormState, type Other, type RedactRow } from './model';

// `Add rows from intake`. The entity ids depend on the intake only. So two
// files of one matter with the same intake get the same ids.

export interface FillResult {
  /** The full list: the rows that were there, then the new rows. */
  redact: RedactRow[];
  added: number;
  /** The texts that a `redact` row has already. */
  skipped: number;
}

interface Candidate {
  text: string;
  entity: string;
  type: string;
}

const COMPANY_KINDS = new Set(['company', 'firm']);

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** `party` gives `person` for an entry of `others`. */
const otherType = (type: string): string => (type === 'party' ? 'person' : type);

function fromIntake(state: FormState): Candidate[] {
  const out: Candidate[] = [];
  const slugOfParty = new Map(state.parties.map((party) => [party.id, slug(party.label)]));

  for (const party of state.parties) {
    const entity = slug(party.label);
    const isCompany = COMPANY_KINDS.has(party.type);
    const type = isCompany ? 'company' : 'party';
    for (const name of [party.fullName, ...party.aliases]) out.push({ text: name, entity, type });
    const idType = party.type === 'individual' ? 'nric' : isCompany ? 'company-no' : '';
    out.push({ text: party.idNumber, entity: `${entity}-id`, type: idType });
  }

  const contacts = (rows: readonly Contact[], kind: 'address' | 'email' | 'phone') => {
    const count = new Map<string, number>();
    for (const row of rows) {
      const texts = kind === 'address' ? lines(row.text) : [row.text];
      if (texts.every((item) => item.trim() === '')) continue;
      const owner = row.partyId === null ? undefined : slugOfParty.get(row.partyId);
      const key = owner ?? '';
      const n = (count.get(key) ?? 0) + 1;
      count.set(key, n);
      const entity = owner === undefined ? `${kind}-${n}` : n === 1 ? `${owner}-${kind}` : `${owner}-${kind}-${n}`;
      for (const item of texts) out.push({ text: item, entity, type: kind });
    }
  };
  contacts(state.addresses, 'address');
  contacts(state.emails, 'email');
  contacts(state.phones, 'phone');

  // The entity of an entry of `others` when it has no owner.
  const numberOfType = new Map<string, number>();
  const ownEntity = new Map<string, string>();
  for (const other of state.others) {
    const type = otherType(other.type);
    const n = (numberOfType.get(type) ?? 0) + 1;
    numberOfType.set(type, n);
    const fromLabel = other.label === null ? '' : slug(other.label);
    ownEntity.set(other.id, fromLabel === '' ? `${type}-${n}` : fromLabel);
  }
  const entityOf = (other: Other): string => {
    const owner = other.ownerId === null || other.ownerId === other.id ? undefined : ownEntity.get(other.ownerId);
    return owner === undefined ? ownEntity.get(other.id)! : `${owner}-${other.type}`;
  };
  for (const other of state.others) out.push({ text: other.text, entity: entityOf(other), type: otherType(other.type) });

  return out;
}

export function fillFromIntake(state: FormState): FillResult {
  const redact = [...state.redact];
  const present = new Set(redact.map((row) => textKey(row.text)));
  let added = 0;
  let skipped = 0;
  for (const candidate of fromIntake(state)) {
    const key = textKey(candidate.text);
    if (key === '') continue;
    if (present.has(key)) {
      skipped += 1;
      continue;
    }
    present.add(key);
    redact.push({ id: newId(), text: candidate.text.trim(), entity: candidate.entity, expect: 'entered', type: candidate.type });
    added += 1;
  }
  return { redact, added, skipped };
}
