import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { menuEventName, type MenuCommand, type SaveResult, type TargetState } from '../shared/bridge';
import { parse } from '../shared/parse';
import { serialise } from '../shared/serialise';
import { cleanStem, targetPath } from '../shared/target';
import { validate, type Problem } from '../shared/validate';
import { Button, Dialog, FILE_KEY, Toast, type ProblemMap } from './components/ui';
import { AlwaysKeep } from './sections/AlwaysKeep';
import { Contacts } from './sections/Contacts';
import { FileSection } from './sections/FileSection';
import { Footer } from './sections/Footer';
import { JsonPanel } from './sections/JsonPanel';
import { Others } from './sections/Others';
import { Parties } from './sections/Parties';
import { Redact } from './sections/Redact';
import { TextList } from './sections/TextList';
import { TopBar } from './sections/TopBar';
import { initialState, isDirty, reducer } from './state';

/**
 * What the disk has for the save target, or `null` while the app does not know
 * it. The app asks again when the window gets the focus.
 */
function useTargetState(folder: string, stem: string): TargetState | null {
  const [found, setFound] = useState<{ folder: string; stem: string; state: TargetState } | null>(null);
  useEffect(() => {
    let current = true;
    const ask = () => void window.benar.targetState(folder, stem).then((state) => current && setFound({ folder, stem, state }));
    const timer = setTimeout(ask, 120);
    window.addEventListener('focus', ask);
    return () => {
      current = false;
      clearTimeout(timer);
      window.removeEventListener('focus', ask);
    };
  }, [folder, stem]);
  // The result of another folder or name says nothing about this target.
  return found !== null && found.folder === folder && found.stem === stem ? found.state : null;
}

function byRow(problems: readonly Problem[]): ProblemMap {
  const map = new Map<string, Problem[]>();
  for (const problem of problems) {
    const key = problem.rowId ?? FILE_KEY;
    map.set(key, [...(map.get(key) ?? []), problem]);
  }
  return map;
}

/** A question or a notice in a dialog. */
type Ask = { kind: 'discard'; then: () => void } | { kind: 'replace' } | { kind: 'notice'; title: string; text: string };

