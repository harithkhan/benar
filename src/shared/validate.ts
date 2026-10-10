import { labelInner, labelKey, slug, textKey, type ContactList, type FormState, type Other } from './model';
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
  | 'party-label-slug-shared'
  | 'party-label-slug-empty'
  | 'other-label-slug-shared'
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

  // The slug of a label is the entity id of `Add rows from intake`. Two labels
  // that are not the same label must not give the same slug.
  const slugKeys = new Map<string, Set<string>>();
  for (const label of [...state.parties.map((party) => party.label), ...state.others.map((other) => other.label)]) {
    if (label === null) continue;
    const keys = slugKeys.get(slug(label)) ?? new Set<string>();
    slugKeys.set(slug(label), keys.add(labelKey(label)));
  }
  const slugShared = (label: string): boolean => slug(label) !== '' && (slugKeys.get(slug(label))?.size ?? 0) > 1;
  const slugEmpty = (label: string): boolean => labelKey(label) !== '' && !hasBracket(label) && slug(label) === '';

  // Parties.
  const partyKeys = new Map<string, number>();
  for (const party of state.parties) {
    const key = labelKey(party.label);
    partyKeys.set(key, (partyKeys.get(key) ?? 0) + 1);
  }
  for (const party of state.parties) {
    const key = labelKey(party.label);
    if (key === '') error('parties', party.id, 'party-label-empty');
    else if (hasBracket(party.label)) error('parties', party.id, 'party-label-bracket');
    else if ((partyKeys.get(key) ?? 0) > 1) error('parties', party.id, 'party-label-duplicate');
    if (slugShared(party.label)) warning('parties', party.id, 'party-label-slug-shared');
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
  const otherById = new Map(state.others.map((other) => [other.id, other]));
  const otherIds = new Set(otherById.keys());
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

    if (other.label !== null) {
      const key = labelKey(other.label);
      if (key === '') error('others', other.id, 'other-label-empty');
      else if (hasBracket(other.label)) error('others', other.id, 'other-label-bracket');
      else if (partyKeys.has(key)) error('others', other.id, 'other-label-is-party');
      else {
        const clash = state.others.some(
          (peer) =>
            peer.id !== other.id &&
            peer.label !== null &&
            labelKey(peer.label) === key &&
            (sharedType(peer.type) !== sharedType(other.type) || hasOf(peer, otherIds) || hasOf(other, otherIds)),
        );
        if (clash) error('others', other.id, 'other-label-shared');
      }
      if (slugShared(other.label)) warning('others', other.id, 'other-label-slug-shared');
      if (slugEmpty(other.label)) warning('others', other.id, 'other-label-slug-empty');
    }
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
