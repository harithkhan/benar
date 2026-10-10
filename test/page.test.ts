import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import type { FormState } from '../src/shared/model';
import { parse } from '../src/shared/parse';
import { serialise } from '../src/shared/serialise';
import { validate, type Code, type TargetInfo } from '../src/shared/validate';
import { App, byRow } from '../src/renderer/App';
import { FILE_KEY } from '../src/renderer/components/ui';
import { AlwaysKeep } from '../src/renderer/sections/AlwaysKeep';
import { Contacts } from '../src/renderer/sections/Contacts';
import { FileSection } from '../src/renderer/sections/FileSection';
import { FIELD_OF, Footer } from '../src/renderer/sections/Footer';
import { JsonPanel } from '../src/renderer/sections/JsonPanel';
import { Others } from '../src/renderer/sections/Others';
import { Parties } from '../src/renderer/sections/Parties';
import { Redact } from '../src/renderer/sections/Redact';
import { TextList } from '../src/renderer/sections/TextList';
import { TopBar } from '../src/renderer/sections/TopBar';
import { EXAMPLE, example, text } from './example';

// The page as static HTML. No DOM is here, so the test reads the tags of the
// text. React writes each attribute value in double quotes and writes `<` and
// `>` of a text or a value as an entity. So each `<` starts a tag.

interface Element {
  tag: string;
  attrs: Record<string, string>;
  children: Element[];
}

