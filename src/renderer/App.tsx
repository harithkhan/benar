import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { menuEventName, type MenuCommand, type SaveResult, type TargetState } from '../shared/bridge';
import { parse } from '../shared/parse';
import { serialise } from '../shared/serialise';
import { cleanStem } from '../shared/target';
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
import { initialState, isDirty, isOwnFile, reducer, shownTargetState, type AppAction, type FoundTarget } from './state';

/**
 * What the form shows as the state of the disk for the save target, or `null`
 * while the app does not know it. The app asks again when the window gets the
 * focus. A result for a target that the form has no more is discarded.
 */
function useTargetState(folder: string, stem: string, targetNo: number): TargetState | null {
  const [last, setLast] = useState<FoundTarget | null>(null);
  useEffect(() => {
    let current = true;
    const ask = () => void window.benar.targetState(folder, stem).then((state) => current && setLast({ folder, stem, targetNo, state }));
    const timer = setTimeout(ask, 120);
    window.addEventListener('focus', ask);
    return () => {
      current = false;
      clearTimeout(timer);
      window.removeEventListener('focus', ask);
    };
  }, [folder, stem, targetNo]);
  return shownTargetState({ folder, stem, targetNo }, last);
}

export function byRow(problems: readonly Problem[]): ProblemMap {
  const map = new Map<string, Problem[]>();
  for (const problem of problems) {
    const key = problem.rowId ?? FILE_KEY;
    map.set(key, [...(map.get(key) ?? []), problem]);
  }
  return map;
}

/** A question or a notice in a dialog. `discard` is the question before New, Open and New from same matter; `next` is the one before the next file. */
type Ask = { kind: 'discard' | 'next'; then: () => void } | { kind: 'replace' } | { kind: 'notice'; title: string; text: string };

