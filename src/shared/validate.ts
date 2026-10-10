import { proposedRows } from './fill';
import { labelInner, labelKey, slug, textKey, type ContactList, type FormState, type Other, type Party } from './model';
import { EXPECT_VALUES, ID_TYPES, NAME_TYPES, PARTY_TYPE_VALUES, TYPE_VALUES } from './schema';
import { isStemValid } from './target';

// The checks before a save (section 4.4 of the plan), as a pure function. A
// problem names the section, the row and a code. It holds no text of the form.

export type Section = 'file' | 'parties' | ContactList | 'others' | 'redact';

export type ErrorCode =
  | 'party-label-empty'
  | 'party-label-bracket'
  | 'party-label-duplicate'
  | 'party-type'
  | 'contact-unknown-party'
  | 'other-type'
  | 'of-not-id-type'
  | 'of-self'
  | 'of-missing'
  | 'of-owner-type'
  | 'of-owner-has-of'
  | 'other-label-empty'
  | 'other-label-bracket'
  | 'other-label-is-party'
  | 'other-label-shared'
  | 'redact-text-empty'
  | 'redact-entity-empty'
  | 'redact-expect'
  | 'redact-type'
  | 'target-folder-empty'
  | 'target-name-empty'
  | 'target-name-bad'
  | 'target-folder-missing';

export type WarningCode =
  | 'batch-empty'
  | 'redact-duplicate'
  | 'redact-defined-term'
  | 'no-word-file'
  | 'party-no-name'
  | 'party-entity-shared'
  | 'party-label-slug-empty'
  | 'other-entity-shared'
  | 'other-label-slug-empty';

export type Code = ErrorCode | WarningCode;

export interface Problem {
  level: 'error' | 'warning';
  section: Section;
  rowId: string | null;
  code: Code;
}

/** What the app knows about the save target. */
export interface TargetInfo {
  folder: string;
  stem: string;
  folderExists: boolean;
  wordFileExists: boolean;
}

const hasBracket = (label: string): boolean => /[[\]]/.test(labelInner(label));

/** `party` counts as `person` when two entries share a label. */
const sharedType = (type: string): string => (type === 'party' ? 'person' : type);

const hasOf = (other: Other, ids: ReadonlySet<string>): boolean => other.unknownOf !== undefined || (other.ownerId !== null && ids.has(other.ownerId));

