import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { pickedTruth, readTruth, saveTruth, targetState } from '../src/main/files';
import { EXAMPLE, text } from './example';

type FileSystem = typeof import('node:fs/promises');

// The real file functions. `writeFile` and `rename` keep a record of their
// calls, and one test can put a step between them.
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<FileSystem>();
  return { ...real, writeFile: vi.fn(real.writeFile), rename: vi.fn(real.rename) };
});

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'benar-test-'));
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const JSON_TEXT = text(EXAMPLE);

describe('saveTruth', () => {
  test('a save writes <stem>.truth.json in the folder', async () => {
    expect(await saveTruth(folder, 'statement', JSON_TEXT, false)).toEqual({ ok: true });
    expect(await readFile(path.join(folder, 'statement.truth.json'), 'utf8')).toBe(JSON_TEXT);
  });

  test('a save leaves no .tmp file', async () => {
    await saveTruth(folder, 'statement', JSON_TEXT, false);
    expect(await readdir(folder)).toEqual(['statement.truth.json']);
  });

  test('a replace is refused when replace is false', async () => {
    await saveTruth(folder, 'statement', '{"first":true}\n', false);
    expect(await saveTruth(folder, 'statement', JSON_TEXT, false)).toEqual({ ok: false, reason: 'exists' });
    expect(await readFile(path.join(folder, 'statement.truth.json'), 'utf8')).toBe('{"first":true}\n');
    expect(await readdir(folder)).toEqual(['statement.truth.json']);
  });

  test('a replace writes the new text when replace is true', async () => {
    await saveTruth(folder, 'statement', '{"first":true}\n', false);
    expect(await saveTruth(folder, 'statement', JSON_TEXT, true)).toEqual({ ok: true });
    expect(await readFile(path.join(folder, 'statement.truth.json'), 'utf8')).toBe(JSON_TEXT);
    expect(await readdir(folder)).toEqual(['statement.truth.json']);
  });

  test('a save into a folder that does not exist is refused', async () => {
    const missing = path.join(folder, 'missing');
    expect(await saveTruth(missing, 'statement', JSON_TEXT, false)).toEqual({ ok: false, reason: 'no-folder' });
    expect(await readdir(folder)).toEqual([]);
  });

  test.each(['', '..', '../statement', 'a/b'])('the name %j is refused', async (stem) => {
    expect(await saveTruth(folder, stem, JSON_TEXT, true)).toEqual({ ok: false, reason: 'bad-name' });
    expect(await readdir(folder)).toEqual([]);
  });

  test('a folder that is not a full path is refused', async () => {
    expect(await saveTruth('relative/folder', 'statement', JSON_TEXT, true)).toEqual({ ok: false, reason: 'no-folder' });
  });

  test.each([false, true])('a save writes the .tmp file, then renames it (replace %j)', async (replace) => {
    const target = path.join(folder, 'statement.truth.json');
    expect(await saveTruth(folder, 'statement', JSON_TEXT, replace)).toEqual({ ok: true });
    // The one write is to the .tmp file. The target gets its text from the rename only.
    expect(vi.mocked(writeFile).mock.calls.map((call) => call[0])).toEqual([`${target}.tmp`]);
    expect(vi.mocked(rename).mock.calls).toEqual([[`${target}.tmp`, target]]);
    expect(vi.mocked(writeFile).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(rename).mock.invocationCallOrder[0] ?? 0);
  });

  test('a file that appears after the first check is not replaced when replace is false', async () => {
    const target = path.join(folder, 'statement.truth.json');
    const real = await vi.importActual<FileSystem>('node:fs/promises');
    // Another program writes the target while the app writes the .tmp file.
    vi.mocked(writeFile).mockImplementationOnce(async (file, data, options) => {
      await real.writeFile(file, data, options);
      await real.writeFile(target, '{"other":true}\n');
    });
    expect(await saveTruth(folder, 'statement', JSON_TEXT, false)).toEqual({ ok: false, reason: 'exists' });
    expect(await readFile(target, 'utf8')).toBe('{"other":true}\n');
    expect(vi.mocked(rename)).not.toHaveBeenCalled();
    expect(await readdir(folder)).toEqual(['statement.truth.json']);
  });

  test.each([false, true])('no .tmp file stays when the target is a folder (replace %j)', async (replace) => {
    await mkdir(path.join(folder, 'statement.truth.json'));
    expect(await saveTruth(folder, 'statement', JSON_TEXT, replace)).toEqual({ ok: false, reason: 'failed' });
    // The .tmp file was there: the rename is the step that failed.
    expect(vi.mocked(rename)).toHaveBeenCalledTimes(1);
    expect(await readdir(folder)).toEqual(['statement.truth.json']);
    expect(await readdir(path.join(folder, 'statement.truth.json'))).toEqual([]);
  });

  test('no .tmp file stays when the write stops with an error', async () => {
    const real = await vi.importActual<FileSystem>('node:fs/promises');
    vi.mocked(writeFile).mockImplementationOnce(async (file, data, options) => {
      await real.writeFile(file, data, options);
      throw new Error('stopped');
    });
    expect(await saveTruth(folder, 'statement', JSON_TEXT, false)).toEqual({ ok: false, reason: 'failed' });
    expect(vi.mocked(rename)).not.toHaveBeenCalled();
    expect(await readdir(folder)).toEqual([]);
  });

  test('no .tmp file stays when the folder is read-only', async () => {
    await chmod(folder, 0o555);
    try {
      expect(await saveTruth(folder, 'statement', JSON_TEXT, false)).toEqual({ ok: false, reason: 'failed' });
      expect(await readdir(folder)).toEqual([]);
    } finally {
      await chmod(folder, 0o755);
    }
  });

  test('a replace in a read-only folder keeps the file and leaves no .tmp file', async () => {
    await saveTruth(folder, 'statement', '{"first":true}\n', false);
    await chmod(folder, 0o555);
    try {
      expect(await saveTruth(folder, 'statement', JSON_TEXT, true)).toEqual({ ok: false, reason: 'failed' });
      expect(await readFile(path.join(folder, 'statement.truth.json'), 'utf8')).toBe('{"first":true}\n');
      expect(await readdir(folder)).toEqual(['statement.truth.json']);
    } finally {
      await chmod(folder, 0o755);
    }
  });
});

