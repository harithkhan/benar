import type { TargetState } from '../shared/bridge';
import { emptyForm, nextPartyLabel, type Contact, type ContactList, type FormState, type Other, type Party, type RedactRow, type TextList } from '../shared/model';
import { ID_TYPES } from '../shared/schema';
import { serialise } from '../shared/serialise';
import { cleanStem, targetPath } from '../shared/target';

// The state of the window, and a reducer on the model. A new row gets its
// `id` from the caller, so that the reducer is a pure function.

export type RowList = 'parties' | ContactList | 'others' | 'redact' | TextList;

export type FormAction =
  | { type: 'batchOn'; on: boolean }
  | { type: 'batch'; value: string }
  | { type: 'addParty'; id: string }
  | { type: 'party'; id: string; patch: Partial<Pick<Party, 'label' | 'type' | 'fullName' | 'aliases' | 'idNumber' | 'definedTerm'>> }
  | { type: 'addContact'; list: ContactList; id: string }
  | { type: 'contact'; list: ContactList; id: string; patch: Partial<Pick<Contact, 'text' | 'partyId'>> }
  | { type: 'addOther'; id: string }
  | { type: 'other'; id: string; patch: Partial<Pick<Other, 'type' | 'text' | 'label' | 'ownerId'>> }
  | { type: 'alwaysKeep'; values: string[] }
  | { type: 'addRedact'; id: string }
  | { type: 'addForm'; afterId: string; id: string }
  | { type: 'redact'; id: string; patch: Partial<Pick<RedactRow, 'text' | 'entity' | 'expect' | 'type'>> }
  | { type: 'pasteRedact'; id: string; lines: string[]; ids: string[] }
  | { type: 'addText'; list: TextList; id: string }
  | { type: 'text'; list: TextList; id: string; value: string }
  | { type: 'remove'; list: RowList; id: string };

/** The lines of a pasted text. A line with no text is not a line. */
export function pasteLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

const patchRow = <Row extends { id: string }>(rows: Row[], id: string, change: (row: Row) => Row): Row[] => rows.map((row) => (row.id === id ? change(row) : row));

export function formReducer(form: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'batchOn':
      return { ...form, batchOn: action.on };
    case 'batch':
      return { ...form, batch: action.value };
    case 'addParty':
      return {
        ...form,
        parties: [...form.parties, { id: action.id, label: nextPartyLabel(form.parties), type: 'individual', fullName: '', aliases: [], idNumber: '', definedTerm: '' }],
      };
    case 'party':
      return { ...form, parties: patchRow(form.parties, action.id, (party) => ({ ...party, ...action.patch })) };
    case 'addContact':
      return { ...form, [action.list]: [...form[action.list], { id: action.id, text: '', partyId: null }] };
    case 'contact':
      return {
        ...form,
        [action.list]: patchRow(form[action.list], action.id, (row) => {
          const next = { ...row, ...action.patch };
          // A choice of the user replaces a party label that the file gave.
          if ('partyId' in action.patch) delete next.unknownParty;
          return next;
        }),
      };
    case 'addOther':
      return { ...form, others: [...form.others, { id: action.id, type: 'person', text: '', label: null, ownerId: null }] };
    case 'other':
      return {
        ...form,
        others: patchRow(form.others, action.id, (row) => {
          const next = { ...row, ...action.patch };
          if (next.label === '') next.label = null;
          if ('ownerId' in action.patch) delete next.unknownOf;
          // Only an ID type can have an owner.
          if ('type' in action.patch && !ID_TYPES.has(next.type)) {
            next.ownerId = null;
            delete next.unknownOf;
          }
          return next;
        }),
      };
    case 'alwaysKeep':
      return { ...form, alwaysKeep: action.values };
    case 'addRedact':
      return { ...form, redact: [...form.redact, { id: action.id, text: '', entity: '', expect: 'detected', type: '' }] };
    case 'addForm': {
      const place = form.redact.findIndex((row) => row.id === action.afterId);
      const source = form.redact[place];
      if (!source) return form;
      const row: RedactRow = { id: action.id, text: '', entity: source.entity, expect: source.expect, type: source.type };
      return { ...form, redact: [...form.redact.slice(0, place + 1), row, ...form.redact.slice(place + 1)] };
    }
    case 'redact':
      return { ...form, redact: patchRow(form.redact, action.id, (row) => ({ ...row, ...action.patch })) };
    case 'pasteRedact': {
      // A paste of several lines makes one row for each line.
      const place = form.redact.findIndex((row) => row.id === action.id);
      const source = form.redact[place];
      const [first, ...rest] = action.lines;
      if (!source || first === undefined) return form;
      // The caller gives one id for each new row. A row with no id gets an id that no row has.
      const used = new Set([...form.redact.map((row) => row.id), ...action.ids]);
      let free = 0;
      const freeId = (): string => {
        let id: string;
        do id = `${action.id}-${free++}`;
        while (used.has(id));
        used.add(id);
        return id;
      };
      const rows = rest.map((text, n): RedactRow => ({ id: action.ids[n] ?? freeId(), text, entity: source.entity, expect: source.expect, type: source.type }));
      return { ...form, redact: [...form.redact.slice(0, place), { ...source, text: first }, ...rows, ...form.redact.slice(place + 1)] };
    }
    case 'addText':
      return { ...form, [action.list]: [...form[action.list], { id: action.id, text: '' }] };
    case 'text':
      return { ...form, [action.list]: patchRow(form[action.list], action.id, (row) => ({ ...row, text: action.value })) };
    case 'remove': {
      const next = { ...form, [action.list]: form[action.list].filter((row) => row.id !== action.id) } as FormState;
      if (action.list === 'parties') {
        // When a party goes, its addresses, emails and phones change to "No party".
        const unlink = (rows: Contact[]) => rows.map((row) => (row.partyId === action.id ? { ...row, partyId: null } : row));
        return { ...next, addresses: unlink(next.addresses), emails: unlink(next.emails), phones: unlink(next.phones) };
      }
      if (action.list === 'others') {
        return { ...next, others: next.others.map((row) => (row.ownerId === action.id ? { ...row, ownerId: null } : row)) };
      }
      return next;
    }
  }
}