const TAG = /<(\/?)([a-z][a-z0-9]*)((?:\s+[^\s"=<>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;
const ATTR = /([^\s"=<>/]+)(?:="([^"]*)")?/g;
const VOID = new Set(['input', 'br', 'hr', 'img']);

function readHtml(html: string): Element {
  const root: Element = { tag: '#root', attrs: {}, children: [] };
  const open = [root];
  let tags = 0;
  for (const [, close, tag, attrText, selfClose] of html.matchAll(TAG)) {
    tags += 1;
    const parent = open.at(-1)!;
    if (close) {
      if (parent.tag !== tag) throw new Error('the HTML has a tag that does not close');
      open.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [, name, value] of attrText!.matchAll(ATTR)) attrs[name!] = value ?? '';
    const element: Element = { tag: tag!, attrs, children: [] };
    parent.children.push(element);
    if (!selfClose && !VOID.has(tag!)) open.push(element);
  }
  // Each `<` of the text is the start of a tag that the reader knows.
  if (open.length !== 1 || tags !== html.split('<').length - 1) throw new Error('the test cannot read the HTML');
  return root;
}

const inside = (element: Element): Element[] => element.children.flatMap((child) => [child, ...inside(child)]);

/** The elements that a label can name. */
const LABELABLE = new Set(['button', 'input', 'meter', 'output', 'progress', 'select', 'textarea']);
const FIELDS = new Set(['input', 'select', 'textarea']);

const TARGET: TargetInfo = { folder: '/scratch/matter-1', stem: 'statement', folderExists: true, wordFileExists: true };

function load(value: unknown = EXAMPLE): FormState {
  const result = parse(text(value));
  if (!result.ok) throw new Error('the test data did not load');
  return result.state;
}

/** The sections of the page, in the order of `App`, with the problems of the form. */
function page(form: FormState, target: TargetInfo = TARGET): Element {
  const problems = validate(form, target);
  const section = { form, problems: byRow(problems), dispatch: () => undefined };
  return readHtml(
    renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(TopBar, { fileName: `${target.stem}.truth.json`, dirty: true }),
        createElement(FileSection, { ...section, folder: target.folder, name: target.stem, stem: target.stem }),
        createElement(Parties, section),
        createElement(Contacts, { list: 'addresses', ...section }),
        createElement(Contacts, { list: 'emails', ...section }),
        createElement(Contacts, { list: 'phones', ...section }),
        createElement(Others, section),
        createElement(AlwaysKeep, section),
        createElement(Redact, { ...section, knownEntities: ['w-siti'], fillNote: { added: 1, skipped: 1 } }),
        createElement(TextList, { list: 'keep', ...section }),
        createElement(TextList, { list: 'ownTitles', ...section }),
        createElement(JsonPanel, { json: serialise(form) }),
        createElement(Footer, { problems, onSave: () => undefined }),
      ),
    ),
  );
}

/** A form and a target that give one problem code. */
interface Case {
  form: FormState;
  target?: Partial<TargetInfo>;
}

/** The example, with a change to the loaded form. */
function changed(change: (form: FormState) => void, file: unknown = EXAMPLE): Case {
  const form = load(file);
  change(form);
  return { form };
}

/** The example, with a change to the file before the load. */
function fromFile(change: (file: any) => void): Case {
  const file = example();
  change(file);
  return { form: load(file) };
}

const withOthers = (others: unknown[]): Case =>
  fromFile((file) => {
    file.intake.others = others;
  });

const onTarget = (target: Partial<TargetInfo>): Case => ({ form: load(), target });

// One case for each code. The type makes a new code with no case a type error.
const CASES: Record<Code, () => Case> = {
  'party-label-empty': () => changed((form) => void (form.parties[0]!.label = ' [ ] ')),
  'party-label-bracket': () => changed((form) => void (form.parties[0]!.label = 'PARTY [A')),
  'party-label-duplicate': () => changed((form) => void (form.parties[1]!.label = '[party   a]')),
  'party-type': () => fromFile((file) => void (file.intake.parties[0].type = 'trust')),
  'party-no-name': () => changed((form) => void (form.parties[1]!.fullName = '')),
  'party-entity-shared': () => changed((form) => void (form.parties[1]!.label = '[PARTY-A]')),
  'party-label-slug-empty': () => changed((form) => void (form.parties[1]!.label = '[#]')),
  'contact-unknown-party': () => fromFile((file) => void (file.intake.phones[0].party = '[PARTY Z]')),
  'other-type': () => withOthers([{ type: 'pet', text: 'Comel' }]),
  'of-not-id-type': () => withOthers([{ type: 'person', text: 'Siti binti Hassan' }, { type: 'address', text: 'Lot 5', of: 0 }]),
  'of-self': () => withOthers([{ type: 'nric', text: '900101-01-1234', of: 0 }]),
  'of-missing': () => withOthers([{ type: 'nric', text: '900101-01-1234', of: 5 }]),
  'of-owner-type': () => withOthers([{ type: 'title', text: 'Geran 1234' }, { type: 'nric', text: '900101-01-1234', of: 0 }]),
  'of-owner-has-of': () => withOthers([{ type: 'person', text: 'Siti binti Hassan' }, { type: 'nric', text: '900101-01-1234', of: 0 }, { type: 'passport', text: 'A1234567', of: 1 }]),
  'other-label-empty': () => withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[]' }]),
  'other-label-bracket': () => withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[SEC]RETARY]' }]),
  'other-label-is-party': () => withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[party a]' }]),
  'other-label-shared': () => withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' }, { type: 'company', text: 'Siti Enterprise', label: '[SECRETARY 1]' }]),
  'other-entity-shared': () => withOthers([{ type: 'person', text: 'Siti binti Hassan' }, { type: 'person', text: 'Lim Mei Ling', label: '[PERSON 1]' }]),
  'other-label-slug-empty': () => withOthers([{ type: 'person', text: 'Siti binti Hassan', label: '[#]' }]),
  'redact-text-empty': () => changed((form) => void (form.redact[1]!.text = '   ')),
  'redact-entity-empty': () => changed((form) => void (form.redact[2]!.entity = '')),
  'redact-expect': () => fromFile((file) => void (file.redact[0].expect = 'maybe')),
  'redact-type': () => fromFile((file) => void (file.redact[1].type = 'thing')),
  'redact-duplicate': () => changed((form) => void (form.redact[1]!.text = 'TAN AH KOW')),
  'redact-defined-term': () => changed((form) => void (form.redact[4]!.text = 'The  plaintiff')),
  'target-folder-empty': () => onTarget({ folder: '  ', folderExists: false }),
  'target-name-empty': () => onTarget({ stem: '' }),
  'target-name-bad': () => onTarget({ stem: '../statement' }),
  'target-folder-missing': () => onTarget({ folderExists: false, wordFileExists: false }),
  'no-word-file': () => onTarget({ wordFileExists: false }),
  'batch-empty': () => changed((form) => void (form.batch = ' ')),
};

/** A form with a row in each list, and rows with problems. */
function fullForm(): FormState {
  const file = example();
  file.intake.parties[1].fullName = '';
  file.intake.emails = [{ text: 'tan@example.test', party: '[PARTY A]' }, { text: 'bayu@example.test', party: '[PARTY Z]' }];
  file.intake.others = [
    { type: 'person', text: 'Siti binti Hassan', label: '[SECRETARY 1]' },
    { type: 'nric', text: '900101-01-1234', of: 0 },
    { type: 'nric', text: '900101011234', of: 7 },
  ];
  file.redact[1].text = '';
  return load(file);
}

describe('the control of each problem', () => {
  test('each code has a case', () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(FIELD_OF).sort());
  });

  test.each(Object.keys(FIELD_OF) as Code[])('%s: its row has exactly one control with the name of the code', (code) => {
    const { form, target } = CASES[code]();
    const info = { ...TARGET, ...target };
    const problems = validate(form, info).filter((problem) => problem.code === code);
    expect(problems.length).toBeGreaterThan(0);
    const elements = inside(page(form, info));
    for (const problem of problems) {
      const rows = elements.filter((element) => element.attrs.id === `row-${problem.rowId ?? FILE_KEY}`);
      expect(rows).toHaveLength(1);
      const controls = inside(rows[0]!).filter((element) => element.attrs['data-field'] === FIELD_OF[code]);
      expect(controls.map((control) => FIELDS.has(control.tag))).toEqual([true]);
    }
  });
});

describe('the ids and the labels of the page', () => {
  const pages: [string, () => Element][] = [
    ['the example', () => page(load())],
    ['a form with a row in each list', () => page(fullForm())],
    ['a form with errors of the target', () => page(load(), { ...TARGET, stem: '', folderExists: false })],
    ['the app with a new file', () => readHtml(renderToStaticMarkup(createElement(App)))],
  ];

  describe.each(pages)('%s', (_name, render) => {
    const elements = inside(render());
    const labels = elements.filter((element) => element.tag === 'label');

    test('the page has controls and labels', () => {
      expect(elements.some((element) => FIELDS.has(element.tag))).toBe(true);
      expect(labels.length).toBeGreaterThan(0);
    });

    test('no id is on two elements', () => {
      const ids = elements.flatMap((element) => (element.attrs.id === undefined ? [] : [element.attrs.id]));
      expect(ids).not.toContain('');
      expect(ids.filter((id, n) => ids.indexOf(id) !== n)).toEqual([]);
    });

    test('each label with a for names exactly one control', () => {
      for (const label of labels) {
        if (label.attrs.for === undefined) continue;
        const named = elements.filter((element) => element.attrs.id === label.attrs.for);
        expect(named.map((element) => FIELDS.has(element.tag))).toEqual([true]);
      }
    });

    test('no label holds a control other than the one that it labels', () => {
      for (const label of labels) {
        const held = inside(label).filter((element) => LABELABLE.has(element.tag));
        if (label.attrs.for === undefined) {
          // With no `for`, a label is for the first control that it holds.
          expect(held.length).toBeLessThanOrEqual(1);
        } else {
          expect(held.filter((element) => element.attrs.id !== label.attrs.for)).toEqual([]);
        }
      }
    });

    test('a field has a name: a label, or a spoken name', () => {
      const labelled = new Set(labels.flatMap((label) => (label.attrs.for === undefined ? inside(label) : elements.filter((element) => element.attrs.id === label.attrs.for))));
      for (const field of elements.filter((element) => FIELDS.has(element.tag))) {
        expect(labelled.has(field) || (field.attrs['aria-label'] ?? '') !== '').toBe(true);
      }
    });
  });
});

describe('the top bar', () => {
  const bar = (fileName: string | null, commands: boolean) => {
    const command = commands ? () => undefined : undefined;
    return renderToStaticMarkup(createElement(TopBar, { fileName, dirty: false, onNew: command, onOpen: command, onNewFromMatter: command }));
  };
  const buttons = (html: string) => inside(readHtml(html)).filter((element) => element.tag === 'button');

  test('a new file shows as New file', () => {
    expect(bar(null, true)).toContain('New file');
  });

  test.each(['statement.truth.json', 'statement.json', 'statement.TRUTH.JSON'])('the name of the file shows as it is: %s', (name) => {
    const html = bar(name, true);
    expect(html).toContain(`>${name}</span>`);
    expect(html).not.toContain('New file');
    // The bar adds no ending to the name.
    expect(html.split('.truth.json').length - 1).toBe(name.endsWith('.truth.json') ? 1 : 0);
  });

  test('the three commands are not available when the bar gets no command', () => {
    expect(buttons(bar(null, true)).map((button) => 'disabled' in button.attrs)).toEqual([false, false, false]);
    expect(buttons(bar(null, false)).map((button) => 'disabled' in button.attrs)).toEqual([true, true, true]);
  });
});
