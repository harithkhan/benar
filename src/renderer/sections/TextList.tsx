import { newId, type TextList as ListName } from '../../shared/model';
import { Button, Card, focusRow, Input, RemoveButton } from '../components/ui';
import type { SectionProps } from './shared';

const NAMES: Record<ListName, { title: string; hint: string; one: string }> = {
  keep: { title: 'Keep', hint: 'Cited case names that must stay. The citation can be part of the text.', one: 'case name' },
  ownTitles: { title: 'Own titles', hint: 'The title of the current matter, as it stands in the document.', one: 'title' },
};

/** A list of one-line rows. */
export function TextList({ list, form, dispatch }: SectionProps & { list: ListName }) {
  const names = NAMES[list];
  const rows = form[list];
  const add = () => {
    const id = newId();
    dispatch({ type: 'addText', list, id });
    focusRow(id);
  };
  return (
    <Card
      title={names.title}
      count={rows.length}
      hint={names.hint}
      actions={
        <Button compact onClick={add}>
          + Add
        </Button>
      }
    >
      {rows.length > 0 && (
        <ul className="flex flex-col gap-2 px-4 pb-4">
          {rows.map((row, place) => (
            <li key={row.id} id={`row-${row.id}`} className="flex scroll-mt-4 items-center gap-2">
              <Input compact value={row.text} onChange={(value) => dispatch({ type: 'text', list, id: row.id, value })} aria-label={`Text of ${names.one} ${place + 1}`} />
              <RemoveButton label={`Remove ${names.one} ${place + 1}`} onClick={() => dispatch({ type: 'remove', list, id: row.id })} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
