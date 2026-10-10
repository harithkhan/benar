import { useEffect, useMemo, useReducer, useState } from 'react';

import type { TargetState } from '../shared/bridge';
import { cleanStem } from '../shared/target';
import { validate, type Problem } from '../shared/validate';
import { FILE_KEY, type ProblemMap } from './components/ui';
import { AlwaysKeep } from './sections/AlwaysKeep';
import { Contacts } from './sections/Contacts';
import { FileSection } from './sections/FileSection';
import { Others } from './sections/Others';
import { Parties } from './sections/Parties';
import { TopBar } from './sections/TopBar';
import { initialState, isDirty, reducer } from './state';

const NO_TARGET: TargetState = { folderExists: false, truthExists: false, wordFileExists: false };

/** What the disk has for the save target. The app asks again when the window gets the focus. */
function useTargetState(folder: string, stem: string): TargetState {
  const [found, setFound] = useState(NO_TARGET);
  useEffect(() => {
    let current = true;
    const ask = () => void window.benar.targetState(folder, stem).then((state) => current && setFound(state));
    const timer = setTimeout(ask, 120);
    window.addEventListener('focus', ask);
    return () => {
      current = false;
      clearTimeout(timer);
      window.removeEventListener('focus', ask);
    };
  }, [folder, stem]);
  return found;
}

function byRow(problems: readonly Problem[]): ProblemMap {
  const map = new Map<string, Problem[]>();
  for (const problem of problems) {
    const key = problem.rowId ?? FILE_KEY;
    map.set(key, [...(map.get(key) ?? []), problem]);
  }
  return map;
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const { form, folder, name } = state;
  const stem = cleanStem(name);
  const found = useTargetState(folder, stem);
  const problems = useMemo(() => validate(form, { folder, stem, folderExists: found.folderExists, wordFileExists: found.wordFileExists }), [form, folder, stem, found]);
  const problemMap = useMemo(() => byRow(problems), [problems]);
  const dirty = isDirty(state);

  useEffect(() => window.benar.setDirty(dirty), [dirty]);

  const section = { form, problems: problemMap, dispatch };

  return (
    <div className="flex h-full flex-col">
      <TopBar fileName={state.opened?.stem ?? null} dirty={dirty} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1060px] flex-col gap-4 px-5 py-5">
          <FileSection form={form} folder={folder} name={name} stem={stem} problems={problemMap} dispatch={dispatch} />
          <Parties {...section} />
          <Contacts list="addresses" {...section} />
          <div className="grid grid-cols-1 gap-4 min-[980px]:grid-cols-2">
            <Contacts list="emails" {...section} />
            <Contacts list="phones" {...section} />
          </div>
          <Others {...section} />
          <AlwaysKeep {...section} />
        </div>
      </main>
    </div>
  );
}
