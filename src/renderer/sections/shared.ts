import type { Dispatch } from 'react';

import type { FormState } from '../../shared/model';
import { TYPES } from '../../shared/schema';
import type { ProblemMap, Option } from '../components/ui';
import type { AppAction } from '../state';

export interface SectionProps {
  form: FormState;
  problems: ProblemMap;
  dispatch: Dispatch<AppAction>;
}

/** A select shows the name and the value, for example `Land title · title`. */
export const TYPE_OPTIONS: readonly Option[] = TYPES.map((type) => ({ value: type.value, label: `${type.name} · ${type.value}` }));
