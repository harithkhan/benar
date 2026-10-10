import { describe, expect, test } from 'vitest';

import { cleanStem, isStemValid, splitPath, targetPath, wordPath } from '../src/shared/target';

describe('the save target', () => {
  test.each([
    ['statement', 'statement'],
    ['  statement  ', 'statement'],
    ['statement.truth.json', 'statement'],
    ['statement.TRUTH.JSON', 'statement'],
    ['statement.docx', 'statement'],
    ['statement.json', 'statement'],
    ['statement.v2', 'statement.v2'],
    ['statement.docx.truth.json', 'statement.docx'],
    ['', ''],
  ])('the name %j gives the stem %j', (name, stem) => {
    expect(cleanStem(name)).toBe(stem);
  });

  test('the target is <folder>/<stem>.truth.json', () => {
    expect(targetPath('/scratch/matter-1', 'statement')).toBe('/scratch/matter-1/statement.truth.json');
    expect(targetPath('/scratch/matter-1/', 'statement')).toBe('/scratch/matter-1/statement.truth.json');
    expect(wordPath('/scratch/matter-1', 'statement')).toBe('/scratch/matter-1/statement.docx');
  });

  test('a path gives its folder and its stem', () => {
    expect(splitPath('/scratch/matter-1/statement.docx')).toEqual({ folder: '/scratch/matter-1', stem: 'statement' });
    expect(splitPath('/scratch/matter-1/statement.truth.json')).toEqual({ folder: '/scratch/matter-1', stem: 'statement' });
    expect(splitPath('/statement.json')).toEqual({ folder: '/', stem: 'statement' });
  });

  test.each(['', '.', '..', 'a/b', 'a\\b', 'a\0b'])('the stem %j is not valid', (stem) => {
    expect(isStemValid(stem)).toBe(false);
  });

  test('a usual stem is valid', () => {
    expect(isStemValid('statement of claim (2)')).toBe(true);
  });
});
