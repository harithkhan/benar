import type { Dispatch } from 'react';

import type { FormState } from '../../shared/model';
import { targetPath } from '../../shared/target';
import { Button, Card, CardBody, FILE_KEY, hasCode, Input, Labelled, RowProblems, Switch, type ProblemMap } from '../components/ui';
import type { AppAction } from '../state';

interface Props {
  form: FormState;
  folder: string;
  name: string;
  stem: string;
  problems: ProblemMap;
  dispatch: Dispatch<AppAction>;
}

export function FileSection({ form, folder, name, stem, problems, dispatch }: Props) {
  const list = problems.get(FILE_KEY);

  const browse = async () => {
    const picked = await window.benar.pickFolder();
    if (picked !== null) dispatch({ type: 'folder', value: picked });
  };
  const takeFromWordFile = async () => {
    const picked = await window.benar.pickWordFile();
    if (picked) dispatch({ type: 'target', folder: picked.folder, name: picked.stem });
  };

  return (
    <Card id={`row-${FILE_KEY}`} title="File">
      <CardBody className="flex flex-col gap-4">
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
          <div>
            <Labelled label="Folder">
              <div className="flex gap-2">
                <Input value={folder} onChange={(value) => dispatch({ type: 'folder', value })} mono invalid={hasCode(list, 'target-folder-empty', 'target-folder-missing')} data-field="folder" placeholder="/path/to/the/folder" />
                <Button onClick={browse}>Browse…</Button>
              </div>
            </Labelled>
            <RowProblems list={list} only={['target-folder-empty', 'target-folder-missing']} />
          </div>
          <div>
            <Labelled label="Name" hint="the same name as the Word file">
              <Input value={name} onChange={(value) => dispatch({ type: 'name', value })} mono invalid={hasCode(list, 'target-name-empty', 'target-name-bad')} data-field="name" placeholder="name" />
            </Labelled>
            <RowProblems list={list} only={['target-name-empty', 'target-name-bad', 'no-word-file']} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button onClick={takeFromWordFile}>Take from a Word file…</Button>
          <p className="min-w-0 flex-1 text-sm text-ink-muted">
            Save writes{' '}
            {folder.trim() !== '' && stem !== '' ? <span className="break-all font-mono text-xs text-accent-text">{targetPath(folder, stem)}</span> : <span className="text-ink-faint">a file when the folder and the name are set.</span>}
          </p>
        </div>

        <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
          <Switch checked={form.batchOn} onChange={(on) => dispatch({ type: 'batchOn', on })} label="Part of a batch" />
          {form.batchOn && (
            <div className="min-w-56 flex-1">
              <Input value={form.batch} onChange={(value) => dispatch({ type: 'batch', value })} accent aria-label="Batch" data-field="batch" placeholder="matter-1" />
              <RowProblems list={list} only={['batch-empty']} />
            </div>
          )}
          {!form.batchOn && <span className="text-sm text-ink-faint">Files with the same batch value are one batch.</span>}
        </div>
      </CardBody>
    </Card>
  );
}