const SAVE_FAILED: Record<Exclude<SaveResult, { ok: true }>['reason'], string> = {
  exists: 'A file with this name is in the folder already.',
  'bad-name': 'The name is not a permitted file name.',
  'no-folder': 'The folder does not exist.',
  failed: 'The app cannot write a file in this folder.',
};

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [savedStem, setSavedStem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The same as `saving`, for a second command that comes before the next render. */
  const saveStarted = useRef(false);
  const page = useRef<HTMLElement>(null);
  const { form, folder, name } = state;
  const stem = cleanStem(name);
  const found = useTargetState(folder, stem);
  // While the app does not know the state of the target, it shows no problem of the disk.
  const problems = useMemo(() => validate(form, { folder, stem, folderExists: found?.folderExists ?? true, wordFileExists: found?.wordFileExists ?? true }), [form, folder, stem, found]);
  const problemMap = useMemo(() => byRow(problems), [problems]);
  const json = useMemo(() => serialise(form), [form]);
  const dirty = isDirty(state);
  const hasError = problems.some((problem) => problem.level === 'error');

  useEffect(() => window.benar.setDirty(dirty), [dirty]);

  const toTop = () => page.current?.scrollTo({ top: 0 });

  /** New, Open and the next file ask first when the form has unsaved changes. */
  const guarded = (action: () => void) => () => {
    if (dirty) setAsk({ kind: 'discard', then: action });
    else action();
  };

  /** The Mac file dialog, then the checks of a loaded file. */
  const pickTruth = async () => {
    const picked = await window.benar.openTruth();
    if (!picked) return null;
    const result = picked.json === null ? null : parse(picked.json);
    if (!result) {
      setAsk({ kind: 'notice', title: 'The file did not open', text: 'The app cannot read this file.' });
      return null;
    }
    if (!result.ok) {
      setAsk({ kind: 'notice', title: 'The file did not open', text: result.message });
      return null;
    }
    return { folder: picked.folder, stem: picked.stem, sameFile: picked.sameFile, form: result.state };
  };

  const newFile = guarded(() => {
    dispatch({ type: 'new' });
    setSavedStem(null);
    toTop();
  });

  const openFile = guarded(async () => {
    const picked = await pickTruth();
    if (!picked) return;
    dispatch({ type: 'opened', form: picked.form, folder: picked.folder, stem: picked.stem, sameFile: picked.sameFile });
    setSavedStem(null);
    toTop();
  });

  const newFromMatter = guarded(async () => {
    const picked = await pickTruth();
    if (!picked) return;
    dispatch({ type: 'fromMatter', source: picked.form, folder: picked.folder });
    setSavedStem(null);
    toTop();
  });

  const nextFile = guarded(() => {
    dispatch({ type: 'nextFile' });
    setSavedStem(null);
    toTop();
  });

  /** Save is not available while a save is in progress, or while the app does not know the state of the target. */
  const canSave = found !== null && !saving;

  const save = async (replace = false) => {
    if (hasError || !canSave || saveStarted.current) return;
    saveStarted.current = true;
    setSaving(true);
    try {
      const target = { folder: folder.trim(), stem };
      // Save replaces the file that the form opened, and asks for each other file.
      const isOpened = state.opened !== null && targetPath(state.opened.folder, state.opened.stem) === targetPath(target.folder, target.stem);
      const result = await window.benar.saveTruth(target.folder, target.stem, json, replace || isOpened);
      if (result.ok) {
        dispatch({ type: 'saved', ...target, json });
        setSavedStem(target.stem);
      } else if (result.reason === 'exists') {
        setAsk({ kind: 'replace' });
      } else {
        setAsk({ kind: 'notice', title: 'The file was not saved', text: SAVE_FAILED[result.reason] });
      }
    } finally {
      saveStarted.current = false;
      setSaving(false);
    }
  };

  // The File menu. The handlers of the last render do the work.
  const commands = useRef<Record<MenuCommand, () => void>>(null);
  commands.current = { new: newFile, open: openFile, 'new-from-matter': newFromMatter, save: () => void save() };
  useEffect(() => {
    const names: MenuCommand[] = ['new', 'open', 'new-from-matter', 'save'];
    const listeners = names.map((command) => [menuEventName(command), () => commands.current?.[command]()] as const);
    for (const [event, listener] of listeners) window.addEventListener(event, listener);
    return () => {
      for (const [event, listener] of listeners) window.removeEventListener(event, listener);
    };
  }, []);

  const closeAsk = () => setAsk(null);
  const section = { form, problems: problemMap, dispatch };

  return (
    <div className="flex h-full flex-col">
      <TopBar fileName={state.opened?.stem ?? null} dirty={dirty} onNew={newFile} onOpen={openFile} onNewFromMatter={newFromMatter} />
      <main ref={page} className="min-h-0 flex-1 overflow-y-auto">
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
          <Redact {...section} knownEntities={state.knownEntities} fillNote={state.fillNote} />
          <TextList list="keep" {...section} />
          <TextList list="ownTitles" {...section} />
          <JsonPanel json={json} />
        </div>
      </main>
      <Footer problems={problems} onSave={canSave ? () => void save() : undefined} />

      {savedStem !== null && (
        <Toast
          onClose={() => setSavedStem(null)}
          actions={
            <Button compact onClick={nextFile}>
              Start the next file of this matter
            </Button>
          }
        >
          Saved <span className="font-mono text-xs">{savedStem}.truth.json</span>
        </Toast>
      )}

      {ask?.kind === 'discard' && (
        <Dialog
          title="Lose the unsaved changes?"
          onCancel={closeAsk}
          actions={
            <>
              <Button onClick={closeAsk}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  closeAsk();
                  ask.then();
                }}
              >
                Lose the changes
              </Button>
            </>
          }
        >
          The form has changes that are not saved.
        </Dialog>
      )}

      {ask?.kind === 'replace' && (
        <Dialog
          title="Replace the file?"
          onCancel={closeAsk}
          actions={
            <>
              <Button onClick={closeAsk}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  closeAsk();
                  void save(true);
                }}
              >
                Replace
              </Button>
            </>
          }
        >
          <span className="font-mono text-xs text-accent-text">{stem}.truth.json</span> is in this folder already. This form did not open it.
        </Dialog>
      )}

      {ask?.kind === 'notice' && (
        <Dialog title={ask.title} onCancel={closeAsk} actions={<Button onClick={closeAsk}>Close</Button>}>
          {ask.text}
        </Dialog>
      )}
    </div>
  );
}