const SAVE_FAILED: Record<Exclude<SaveResult, { ok: true }>['reason'], string> = {
  exists: 'A file with this name is in the folder already.',
  'bad-name': 'The name is not a permitted file name.',
  'no-folder': 'The folder does not exist.',
  failed: 'The app cannot write a file in this folder.',
};

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [ask, setAskNow] = useState<Ask | null>(null);
  /** `true` while a dialog is open, for a menu command that comes before the next render. */
  const asking = useRef(false);
  const setAsk = (next: Ask | null) => {
    asking.current = next !== null;
    setAskNow(next);
  };
  const [savedStem, setSavedStem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The same as `saving`, for a second command that comes before the next render. */
  const saveStarted = useRef(false);
  const page = useRef<HTMLElement>(null);
  const { form, folder, name } = state;
  const stem = cleanStem(name);
  const found = useTargetState(folder, stem, state.targetNo);
  // While the app does not know the state of the target, it shows no problem of the disk.
  const problems = useMemo(() => validate(form, { folder, stem, folderExists: found?.folderExists ?? true, wordFileExists: found?.wordFileExists ?? true }), [form, folder, stem, found]);
  const problemMap = useMemo(() => byRow(problems), [problems]);
  const json = useMemo(() => serialise(form), [form]);
  const dirty = isDirty(state);
  const hasError = problems.some((problem) => problem.level === 'error');

  useEffect(() => window.benar.setDirty(dirty), [dirty]);

  const toTop = () => page.current?.scrollTo({ top: 0 });

  /**
   * New, Open and the next file do nothing while a save is in progress: the
   * result of the save is for the form that the window has now. They ask first
   * when the form has unsaved changes. `question` is the question that they ask.
   */
  const guarded = (action: () => void, question: 'discard' | 'next' = 'discard') => {
    const run = () => {
      if (!saveStarted.current) action();
    };
    return () => {
      if (saveStarted.current) return;
      if (dirty) setAsk({ kind: question, then: run });
      else run();
    };
  };

  /**
   * Gives the window another form. Not while a save is in progress, also when
   * the save started after the command. No question and no notice of the form
   * before it stays open.
   */
  const replaceForm = (action: Extract<AppAction, { type: 'new' | 'opened' | 'fromMatter' | 'nextFile' }>) => {
    if (saveStarted.current) return;
    dispatch(action);
    setAsk(null);
    setSavedStem(null);
    toTop();
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
    return { folder: picked.folder, stem: picked.stem, file: picked.file, sameFile: picked.sameFile, form: result.state };
  };

  const newFile = guarded(() => replaceForm({ type: 'new' }));

  const openFile = guarded(async () => {
    const picked = await pickTruth();
    if (picked) replaceForm({ type: 'opened', ...picked });
  });

  const newFromMatter = guarded(async () => {
    const picked = await pickTruth();
    if (picked) replaceForm({ type: 'fromMatter', source: picked.form, folder: picked.folder });
  });

  const nextFile = guarded(() => replaceForm({ type: 'nextFile' }), 'next');

  /**
   * Save does not wait for the state of the target: the main process checks
   * the folder, the name and an existing file again at the save itself. Save
   * is not available while a save is in progress.
   */
  const save = async (replace = false) => {
    if (hasError || saveStarted.current) return;
    saveStarted.current = true;
    setSaving(true);
    try {
      const target = { folder: folder.trim(), stem };
      const { formNo } = state;
      // Save replaces a file that the form opened or saved, and asks for each other file.
      const result = await window.benar.saveTruth(target.folder, target.stem, json, replace || isOwnFile(state, target.folder, target.stem));
      if (result.ok) {
        dispatch({ type: 'saved', ...target, json, formNo });
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

  // The File menu. The handlers of the last render do the work. A dialog of
  // the app is modal for the page, but not for the menu: a command does
  // nothing while a dialog is open.
  const commands = useRef<Record<MenuCommand, () => void>>(null);
  commands.current = { new: newFile, open: openFile, 'new-from-matter': newFromMatter, save: () => void save() };
  useEffect(() => {
    const names: MenuCommand[] = ['new', 'open', 'new-from-matter', 'save'];
    const run = (command: MenuCommand) => {
      if (asking.current) return;
      // A click on a button takes the focus from the field first, and a text
      // that the user typed in a chip input and did not enter becomes a chip
      // on that blur. A menu command takes no focus. So the listener takes it,
      // and runs the command in a new task: React applies the change of the
      // blur before the task runs, so `commands.current` has the handlers of
      // the form with the chip. Then the field gets the focus back, so that
      // the user can type on. A field that a new form removed gets no focus.
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      focused?.blur();
      setTimeout(() => {
        if (asking.current) return;
        commands.current?.[command]();
        if (focused?.isConnected) focused.focus();
      }, 0);
    };
    const listeners = names.map((command) => [menuEventName(command), () => run(command)] as const);
    for (const [event, listener] of listeners) window.addEventListener(event, listener);
    return () => {
      for (const [event, listener] of listeners) window.removeEventListener(event, listener);
    };
  }, []);

  const closeAsk = () => setAsk(null);
  const section = { form, problems: problemMap, dispatch };

  return (
    <div className="flex h-full flex-col">
      <TopBar fileName={state.fileName} dirty={dirty} onNew={saving ? undefined : newFile} onOpen={saving ? undefined : openFile} onNewFromMatter={saving ? undefined : newFromMatter} />
      <main ref={page} className="min-h-0 flex-1 overflow-y-auto">
        {/* The key gives each new form new components: no text that the user typed and did not enter stays, and no open panel. */}
        <div key={state.formNo} className="mx-auto flex max-w-[1060px] flex-col gap-4 px-5 py-5">
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
      <Footer problems={problems} onSave={saving ? undefined : () => void save()} />

      {savedStem !== null && (
        <Toast
          onClose={() => setSavedStem(null)}
          actions={
            <Button compact onClick={nextFile} disabled={saving}>
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

      {ask?.kind === 'next' && (
        <Dialog
          title="Start the next file of this matter?"
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
                Start the next file
              </Button>
            </>
          }
        >
          The form has changes that are not saved. The next file keeps the batch, the intake and Always keep as they are now. The rows of Redact, Keep and Own titles are not saved.
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
