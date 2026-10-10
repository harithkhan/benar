import type { Dispatch } from 'react';

import type { FormState } from '../../shared/model';
import { TYPES } from '../../shared/schema';
import type { Problem } from '../../shared/validate';
import type { FieldName, ProblemMap, Option } from '../components/ui';
import type { AppAction } from '../state';
import { FIELD_OF } from './Footer';

export interface SectionProps {
  form: FormState;
  problems: ProblemMap;
  dispatch: Dispatch<AppAction>;
}

/**
 * The value of `aria-describedby` for a control of a row: the id of the list
 * of problems, when a problem of the list is about the control. A screen
 * reader then reads the messages with the control.
 */
export const describedBy = (list: readonly Problem[] | undefined, field: FieldName, id: string): string | undefined => (list?.some((problem) => FIELD_OF[problem.code] === field) ? id : undefined);

/** A select shows the name and the value, for example `Land title · title`. */
export const TYPE_OPTIONS: readonly Option[] = TYPES.map((type) => ({ value: type.value, label: `${type.name} · ${type.value}` }));
