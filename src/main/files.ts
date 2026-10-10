import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PickedTruth, SaveResult, TargetState } from '../shared/bridge';
import { isStemValid, splitPath, targetPath, wordPath } from '../shared/target';

// The file access of the app. It has no import of Electron, so that a test
// can run it on a temporary folder. No function here opens a Word document.

export interface OpenedTruth {
  folder: string;
  stem: string;
  json: string;
}

/** A ground-truth file is small. A larger file is not read. */
const MAX_BYTES = 8 * 1024 * 1024;

async function isFolder(folder: string): Promise<boolean> {
  if (!path.isAbsolute(folder)) return false;
  try {
    return (await stat(folder)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

export async function targetState(folder: string, stem: string): Promise<TargetState> {
  const folderExists = await isFolder(folder.trim());
  if (!folderExists || !isStemValid(stem)) return { folderExists, truthExists: false, wordFileExists: false };
  const [truthExists, wordFileExists] = await Promise.all([isFile(targetPath(folder, stem)), isFile(wordPath(folder, stem))]);
  return { folderExists, truthExists, wordFileExists };
}

/** Writes `<stem>.truth.json.tmp` in the folder, then renames it. */
export async function saveTruth(folder: string, stem: string, json: string, replace: boolean): Promise<SaveResult> {
  if (!isStemValid(stem)) return { ok: false, reason: 'bad-name' };
  if (!(await isFolder(folder.trim()))) return { ok: false, reason: 'no-folder' };
  const target = targetPath(folder, stem);
  if (!replace && (await isFile(target))) return { ok: false, reason: 'exists' };
  const temporary = `${target}.tmp`;
  try {
    await writeFile(temporary, json, 'utf8');
    // A file can appear after the first check. So the app checks again directly before the rename.
    if (!replace && (await isFile(target))) {
      await rm(temporary, { force: true });
      return { ok: false, reason: 'exists' };
    }
    await rename(temporary, target);
    return { ok: true };
  } catch {
    await rm(temporary, { force: true }).catch(() => undefined);
    return { ok: false, reason: 'failed' };
  }
}

/** The text of a ground-truth file, or `null` when the app cannot read it. */
export async function readTruth(file: string): Promise<OpenedTruth | null> {
  try {
    if ((await stat(file)).size > MAX_BYTES) return null;
    const json = await readFile(file, 'utf8');
    return { ...splitPath(file), json };
  } catch {
    return null;
  }
}

/** What `openTruth` gives for the file that the user picked. The stem alone does not say which file it was. */
export async function pickedTruth(file: string): Promise<PickedTruth> {
  const { folder, stem } = splitPath(file);
  const json = (await readTruth(file))?.json ?? null;
  return { folder, stem, file: path.basename(file), sameFile: file === targetPath(folder, stem), json };
}
