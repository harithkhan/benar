# Benar: build plan

## 1. Goal

Benar is a Mac desktop app. It makes and edits ground-truth files of the `manual-1` format: one `<name>.truth.json` beside one `<name>.docx`. The user fills a form. The app writes valid JSON with the correct keys and values.

## 2. Rules for this project

- **No real data.** The files that this tool writes hold real client names. No real name, path or file goes into the repository, a test, a screenshot or a commit message. Tests use the invented example of section 4.3 only.
- **No network.** The app makes no request. It has no telemetry and no update check.
- **No text in logs.** A log line or an error message names the kind of problem only, never text of the form.
- **Disk writes.** The app writes one file only: the one that the user saves. No draft, no recent-files list, no app data with form text.
- **Path only for Word files.** The app never opens a Word document. It reads the path and checks that the file exists.
- **Private source.** The format comes from a private app. No file of this repository names that app. The session prompt gives the name to search for before the push.
- `.gitignore` holds `*.truth.json`, `*.docx`, `node_modules/`, `out/`, `.vite/`.
- Tests first for `src/shared/`. Never weaken a test to make it pass.

## 3. Stack and layout

One package, pnpm, TypeScript, ESM. Pin the versions of the reference app: `electron` ^44.5.1, `@electron-forge/cli` and `@electron-forge/plugin-vite` ^8.0.1, `react` and `react-dom` 19.3.0, `tailwindcss` and `@tailwindcss/vite` 4.3.3, `@vitejs/plugin-react` 6.1.2, `vite` ^8.3.2, `typescript` ^6.0.3, `vitest` ^5.0.3, `@fontsource-variable/manrope` 5.3.0, `@fontsource-variable/jetbrains-mono` 5.3.0. Node 22.13.0 or later.

Known traps of this toolchain:

- pnpm stops an install on a build script that `allowBuilds` in `pnpm-workspace.yaml` does not list. Allow the scripts that the install names (for example `electron`, `esbuild`).
- Electron Forge packages with pnpm only when `hoistPattern: ['*']` is set in `pnpm-workspace.yaml`.
- The Forge Vite plugin keeps symlinks. Set `resolve: { preserveSymlinks: false }` in the renderer config.
- Set `assetsInlineLimit: 0` in the renderer config, so that no font becomes a `data:` URL under the content policy.

```
benar/
  CLAUDE.md  README.md  docs/PLAN.md
  package.json  pnpm-workspace.yaml  tsconfig.json
  forge.config.ts  vite.main.config.ts  vite.preload.config.ts  vite.renderer.config.ts
  tailwind.preset.js  tailwind.config.js
  scripts/install-app.mjs
  src/shared/    schema.ts  model.ts  serialise.ts  parse.ts  validate.ts  fill.ts  target.ts  bridge.ts
  src/main/      main.ts  files.ts  menu.ts  policy.ts
  src/preload/   preload.ts
  src/renderer/  index.html  main.tsx  App.tsx  style.css  state.ts  messages.ts  bridge.d.ts  components/ui.tsx  sections/*.tsx  sections/shared.ts
  test/          *.test.ts  example.ts
```

Scripts: `start` (`electron-forge start`), `package` (`electron-forge package`), `install:app`, `typecheck`, `test`, `verify` (typecheck, then test). No ESLint in this build.

## 4. The `manual-1` format

### 4.1 The file, with the order of the keys that the app writes

```json
{
  "schema": "manual-1",
  "batch": "matter-1",
  "intake": {
    "parties": [
      { "label": "[PARTY A]", "type": "individual", "fullName": "", "aliases": [], "idNumber": null, "definedTerm": null }
    ],
    "addresses": [{ "text": "", "party": "[PARTY A]" }],
    "emails": [],
    "phones": [],
    "others": [{ "type": "person", "text": "", "label": "[SECRETARY 1]" }, { "type": "nric", "text": "", "of": 0 }]
  },
  "alwaysKeep": [],
  "redact": [{ "text": "", "entity": "", "expect": "entered", "type": "party" }],
  "keep": [],
  "ownTitles": []
}
```

Output: UTF-8, two spaces of indent, one line feed at the end. The app always writes all five lists of `intake`, and `alwaysKeep`, `keep` and `ownTitles`, also when they are empty.

### 4.2 The fields