export interface AppState {
  form: FormState;
  folder: string;
  /** The text of the name field. `cleanStem` gives the stem. */
  name: string;
  /** The file that the form opened or saved last. `null` when the form opened and saved no file that Save writes. */
  opened: { folder: string; stem: string } | null;
  /**
   * The path of each file that this form opened or saved, from the time that
   * the form began. Save replaces each of them with no question. New, an open,
   * a new file of the same matter and the next file start a new list.
   */
  ownFiles: string[];
  /**
   * The name that the top bar shows: the file that the user picked in an open,
   * or the file of the last save. `null` for a new file. It can be another
   * file than the file that Save writes.
   */
  fileName: string | null;
  /** The number of the form. New, an open, a new file of the same matter and the next file give the next number. */
  formNo: number;
  /**
   * The number of the save target. Each command that gives a target gives the
   * next number: New, an open, a new file of the same matter, the next file,
   * `Browse…` and `Take from a Word file…`. A text that the user types in the
   * folder field or the name field does not.
   */
  targetNo: number;
  /** The snapshot at the last new, open or save. The form is dirty when the snapshot is different. */
  baseline: string;
  /** The entity ids of the source matter. They are in memory only. */
  knownEntities: string[];
  fillNote: { added: number; skipped: number } | null;
}

export type AppAction =
  | FormAction
  | { type: 'folder'; value: string }
  | { type: 'name'; value: string }
  | { type: 'pickedFolder'; value: string }
  | { type: 'target'; folder: string; name: string }
  | { type: 'filled'; redact: RedactRow[]; added: number; skipped: number }
  | { type: 'new' }
  | { type: 'opened'; form: FormState; folder: string; stem: string; file: string; sameFile: boolean }
  | { type: 'fromMatter'; source: FormState; folder: string }
  | { type: 'nextFile' }
  | { type: 'saved'; folder: string; stem: string; json: string; formNo: number };

const snapshotOf = (folder: string, stem: string, json: string): string => JSON.stringify([folder.trim(), stem, json]);

export function snapshot(state: Pick<AppState, 'form' | 'folder' | 'name'>): string {
  return snapshotOf(state.folder, cleanStem(state.name), serialise(state.form));
}

export const isDirty = (state: AppState): boolean => snapshot(state) !== state.baseline;

type Parts = Pick<AppState, 'form' | 'folder' | 'name' | 'opened' | 'fileName' | 'knownEntities'>;