describe('targetState', () => {
  test('an empty folder', async () => {
    expect(await targetState(folder, 'statement')).toEqual({ folderExists: true, truthExists: false, wordFileExists: false });
  });

  test('a folder that does not exist', async () => {
    expect(await targetState(path.join(folder, 'missing'), 'statement')).toEqual({ folderExists: false, truthExists: false, wordFileExists: false });
  });

  test('a file is not a folder', async () => {
    const file = path.join(folder, 'plain');
    await writeFile(file, '');
    expect((await targetState(file, 'statement')).folderExists).toBe(false);
  });

  test('the truth file and the Word file', async () => {
    await saveTruth(folder, 'statement', JSON_TEXT, false);
    expect(await targetState(folder, 'statement')).toEqual({ folderExists: true, truthExists: true, wordFileExists: false });
    // An empty file with the Word ending. The app looks for the name only.
    await writeFile(path.join(folder, 'statement.docx'), '');
    expect(await targetState(folder, 'statement')).toEqual({ folderExists: true, truthExists: true, wordFileExists: true });
    expect(await targetState(folder, 'other')).toEqual({ folderExists: true, truthExists: false, wordFileExists: false });
  });

  test('an empty folder text or an empty name', async () => {
    expect(await targetState('', 'statement')).toEqual({ folderExists: false, truthExists: false, wordFileExists: false });
    expect(await targetState(folder, '')).toEqual({ folderExists: true, truthExists: false, wordFileExists: false });
  });
});

describe('readTruth', () => {
  test('gives the folder, the stem and the text', async () => {
    await saveTruth(folder, 'statement', JSON_TEXT, false);
    expect(await readTruth(path.join(folder, 'statement.truth.json'))).toEqual({ folder, stem: 'statement', json: JSON_TEXT });
  });

  test('a file that it cannot read gives null', async () => {
    expect(await readTruth(path.join(folder, 'missing.truth.json'))).toBeNull();
  });

  test('a name with the ending .json only gives the stem with no ending', async () => {
    await writeFile(path.join(folder, 'x.json'), JSON_TEXT);
    expect(await readTruth(path.join(folder, 'x.json'))).toEqual({ folder, stem: 'x', json: JSON_TEXT });
  });

  test('a file above the size limit is not read', async () => {
    const limit = 8 * 1024 * 1024;
    const file = path.join(folder, 'statement.truth.json');
    await writeFile(file, '');
    // `truncate` sets the size. The file holds no text.
    await truncate(file, limit);
    expect((await readTruth(file))?.json.length).toBe(limit);
    await truncate(file, limit + 1);
    expect(await readTruth(file)).toBeNull();
  });
});

describe('pickedTruth', () => {
  test('the file that a save writes is the same file', async () => {
    await saveTruth(folder, 'statement', JSON_TEXT, false);
    expect(await pickedTruth(path.join(folder, 'statement.truth.json'))).toEqual({ folder, stem: 'statement', sameFile: true, json: JSON_TEXT });
  });

  test('a file with the ending .json only is not the file that a save writes', async () => {
    await saveTruth(folder, 'statement', '{"first":true}\n', false);
    await writeFile(path.join(folder, 'statement.json'), JSON_TEXT);
    expect(await pickedTruth(path.join(folder, 'statement.json'))).toEqual({ folder, stem: 'statement', sameFile: false, json: JSON_TEXT });
  });

  test('an ending in capital letters is not the file that a save writes', async () => {
    await writeFile(path.join(folder, 'statement.TRUTH.JSON'), JSON_TEXT);
    expect(await pickedTruth(path.join(folder, 'statement.TRUTH.JSON'))).toEqual({ folder, stem: 'statement', sameFile: false, json: JSON_TEXT });
  });

  test('a file that the app cannot read gives no text', async () => {
    expect(await pickedTruth(path.join(folder, 'missing.json'))).toEqual({ folder, stem: 'missing', sameFile: false, json: null });
  });
});
