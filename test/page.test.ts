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
import { MESSAGE } from '../src/renderer/messages';
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
  /** The text of the element and of the elements inside it. */
  text: string;
}

const TAG = /<(\/?)([a-z][a-z0-9]*)((?:\s+[^\s"=<>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;
const ATTR = /([^\s"=<>/]+)(?:="([^"]*)")?/g;
const VOID = new Set(['input', 'br', 'hr', 'img']);
const ENTITY: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" };

function readHtml(html: string): Element {
  const root: Element = { tag: '#root', attrs: {}, children: [], text: '' };
  const open = [root];
  let tags = 0;
  let end = 0;
  for (const match of html.matchAll(TAG)) {
    const [whole, close, tag, attrText, selfClose] = match;
    // The text before the tag is text of each element that is open.
    const before = html.slice(end, match.index).replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => ENTITY[entity]!);
    for (const element of open) element.text += before;
    end = match.index + whole.length;
    tags += 1;
    const parent = open.at(-1)!;
    if (close) {
      if (parent.tag !== tag) throw new Error('the HTML has a tag that does not close');
      open.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [, name, value] of attrText!.matchAll(ATTR)) attrs[name!] = value ?? '';
    const element: Element = { tag: tag!, attrs, children: [], text: '' };
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

describe('the message of each problem', () => {
  /** For each problem of the code: its row, its control, and all elements of the page. */
  function shown(code: Code) {
    const { form, target } = CASES[code]();
    const info = { ...TARGET, ...target };
    const problems = validate(form, info).filter((problem) => problem.code === code);
    expect(problems.length).toBeGreaterThan(0);
    const elements = inside(page(form, info));
    return problems.map((problem) => {
      const row = elements.find((element) => element.attrs.id === `row-${problem.rowId ?? FILE_KEY}`)!;
      const control = inside(row).find((element) => element.attrs['data-field'] === FIELD_OF[code])!;
      return { problem, row, control, elements };
    });
  }

  const codes = Object.keys(FIELD_OF) as Code[];

  test.each(codes)('%s: the row of the problem shows the message of the code', (code) => {
    expect(MESSAGE[code]).not.toBe('');
    for (const { row } of shown(code)) expect(row.text).toContain(MESSAGE[code]);
  });

  test.each(codes)('%s: the control of an error has aria-invalid, and the control of a warning does not', (code) => {
    for (const { problem, control } of shown(code)) {
      // A control can have an error of another code. Each case has no error on the control of its warning.
      expect(control.attrs['aria-invalid']).toBe(problem.level === 'error' ? 'true' : undefined);
    }
  });

  test.each(codes)('%s: the control names an element that holds the message', (code) => {
    for (const { control, elements } of shown(code)) {
      const ids = (control.attrs['aria-describedby'] ?? '').split(' ').filter((id) => id !== '');
      expect(ids.length).toBeGreaterThan(0);
      const named = ids.map((id) => elements.filter((element) => element.attrs.id === id));
      expect(named.map((list) => list.length)).toEqual(ids.map(() => 1));
      expect(named.some(([element]) => element!.text.includes(MESSAGE[code]))).toBe(true);
    }
  });

  test('errors and warnings are in the cases', () => {
    const levels = new Set(codes.flatMap((code) => shown(code).map(({ problem }) => problem.level)));
    expect([...levels].sort()).toEqual(['error', 'warning']);
  });
});

describe('the type select of an entry of others', () => {
  // Section 4.2 of the plan: the 17 values, with the name that a select shows.
  const TYPES = [
    ['party', 'Party'],
    ['person', 'Person'],
    ['child', 'Child'],
    ['company', 'Company'],
    ['address', 'Address'],
    ['email', 'Email'],
    ['phone', 'Phone'],
    ['nric', 'NRIC'],
    ['passport', 'Passport'],
    ['company-no', 'Company number (SSM)'],
    ['id-no', 'Professional number'],
    ['account', 'Account number'],
    ['title', 'Land title'],
    ['case-no', 'Case number'],
    ['dob', 'Date of birth'],
    ['vehicle', 'Vehicle number'],
    ['other', 'Other'],
  ] as const;
  const PERMITTED = TYPES.map(([value, name]) => ({ value, text: `${name} · ${value}` }));

  /** The options of the type select of the first entry. */
  function options(type: string) {
    const { form } = withOthers([{ type, text: 'Geran 1234' }]);
    const row = inside(page(form)).find((element) => element.attrs.id === `row-${form.others[0]!.id}`)!;
    const selects = inside(row).filter((element) => element.tag === 'select' && element.attrs['data-field'] === 'type');
    expect(selects).toHaveLength(1);
    return selects[0]!.children.map((option) => ({ tag: option.tag, value: option.attrs.value, text: option.text, selected: 'selected' in option.attrs }));
  }

  test('the 17 values show as name and value', () => {
    expect(PERMITTED).toHaveLength(17);
    expect(PERMITTED[12]!.text).toBe('Land title · title');
    expect(options('title')).toEqual(PERMITTED.map((option) => ({ tag: 'option', ...option, selected: option.value === 'title' })));
  });

  test('a value outside the permitted values shows as the value and not permitted', () => {
    expect(options('pet')).toEqual([{ tag: 'option', value: 'pet', text: 'pet · not permitted', selected: true }, ...PERMITTED.map((option) => ({ tag: 'option', ...option, selected: false }))]);
  });
});

describe('the cards of the parties', () => {
  const CARD = ['rounded-card', 'border', 'border-line', 'bg-panel'];
  const classes = (element: Element): string[] => (element.attrs.class ?? '').split(' ');
  const isCard = (element: Element): boolean => CARD.every((name) => classes(element).includes(name));
  /** The elements that hold the element, from the outside to the inside. */
  const around = (root: Element, element: Element): Element[] => {
    const holder = root.children.find((child) => child === element || inside(child).includes(element));
    return !holder || holder === element ? [] : [holder, ...around(holder, element)];
  };
  const withText = (elements: Element[], tag: string, text: string): Element[] => elements.filter((element) => element.tag === tag && element.text === text);

  test('each party is in a card of its own', () => {
    const form = load();
    const root = page(form);
    const elements = inside(root);
    const cards = form.parties.map((party) => {
      const rows = elements.filter((element) => element.attrs.id === `row-${party.id}`);
      expect(rows).toHaveLength(1);
      return rows[0]!;
    });
    expect(cards).toHaveLength(2);
    cards.forEach((card, place) => {
      expect(isCard(card)).toBe(true);
      // The card is not inside another card, and it holds the fields of its party only.
      expect(around(root, card).filter(isCard)).toEqual([]);
      const labels = inside(card).filter((element) => element.attrs['data-field'] === 'label');
      expect(labels.map((label) => label.attrs.value)).toEqual([form.parties[place]!.label]);
      expect(withText(inside(card), 'button', 'Remove')).toHaveLength(1);
      expect(inside(card).filter((element) => element.tag === 'h2')).toEqual([]);
    });
  });

  test('one heading above the cards has the title, the count and the button', () => {
    const form = load();
    const root = page(form);
    const elements = inside(root);
    const headings = withText(elements, 'h2', 'Parties2');
    expect(headings).toHaveLength(1);
    const buttons = withText(elements, 'button', '+ Add party');
    expect(buttons).toHaveLength(1);
    // The heading and the button are in one header, and in no card.
    const header = around(root, headings[0]!).at(-1)!;
    expect(header.tag).toBe('header');
    expect(inside(header)).toContain(buttons[0]);
    expect(around(root, header).filter(isCard)).toEqual([]);
    // The header is before the first card.
    const first = elements.findIndex((element) => element.attrs.id === `row-${form.parties[0]!.id}`);
    expect(first).toBeGreaterThan(0);
    expect(elements.indexOf(header)).toBeLessThan(first);
  });

  test('with no party, the empty text is in a card', () => {
    const { form } = fromFile((file) => {
      file.intake.parties = [];
      file.intake.addresses = [];
      file.intake.phones = [];
    });
    const elements = inside(page(form));
    expect(withText(elements, 'h2', 'Parties0')).toHaveLength(1);
    expect(withText(elements, 'button', '+ Add party')).toHaveLength(1);
    const empty = elements.filter((element) => element.text === 'No party. Add the parties of the matter.');
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.filter(isCard)).toHaveLength(1);
  });
});

describe('the add button of each list', () => {
  // Section 7 of the plan: `+ Add` and `×` on each list.
  test.each(['Addresses', 'Emails', 'Phones', 'Other people and identifiers', 'Keep', 'Own titles'])('%s: the button reads + Add', (title) => {
    const cards = inside(page(fullForm())).filter((element) => element.tag === 'section' && element.children[0]?.tag === 'header' && inside(element).some((heading) => heading.tag === 'h2' && heading.text.replace(/\d+$/, '') === title));
    expect(cards).toHaveLength(1);
    const buttons = inside(cards[0]!).filter((element) => element.tag === 'button');
    expect(buttons.map((button) => button.text).filter((text) => text.startsWith('+'))).toEqual(['+ Add']);
    // Each row has its remove button.
    const rows = inside(cards[0]!).filter((element) => element.attrs.id?.startsWith('row-'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(inside(row).filter((element) => element.tag === 'button').map((button) => button.text)).toEqual(['×']);
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

    test('each aria-describedby names elements of the page', () => {
      for (const element of elements) {
        if (element.attrs['aria-describedby'] === undefined) continue;
        const ids = element.attrs['aria-describedby'].split(' ');
        expect(ids.map((id) => elements.filter((named) => named.attrs.id === id).length)).toEqual(ids.map(() => 1));
      }
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
