import { labelKey, newId, slug, textKey, type ContactList, type FormState, type RedactRow } from './model';

// `Add rows from intake`. The entity ids depend on the intake only. So two
// files of one matter with the same intake get the same ids.

export interface FillResult {
  /** The full list: the rows that were there, then the new rows. */
  redact: RedactRow[];
  added: number;
  /** The texts that a `redact` row has already. */
  skipped: number;
}

/** A row that the fill proposes, before the skip rules. */
export interface ProposedRow {
  text: string;
  entity: string;
  type: string;
  /** The row of `intake` that the text comes from. */
  source: { section: 'parties' | ContactList | 'others'; rowId: string };
  /**
   * The rows of one thing can share an entity by the table of section 5 of the
   * plan. The rows of two things must not.
   */
  thing: string;
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

/** An empty base gives an empty entity, and never an entity that starts with `-`. */
const under = (base: string, rest: string): string => (base === '' ? '' : `${base}-${rest}`);

/**
 * Each row that the fill proposes, also for an empty text and for a text that
 * a `redact` row has already. An address, email or phone with no text has no
 * row here, because it does not take a number.
 */
export function proposedRows(state: FormState): ProposedRow[] {
  const out: ProposedRow[] = [];
  const slugOfParty = new Map(state.parties.map((party) => [party.id, slug(party.label)]));

  for (const party of state.parties) {
    const source = { section: 'parties', rowId: party.id } as const;
    const entity = slug(party.label);
    const isCompany = COMPANY_KINDS.has(party.type);
    const type = isCompany ? 'company' : 'party';
    for (const name of [party.fullName, ...party.aliases]) out.push({ text: name, entity, type, source, thing: `party:${party.id}` });
    const idType = party.type === 'individual' ? 'nric' : isCompany ? 'company-no' : '';
    out.push({ text: party.idNumber, entity: under(entity, 'id'), type: idType, source, thing: `party-id:${party.id}` });
  }

  const contacts = (list: ContactList, kind: 'address' | 'email' | 'phone') => {
    // The key of a linked row is the slug of its party. `null` is the key of
    // the rows with no party: no slug is equal to it, also not an empty slug.
    const count = new Map<string | null, number>();
    for (const row of state[list]) {
      const texts = kind === 'address' ? lines(row.text) : [row.text];
      if (texts.every((item) => item.trim() === '')) continue;
      const owner = row.partyId === null ? undefined : slugOfParty.get(row.partyId);
      const key = owner ?? null;
      const n = (count.get(key) ?? 0) + 1;
      count.set(key, n);
      const entity = owner === undefined ? `${kind}-${n}` : under(owner, n === 1 ? kind : `${kind}-${n}`);
      for (const item of texts) out.push({ text: item, entity, type: kind, source: { section: list, rowId: row.id }, thing: `${list}:${row.id}` });
    }
  };
  contacts('addresses', 'address');
  contacts('emails', 'email');
  contacts('phones', 'phone');

  // The entity and the thing of an entry of `others` when it has no owner.
  // Entries that share a label are one thing.
  const numberOfType = new Map<string, number>();
  const own = new Map<string, { entity: string; thing: string }>();
  for (const other of state.others) {
    const type = otherType(other.type);
    const n = (numberOfType.get(type) ?? 0) + 1;
    numberOfType.set(type, n);
    own.set(other.id, other.label === null ? { entity: `${type}-${n}`, thing: `other:${other.id}` } : { entity: slug(other.label), thing: `label:${labelKey(other.label)}` });
  }
  for (const other of state.others) {
    const self = own.get(other.id)!;
    const owner = other.ownerId === null || other.ownerId === other.id ? undefined : own.get(other.ownerId);
    out.push({
      text: other.text,
      entity: owner === undefined ? self.entity : under(owner.entity, other.type),
      type: otherType(other.type),
      source: { section: 'others', rowId: other.id },
      // The thing of an owner has no line feed in it. So the line feed keeps the owner and the type apart.
      thing: owner === undefined ? self.thing : `of:${owner.thing}\n${other.type}`,
    });
  }

  return out;
}

export function fillFromIntake(state: FormState): FillResult {
  const redact = [...state.redact];
  const present = new Set(redact.map((row) => textKey(row.text)));
  let added = 0;
  let skipped = 0;
  for (const candidate of proposedRows(state)) {
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
