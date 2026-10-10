import { writeLabel, type Contact, type FormState } from './model';
import { SCHEMA } from './schema';

// State to JSON text, in the key order of section 4.1 of the plan. Labels and
// place numbers are written from the `id` links.

const orNull = (text: string): string | null => (text.trim() === '' ? null : text);

/** The object that the file holds. The order of the keys is the order of the file. */
export function toFile(state: FormState): Record<string, unknown> {
  const labelOfParty = new Map(state.parties.map((party) => [party.id, writeLabel(party.label)]));
  const placeOfOther = new Map(state.others.map((other, place) => [other.id, place]));

  const contact = (row: Contact): Record<string, unknown> => {
    const linked = row.partyId === null ? undefined : labelOfParty.get(row.partyId);
    return {
      text: row.text,
      party: linked ?? row.unknownParty ?? null,
      ...(row.label === undefined ? {} : { label: row.label }),
    };
  };

  return {
    schema: SCHEMA,
    ...(state.batchOn ? { batch: state.batch } : {}),
    intake: {
      parties: state.parties.map((party) => ({
        label: writeLabel(party.label),
        type: party.type,
        fullName: party.fullName,
        aliases: [...party.aliases],
        idNumber: orNull(party.idNumber),
        definedTerm: orNull(party.definedTerm),
        ...(party.idLabel === undefined ? {} : { idLabel: party.idLabel }),
      })),
      addresses: state.addresses.map(contact),
      emails: state.emails.map(contact),
      phones: state.phones.map(contact),
      others: state.others.map((other) => {
        const of = (other.ownerId === null ? undefined : placeOfOther.get(other.ownerId)) ?? other.unknownOf;
        return {
          type: other.type,
          text: other.text,
          ...(other.label === null ? {} : { label: writeLabel(other.label) }),
          ...(of === undefined ? {} : { of }),
        };
      }),
    },
    alwaysKeep: [...state.alwaysKeep],
    redact: state.redact.map((row) => ({
      text: row.text,
      entity: row.entity,
      expect: row.expect,
      ...(row.type === '' ? {} : { type: row.type }),
    })),
    keep: state.keep.map((row) => row.text).filter((text) => text.trim() !== ''),
    ownTitles: state.ownTitles.map((row) => row.text).filter((text) => text.trim() !== ''),
  };
}

/** UTF-8 text with two spaces of indent and one line feed at the end. */
export function serialise(state: FormState): string {
  return `${JSON.stringify(toFile(state), null, 2)}\n`;
}
