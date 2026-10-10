import { Card, CardBody, ChipInput } from '../components/ui';
import type { SectionProps } from './shared';

export function AlwaysKeep({ form, dispatch }: SectionProps) {
  return (
    <Card title="Always keep" count={form.alwaysKeep.length} hint="Texts that always stay in the document, for example public bodies.">
      <CardBody>
        <ChipInput values={form.alwaysKeep} onChange={(values) => dispatch({ type: 'alwaysKeep', values })} label="Always keep" placeholder="Type a text, then press Enter" />
      </CardBody>
    </Card>
  );
}