| Field | Rule |
| --- | --- |
| `schema` | Always `"manual-1"` |
| `batch` | Optional text. Files with the same value are one batch. The app leaves the key out when the file is not part of a batch. `""` is a value too |
| `intake.parties[]` | `label`: unique, written in square brackets. `type`: `individual`, `company`, `firm`, `other`. `fullName`: text. `aliases`: list of texts. `idNumber`: text or `null`. `definedTerm`: text or `null`, for reference only. Optional `idLabel`: no control, kept as loaded |
| `intake.addresses[]`, `emails[]`, `phones[]` | `text`, and `party`: the label of a party or `null`. Optional `label`: no control, kept as loaded |
| `intake.others[]` | `type`: one of the 17 values below. `text`. Optional `label`: the label of a role. Optional `of`: the place in this list (first is 0) of the owner of an ID number |
| `alwaysKeep` | Texts that always stay, for example public bodies |
| `redact[]` | `text`: as it stands in the document. `entity`: an id that the user chooses, the same for each form of one person or thing. `expect`: `entered` or `detected`. `type`: optional, one of the 17 values |
| `keep` | Cited case names that must stay. The citation can be part of the text |
| `ownTitles` | The title of the current matter, as it stands in the document |

The 17 values of `type`, with the name that a select shows: `party` Party, `person` Person, `child` Child, `company` Company, `address` Address, `email` Email, `phone` Phone, `nric` NRIC, `passport` Passport, `company-no` Company number (SSM), `id-no` Professional number, `account` Account number, `title` Land title, `case-no` Case number, `dob` Date of birth, `vehicle` Vehicle number, `other` Other. A select shows the name and the value, for example `Land title · title`.

Facts that the hints of the form use:

- `expect` is `entered` for a form of an entry of `intake`, also a short form that the user did not type. It is `detected` for all other texts, for example a witness.
- A `redact` text matches whole words. Case, the kind of space, the kind of quote and the kind of dash do not matter.
- A `redact` text cannot cross a paragraph. An address on several lines is one row for each line, with the same `entity`.
- A text that is not in the document counts as "not found" in `eval`. That count must be 0.
- A defined term (for example "the Purchaser") does not go in `redact`.
- One `entity` must map to one label. A party and its ID number are two entities.

### 4.3 The invented example (the only test data)

```json
{
  "schema": "manual-1",
  "batch": "matter-1",
  "intake": {
    "parties": [
      { "label": "[PARTY A]", "type": "individual", "fullName": "Tan Ah Kow", "aliases": ["Ah Kow"], "idNumber": "850312-10-5521", "definedTerm": "the Plaintiff" },
      { "label": "[PARTY B]", "type": "company", "fullName": "Bayu Lestari Sdn Bhd", "aliases": ["Bayu Lestari"], "idNumber": null, "definedTerm": "the Defendant" }
    ],
    "addresses": [{ "text": "No. 12, Jalan Mawar 3, Taman Bunga Raya, 43000 Kajang, Selangor", "party": "[PARTY A]" }],
    "emails": [],
    "phones": [{ "text": "012-345 6789", "party": "[PARTY A]" }],
    "others": []
  },
  "alwaysKeep": ["Pejabat Tanah"],
  "redact": [
    { "text": "Tan Ah Kow", "entity": "p-tan", "expect": "entered", "type": "party" },
    { "text": "Encik Tan", "entity": "p-tan", "expect": "entered", "type": "party" },
    { "text": "850312-10-5521", "entity": "id-tan", "expect": "entered", "type": "nric" },
    { "text": "Bayu Lestari Sdn Bhd", "entity": "c-bayu", "expect": "entered", "type": "company" },
    { "text": "Rajesh a/l Muniandy", "entity": "w-rajesh", "expect": "detected", "type": "person" }
  ],
  "keep": ["Lim Ah Chai v Bank Bumi Bhd [2015] 3 MLJ 101"],
  "ownTitles": ["Tan Ah Kow v Bayu Lestari Sdn Bhd"]
}
```

### 4.4 Checks before a save

A label is compared in this form: trim, remove one `[` at the start and one `]` at the end, trim, lower case, each run of spaces as one space. The app writes a label as `[` + inner text + `]`.

**Errors (Save is not available):**