/** A form with no unsaved change. It gets the next numbers after the state before it. Its own files are the opened file only. */
function clean(parts: Parts, before?: AppState): AppState {
  const ownFiles = parts.opened === null ? [] : [targetPath(parts.opened.folder, parts.opened.stem)];
  return { ...parts, ownFiles, formNo: (before?.formNo ?? -1) + 1, targetNo: (before?.targetNo ?? -1) + 1, baseline: snapshot(parts), fillNote: null };
}

const emptyParts = (): Parts => ({ form: emptyForm(), folder: '', name: '', opened: null, fileName: null, knownEntities: [] });

export function initialState(): AppState {
  return clean(emptyParts());
}

/** `true` when this form opened or saved the file that a save of this folder and stem writes. */
export function isOwnFile(state: AppState, folder: string, stem: string): boolean {
  return state.ownFiles.includes(targetPath(folder, stem));
}

/** The save target of the form: the text of the folder field, the stem, and the number of the target. */
export interface Target {
  folder: string;
  stem: string;
  targetNo: number;
}

/** A result of `targetState`, with the target that it is for. */
export interface FoundTarget extends Target {
  state: TargetState;
}

/**
 * What the form shows as the state of the disk for its target. `last` is the
 * last result that came. The result for the target of now can be pending.
 *
 * - `last` is for this folder and stem: the form shows it.
 * - The user typed in the folder field or the name field after `last` (the
 *   same target number): the form shows `last` until the new result comes, so
 *   that no message goes off and on with each key.
 * - A command gave the target after `last` (another target number): `null`.
 *   The result of another target says nothing about this one, and the form
 *   shows no problem of the disk until the new result comes.
 */
export function shownTargetState(target: Target, last: FoundTarget | null): TargetState | null {
  if (last === null) return null;
  const isForTarget = last.folder === target.folder && last.stem === target.stem;
  return isForTarget || last.targetNo === target.targetNo ? last.state : null;
}

export function entityIds(rows: readonly RedactRow[], more: readonly string[] = []): string[] {
  return [...new Set([...rows.map((row) => row.entity.trim()), ...more])].filter((id) => id !== '').sort();
}

/** A new file of the same matter keeps `batch`, `intake` and `alwaysKeep`. */
function sameMatter(source: FormState): FormState {
  return {
    ...emptyForm(),
    batchOn: source.batchOn,
    batch: source.batch,
    parties: source.parties,
    addresses: source.addresses,
    emails: source.emails,
    phones: source.phones,
    others: source.others,
    alwaysKeep: source.alwaysKeep,
  };
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'folder':
      return { ...state, folder: action.value };
    case 'name':
      return { ...state, name: action.value };
    case 'pickedFolder':
      return { ...state, folder: action.value, targetNo: state.targetNo + 1 };
    case 'target':
      return { ...state, folder: action.folder, name: action.name, targetNo: state.targetNo + 1 };
    case 'filled':
      return { ...state, form: { ...state.form, redact: action.redact }, fillNote: { added: action.added, skipped: action.skipped } };
    case 'new':
      return clean(emptyParts(), state);
    case 'opened':
      // The target is the opened file only when a save of this folder and stem writes that file.
      return clean({ form: action.form, folder: action.folder, name: action.stem, opened: action.sameFile ? { folder: action.folder, stem: action.stem } : null, fileName: action.file, knownEntities: [] }, state);
    case 'fromMatter':
      return clean({ form: sameMatter(action.source), folder: action.folder, name: '', opened: null, fileName: null, knownEntities: entityIds(action.source.redact) }, state);
    case 'nextFile':
      return clean({ form: sameMatter(state.form), folder: state.folder, name: '', opened: null, fileName: null, knownEntities: entityIds(state.form.redact, state.knownEntities) }, state);
    case 'saved':
      // The result of a save of another form says nothing about this form.
      if (action.formNo !== state.formNo) return state;
      // The baseline is the text that the disk has. A change that came after the save stays a change.
      return {
        ...state,
        opened: { folder: action.folder, stem: action.stem },
        ownFiles: isOwnFile(state, action.folder, action.stem) ? state.ownFiles : [...state.ownFiles, targetPath(action.folder, action.stem)],
        fileName: `${action.stem}.truth.json`,
        baseline: snapshotOf(action.folder, action.stem, action.json),
      };
    default: {
      const form = formReducer(state.form, action);
      return form === state.form ? state : { ...state, form };
    }
  }
}