export function validate(state: FormState, target: TargetInfo): Problem[] {
  const problems: Problem[] = [];
  const error = (section: Section, rowId: string | null, code: ErrorCode) => problems.push({ level: 'error', section, rowId, code });
  const warning = (section: Section, rowId: string | null, code: WarningCode) => problems.push({ level: 'warning', section, rowId, code });

  // The save target and the batch.
  const stemValid = isStemValid(target.stem);
  if (target.folder.trim() === '') error('file', null, 'target-folder-empty');
  else if (!target.folderExists) error('file', null, 'target-folder-missing');
  if (target.stem === '') error('file', null, 'target-name-empty');
  else if (!stemValid) error('file', null, 'target-name-bad');
  if (target.folderExists && stemValid && !target.wordFileExists) warning('file', null, 'no-word-file');
  if (state.batchOn && state.batch.trim() === '') warning('file', null, 'batch-empty');

  // The error of the label of a party, and of an entry of `others`.
  const partyKeys = new Map<string, number>();
  for (const party of state.parties) {
    const key = labelKey(party.label);
    partyKeys.set(key, (partyKeys.get(key) ?? 0) + 1);
  }
  const partyLabelError = (party: Party): ErrorCode | undefined => {
    const key = labelKey(party.label);
    if (key === '') return 'party-label-empty';
    if (hasBracket(party.label)) return 'party-label-bracket';
    return (partyKeys.get(key) ?? 0) > 1 ? 'party-label-duplicate' : undefined;
  };
  const otherById = new Map(state.others.map((other) => [other.id, other]));
  const otherIds = new Set(otherById.keys());
  const otherLabelError = (other: Other): ErrorCode | undefined => {
    if (other.label === null) return undefined;
    const key = labelKey(other.label);
    if (key === '') return 'other-label-empty';
    if (hasBracket(other.label)) return 'other-label-bracket';
    if (partyKeys.has(key)) return 'other-label-is-party';
    const clash = state.others.some(
      (peer) =>
        peer.id !== other.id &&
        peer.label !== null &&
        labelKey(peer.label) === key &&
        (sharedType(peer.type) !== sharedType(other.type) || hasOf(peer, otherIds) || hasOf(other, otherIds)),
    );
    return clash ? 'other-label-shared' : undefined;
  };

  // `Add rows from intake` must not give one entity id to two things. A row
  // with a label error is not in this check: the user must correct the label
  // first. A row that takes its entity id from such a row is not in the check
  // either: an address, email or phone of that party, and an entry of `others`
  // that the entry owns. A row that the fill proposes with an empty text is in
  // the check.
  const labelErrors = new Set([...state.parties.filter(partyLabelError), ...state.others.filter(otherLabelError)].map((row) => row.id));
  const fromLabelError = (id: string | null): boolean => id !== null && labelErrors.has(id);
  const leftOut = new Set([
    ...labelErrors,
    ...[...state.addresses, ...state.emails, ...state.phones].filter((row) => fromLabelError(row.partyId)).map((row) => row.id),
    ...state.others.filter((other) => fromLabelError(other.ownerId)).map((other) => other.id),
  ]);
  const proposed = proposedRows(state).filter((row) => row.entity !== '' && !leftOut.has(row.source.rowId));
  const thingsOf = new Map<string, Set<string>>();
  for (const row of proposed) thingsOf.set(row.entity, (thingsOf.get(row.entity) ?? new Set<string>()).add(row.thing));
  const entityShared = new Set(proposed.filter((row) => thingsOf.get(row.entity)!.size > 1).map((row) => row.source.rowId));
  const slugEmpty = (label: string): boolean => labelKey(label) !== '' && !hasBracket(label) && slug(label) === '';

  // Parties.
  for (const party of state.parties) {
    const labelError = partyLabelError(party);
    if (labelError) error('parties', party.id, labelError);
    if (entityShared.has(party.id)) warning('parties', party.id, 'party-entity-shared');
    if (slugEmpty(party.label)) warning('parties', party.id, 'party-label-slug-empty');
    if (!PARTY_TYPE_VALUES.has(party.type)) error('parties', party.id, 'party-type');
    if (party.fullName.trim() === '') warning('parties', party.id, 'party-no-name');
  }

  // Addresses, emails and phones.
  const partyIds = new Set(state.parties.map((party) => party.id));
  for (const section of ['addresses', 'emails', 'phones'] as const) {
    for (const row of state[section]) {
      const linked = row.partyId !== null && partyIds.has(row.partyId);
      if (!linked && row.unknownParty !== undefined) error(section, row.id, 'contact-unknown-party');
    }
  }

  // Other people and identifiers.
  for (const other of state.others) {
    if (!TYPE_VALUES.has(other.type)) error('others', other.id, 'other-type');

    const owner = other.ownerId === null ? undefined : otherById.get(other.ownerId);
    if (owner || other.unknownOf !== undefined) {
      if (!ID_TYPES.has(other.type)) error('others', other.id, 'of-not-id-type');
      if (!owner) error('others', other.id, 'of-missing');
      else if (owner.id === other.id) error('others', other.id, 'of-self');
      else {
        if (!NAME_TYPES.has(owner.type)) error('others', other.id, 'of-owner-type');
        if (hasOf(owner, otherIds)) error('others', other.id, 'of-owner-has-of');
      }
    }

    const labelError = otherLabelError(other);
    if (labelError) error('others', other.id, labelError);
    if (entityShared.has(other.id)) warning('others', other.id, 'other-entity-shared');
    if (other.label !== null && slugEmpty(other.label)) warning('others', other.id, 'other-label-slug-empty');
  }

  // Redact.
  const definedTerms = new Set(state.parties.map((party) => textKey(party.definedTerm)).filter((key) => key !== ''));
  const seen = new Set<string>();
  for (const row of state.redact) {
    const key = textKey(row.text);
    if (key === '') error('redact', row.id, 'redact-text-empty');
    if (row.entity.trim() === '') error('redact', row.id, 'redact-entity-empty');
    if (!EXPECT_VALUES.has(row.expect)) error('redact', row.id, 'redact-expect');
    if (row.type !== '' && !TYPE_VALUES.has(row.type)) error('redact', row.id, 'redact-type');
    if (key !== '') {
      if (seen.has(key)) warning('redact', row.id, 'redact-duplicate');
      seen.add(key);
      if (definedTerms.has(key)) warning('redact', row.id, 'redact-defined-term');
    }
  }

  return problems;
}