1. A party label is empty, has `[` or `]` inside it, or is the label of another party.
2. An address, email or phone names a party that is not in `parties`. (Only a loaded file can have this.)
3. An entry of `others` has an `of`, and one of these is true: its type is not `nric`, `passport`, `company-no` or `id-no`; the owner is the entry itself or is not in the list; the type of the owner is not `party`, `person`, `child` or `company`; the owner has an `of` itself.
4. A label of an entry of `others` is empty or has a bracket inside it, or is the label of a party. Two entries of `others` share a label, and they do not have the same type (`party` counts as `person`) or one of them has an `of`.
5. A `redact` row has an empty `text` or an empty `entity`.
6. The folder or the name of the save target is empty, or the folder does not exist.

**Warnings (Save is available):**

- `batch` is on and its value is empty.
- Two `redact` rows have the same text (compared without case, kind of space, quote and dash).
- A `redact` text is the `definedTerm` of a party.
- No `<name>.docx` is in the target folder. `eval` does not score such a file.
- A party has no `fullName`.
- `Add rows from intake` (section 5) gives the same entity id to two rows of `intake` that are not one person or thing (for example a party and the ID number of another party; a row with a label error does not count, nor does a row that takes its entity id from it; a row with an empty text counts too, because the ids depend on the intake only), or a label gives an empty slug.

### 4.5 A loaded file

`parse.ts` accepts JSON only when `schema` is `"manual-1"`, `intake` is an object with its five lists, and `redact` is a list. All other input gives one message: "This file is not a `manual-1` ground-truth file." A missing `alwaysKeep`, `keep` or `ownTitles` loads as an empty list. A value outside the permitted values loads as it is and shows as an error on its row.

## 5. The model (`src/shared/`)

- `schema.ts`: the permitted values of section 4.2 as constants, with the names for the selects, and the sets of ID types and name types.
- `model.ts`: the state of the form. Each row has a stable `id`. An address, email or phone holds the `id` of its party, not the label. An entry of `others` holds the `id` of its owner, not a place number. So a rename, a delete or a new order needs no repair of the links.
- `serialise.ts`: state to JSON text, in the key order of 4.1. It writes labels and place numbers from the `id` links. Empty `idNumber` and `definedTerm` become `null`. `type` of a `redact` row is left out when it is "none". `batch` is left out when the switch is off.
- `parse.ts`: JSON text to state (section 4.5). Round trip: `serialise(parse(x))` equals `x` for a file that the app wrote.
- `validate.ts`: section 4.4, as a pure function. A problem names the section, the row `id` and a code.
- `fill.ts`: `Add rows from intake` (below).
- `target.ts`: the save target. The name field holds a stem. A typed ending `.truth.json`, `.docx` or `.json` is removed. The target is `<folder>/<stem>.truth.json`.

**`Add rows from intake`.** The slug of a label is its inner text in lower case, with each run of other characters than letters and digits as one `-`, and with no `-` at the start or at the end: `[PARTY A]` gives `party-a`. All new rows have `expect: "entered"`. A text is skipped when it is empty or when a `redact` row has it already (compared as in 4.4). New rows go to the end of the list. The app then says how many rows it added and how many it skipped.

| Source | `entity` | `type` |
| --- | --- | --- |
| `fullName` and each alias of a party | the slug of the party | `company` for `company` and `firm`, else `party` |
| `idNumber` of a party | slug + `-id` | `nric` for `individual`, `company-no` for `company` and `firm`, none for `other` |
| An address, one row for each line that is not empty | linked: slug + `-address`, then `-address-2`, …; not linked: `address-1`, … | `address` |
| An email, a phone | as for an address, with `-email` or `-phone` | `email`, `phone` |
| An entry of `others` with no owner | the slug of its label, or its type + `-` + its number among the entries of that type | its type (`party` gives `person`) |
| An entry of `others` with an owner | the entity of the owner + `-` + its type | its type |

The ids depend on the intake only. So two files of one matter with the same intake get the same ids. A label with an empty slug (no letter and no digit) gives an empty entity for each row that comes from it.

## 6. The main process and the bridge

Window: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. Content policy `default-src 'self'`. The session cancels each request that is not for the app's own files (and the Vite dev server in `start`). No inline style. In `start` only, the policy also permits inline code and inline style, and the socket of the Vite dev server.

The preload gives the renderer these functions only:

