import { labelInner, labelKey, newId, type Contact, type FormState, type Other, type Party, type RedactRow, type TextRow } from './model';
import { NOT_MANUAL_MESSAGE, SCHEMA } from './schema';

// JSON text to state (section 4.5 of the plan). Each input that is not a
// `manual-1` file gives the same message. The message has no text of the file.

export type ParseResult = { ok: true; state: FormState } | { ok: false; message: string };

class NotManual extends Error {}

type Json = Record<string, unknown>;

function object(value: unknown): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new NotManual();
  return value as Json;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new NotManual();
  return value;
}

/** A missing list loads as an empty list. */
function optionalList(value: unknown): unknown[] {
  return value === undefined ? [] : list(value);
}

/** A missing or `null` text loads as an empty text. */
function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new NotManual();
  return value;
}

function texts(value: unknown): string[] {
  return optionalList(value).map((item) => {
    if (typeof item !== 'string') throw new NotManual();
    return item;
  });
}

const textRows = (value: unknown): TextRow[] => texts(value).map((item) => ({ id: newId(), text: item }));

function party(value: unknown): Party {
  const raw = object(value);
  return {
    id: newId(),
    label: labelInner(text(raw['label'])),
    type: text(raw['type']),
    fullName: text(raw['fullName']),
    aliases: raw['aliases'] === null ? [] : texts(raw['aliases']),
    idNumber: text(raw['idNumber']),
    definedTerm: text(raw['definedTerm']),
    ...(raw['idLabel'] === undefined ? {} : { idLabel: raw['idLabel'] }),
  };
}

function contact(value: unknown, parties: readonly Party[]): Contact {
  const raw = object(value);
  const row: Contact = { id: newId(), text: text(raw['text']), partyId: null };
  const label = raw['party'];
  if (label !== undefined && label !== null) {
    if (typeof label !== 'string') throw new NotManual();
    const key = labelKey(label);
    const owner = parties.find((candidate) => labelKey(candidate.label) === key);
    if (owner) row.partyId = owner.id;
    else row.unknownParty = label;
  }
  if (raw['label'] !== undefined) row.label = raw['label'];
  return row;
}

function others(value: unknown): Other[] {
  const raws = list(value).map(object);
  const rows = raws.map((raw): Other => {
    const label = raw['label'];
    if (label !== undefined && label !== null && typeof label !== 'string') throw new NotManual();
    return {
      id: newId(),
      type: text(raw['type']),
      text: text(raw['text']),
      label: typeof label === 'string' ? labelInner(label) : null,
      ownerId: null,
    };
  });
  raws.forEach((raw, place) => {
    const of = raw['of'];
    if (of === undefined || of === null) return;
    if (typeof of !== 'number') throw new NotManual();
    const row = rows[place]!;
    const owner = Number.isInteger(of) ? rows[of] : undefined;
    if (owner) row.ownerId = owner.id;
    else row.unknownOf = of;
  });
  return rows;
}

function redactRow(value: unknown): RedactRow {
  const raw = object(value);
  return {
    id: newId(),
    text: text(raw['text']),
    entity: text(raw['entity']),
    expect: text(raw['expect']),
    type: text(raw['type']),
  };
}

export function parse(input: string): ParseResult {
  try {
    // A file can start with one byte order mark.
    const file = object(JSON.parse(input.startsWith('\uFEFF') ? input.slice(1) : input));
    if (file['schema'] !== SCHEMA) throw new NotManual();
    const intake = object(file['intake']);
    // A missing or `null` batch: the file is not part of a batch.
    const batch = file['batch'] ?? undefined;
    if (batch !== undefined && typeof batch !== 'string') throw new NotManual();
    const parties = list(intake['parties']).map(party);
    const state: FormState = {
      batchOn: batch !== undefined,
      batch: batch ?? '',
      parties,
      addresses: list(intake['addresses']).map((row) => contact(row, parties)),
      emails: list(intake['emails']).map((row) => contact(row, parties)),
      phones: list(intake['phones']).map((row) => contact(row, parties)),
      others: others(intake['others']),
      alwaysKeep: texts(file['alwaysKeep']),
      redact: list(file['redact']).map(redactRow),
      keep: textRows(file['keep']),
      ownTitles: textRows(file['ownTitles']),
    };
    return { ok: true, state };
  } catch {
    return { ok: false, message: NOT_MANUAL_MESSAGE };
  }
}
