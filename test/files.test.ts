import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { readTruth, saveTruth, targetState } from '../src/main/files';
import { EXAMPLE, text } from './example';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'benar-test-'));
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
});