| Function | What it does |
| --- | --- |
| `pickFolder()` | The Mac folder dialog. Returns the path or `null` |
| `pickWordFile()` | The Mac file dialog, filter `.docx`. Returns `{ folder, stem }` from the path. It does not open the file |
| `openTruth()` | The Mac file dialog, filter `.json`. Returns `{ folder, stem, file, sameFile, json }`. `file` is the name of the picked file, for the top bar. `sameFile` is true only when the picked file is the file that a Save of this folder and stem writes |
| `targetState(folder, stem)` | Returns `{ folderExists, truthExists, wordFileExists }` |
| `saveTruth(folder, stem, json, replace)` | Writes `<stem>.truth.json.tmp` in the folder, then renames it. Refuses when the file exists and `replace` is false |
| `setDirty(dirty)` | The main process asks before the window closes with unsaved changes |

macOS keeps the last folder of a file dialog in the preferences of the app. The app removes that entry at the start, after each file dialog closes and before the app quits. The next dialog starts in the folder of the last pick, which the app holds in memory only.

Menu: File with New (Cmd+N), Open… (Cmd+O), New from a file of the same matter… (Shift+Cmd+N), Save (Cmd+S); the standard Edit and Window menus.

## 7. The window

One window, 1100 × 800, at least 760 × 560. One page that scrolls, in the dark chrome of the reference app. The reference images named in the session prompt show the look.

**Tokens** (`tailwind.preset.js`, loaded with `@config` in `style.css`):

- Colours: `chrome` #1B1E24; `panel` #242830, `panel-2` #2E333C; `field` #15181D; `line` #343A45, `line-strong` #3F4652; `ink` #E8EAEE, `ink-muted` #A3ABB8, `ink-faint` #6B7482; `accent` #6D9BF5, `accent-hover` #8FB3FF, `accent-text` #8FB3FF, `accent-ink` #1B1E24; `danger` #E2574A, `danger-soft` #2A1F1E, `danger-line` #5A2E29, `danger-text` #F5A69D; `warn-soft` #3F3214, `warn-line` #5A4A1E, `warn-text` #F2C565; `ok-soft` #1F3D2C, `ok-line` #2E6B45, `ok-text` #8FD3A6; `info-soft` #1E2A40, `info-line` #2B4070, `info-text` #B5CDFF.
- Fonts: `sans` Manrope Variable; `mono` JetBrains Mono Variable. Both come from the fontsource packages, bundled.
- Sizes: `h1` 18px/800, `h2` 15px/700, `body` 14px, `sm` 13px, `xs` 12px, `overline` 11px/700 with 0.06em spacing.
- Radius: `chip` 4px, `control` 6px, `button` 8px, `card` 12px, `dialog` 14px. Shadow on dialogs only: `0 20px 50px rgba(0,0,0,0.45)`.

**Components** (`components/ui.tsx`, written new, small):

- Field: `rounded-control border border-line-strong bg-field px-2.5 py-2 text-ink`, focus `border-accent ring-2 ring-accent/35`. Error: `border-danger` and a line of `text-danger-text` under it.
- Button, 44px tall, 32px in a table row. Primary `bg-accent text-accent-ink font-bold hover:bg-accent-hover`. Secondary `border border-line-strong bg-panel hover:bg-panel-2`. Ghost `text-ink-muted hover:bg-panel-2`. Danger outline `border-danger-line text-danger-text hover:bg-danger-soft`.
- Card `rounded-card border border-line bg-panel`, title in `h2`, a count beside the title.
- Also: Select, ChipInput (for `aliases` and `alwaysKeep`), a row remove button (`×` with a spoken name), Banner (info, warning, blocking, success), Dialog, Toast.
- Labels and ids are in `font-mono text-accent-text`. A focus ring is visible on each control.

**The page, top to bottom:**

1. **Top bar.** The name `Benar`, the state of the file (`New file`, or the name, with a dot when it has unsaved changes), buttons `New`, `Open…`, `New from same matter…`.
2. **File.** Folder field with `Browse…`. Name field. `Take from a Word file…`. Under them, the full path of the file that Save writes. A switch `Part of a batch` with the `batch` field.
3. **Parties.** One card for each party: label, type, full name, short forms (chips), ID number, defined term, `Remove`. `+ Add party` gives the next free label (`[PARTY A]`, `[PARTY B]`, …). When a party goes, its addresses, emails and phones change to `No party`.
4. **Addresses, Emails, Phones.** Three lists of rows: text (a text area for an address) and `Linked to` (a select of the party labels and `No party`). `+ Add` and `×` on each list.
5. **Other people and identifiers.** Rows: type (17 values), text, optional role label, and for an ID type the select `Belongs to` (the entries that can be an owner, and `No owner`). `+ Add`, `×`.
6. **Always keep.** A chip input.
7. **Redact.** `Add rows from intake`, with the hint: "Delete each row whose text is not in this document. `eval` counts it as not found." A table: text, entity (a field with a list of the ids in use), expect, type, `+ form` (a new row below with the same entity, expect and type), `×`. `+ Add row` adds an empty row with `detected`. A paste of several lines into a text field makes one row for each line. Under the table: the count of rows and of entities.
8. **Keep** and **Own titles.** Two lists of one-line rows with `+ Add` and `×`.
9. **JSON.** A closed panel `Show the JSON` with the output text, read-only, in mono.
10. **Footer, always in the window.** At the left: the counts of errors and warnings; a click goes to the first one. At the right: `Save` (primary).

**Flows:**

- **Save** writes the target. When the file exists and the form did not open it, a dialog asks before the app replaces it. After a save, a toast names the file and offers `Start the next file of this matter`.
- **Next file of this matter** and **New from same matter…** keep `batch`, `intake`, `alwaysKeep` and the folder. They clear the name, `redact`, `keep` and `ownTitles`. The entity ids of the source stay in the list of the entity field, in memory only.
- **New**, **Open…** and a close of the window ask first when the form has unsaved changes.

## 8. Phases

Each phase ends with `pnpm verify`, a tick in this file and one commit (`Phase n: …`). No push before phase 6.

- [x] **Phase 0, scaffold.** `git init` on `main`. `package.json`, the pnpm settings, TypeScript, Forge with the Vite plugin, the tokens, the fonts, `style.css`, the secure window with the top bar only, `.gitignore`, `CLAUDE.md` (section 2 and the commands), a short `README.md`. `pnpm start` shows the window.
- [x] **Phase 1, the format.** Tests first, then `schema.ts`, `model.ts`, `serialise.ts`, `parse.ts`, `validate.ts`, `fill.ts`, `target.ts`. Tests: the example of 4.3 goes through parse and serialise with no change; the key order of 4.1; each error and warning of 4.4; each refused shape of 4.5; each row of the fill table; a second fill adds nothing; `of` stays correct after a delete and a new order.
- [x] **Phase 2, the bridge.** `files.ts`, `preload.ts`, `menu.ts`, the request block, the close question. Tests for `files.ts` on a temporary folder: a save, a refused replace, a replace, no `.tmp` file left, `targetState`.
- [x] **Phase 3, the intake part of the form.** `ui.tsx`, `state.ts` (a reducer on the model), and sections 1 to 6 of the page.
- [x] **Phase 4, the truth part of the form.** Sections 7 to 10: the Redact table, the fill button, Keep, Own titles, the JSON panel, the footer with the checks.
- [x] **Phase 5, the flows and the app.** New, Open, New from same matter, Save, the replace dialog, the toast, the unsaved-changes questions. Then `pnpm package` and `scripts/install-app.mjs`, which copies `out/Benar-darwin-arm64/Benar.app` to `/Applications/Benar.app`. If the app does not open, sign it ad hoc: `codesign --force --deep --sign - <app>`. Complete `README.md`: purpose, the rules of section 2, start, build, install.
- [x] **Phase 6, publish.** Do the checks of section 9. Then `gh repo create harithkhan/benar --public --source=. --remote=origin --push`. Confirm that `main` is on GitHub and that the working tree is clean.

## 9. Verification

1. `pnpm verify` passes.
2. In the running app, with the invented data of 4.3 only: type the example, click `Add rows from intake`, save to a scratch folder. The saved file parses, has the key order of 4.1 and has the ids of the fill table.
3. Open that file again: the form shows the same values. Save again: the file does not change.
4. Make each error of 4.4 one time: Save is not available and the footer goes to the row.
5. Take a screenshot of the window and compare it with the two reference images: colours, type, fields, buttons, cards.
6. Open `/Applications/Benar.app` from Spotlight. Disconnect nothing; confirm in the code that no request leaves the app.
7. Before the push: `git ls-files` shows no `.truth.json` and no `.docx` file, and a search of the tracked files for the private name of the session prompt finds nothing.
8. For the owner, after the push: write one real file with Benar and run `eval` on that pair. `files that failed` and `ground-truth texts not found` are 0.

## 10. Not in this build

A read of the Word document, a check that a text is in the document, a run of `eval`, an app icon, a signed or notarised app, Windows, autosave, undo of a delete, ESLint, a licence file.
