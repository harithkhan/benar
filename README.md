# Benar

Benar is a Mac desktop app. It makes and edits ground-truth files of the `manual-1` format: one `<name>.truth.json` beside one `<name>.docx`. You fill a form. The app writes valid JSON with the correct keys and values.

The form has these parts: the save target, the parties, their addresses, emails and phones, other people and identifiers, the texts that always stay, the `redact` list, the cited case names, and the titles of the matter. `Add rows from intake` makes the `redact` rows of the intake, with entity ids that depend on the intake only. The footer shows the errors and the warnings. Save is available when the form has no error.

`docs/PLAN.md` holds the full description of the format, the checks and the window.

## Rules

- **No real data.** The files that this tool writes hold real client names. No real name, path or file goes into this repository, a test, a screenshot or a commit message. The tests use one invented example only.
- **No network.** The app makes no request. It has no telemetry and no update check. The session cancels each request that is not for the app's own files, and the content policy is `default-src 'self'`.
- **No text in logs.** A log line or an error message names the kind of problem only, never text of the form.
- **Disk writes.** The app writes one file only: the one that you save. It keeps no draft, no recent-files list and no app data with form text. The session of the window is in memory only. macOS keeps the last folder of a file dialog in the preferences of the app. The app removes that entry after each file dialog closes and before the app quits.
- **Path only for Word files.** The app never opens a Word document. It reads the path and checks that the file exists.
- **Private source.** The format comes from a private app. No file of this repository names that app.
- `.gitignore` holds `*.truth.json`, `*.docx`, `node_modules/`, `out/` and `.vite/`.
- Tests first for `src/shared/`. Never weaken a test to make it pass.

## Requirements

- macOS on Apple silicon
- Node 22.13.0 or later
- pnpm

## Start

```
pnpm install
pnpm start
```

`pnpm start` runs the app with the Vite dev server. Electron downloads its binary on the first run.

## Check

```
pnpm verify
```

`pnpm verify` runs the type check (`pnpm typecheck`), then the tests (`pnpm test`).

## Build

```
pnpm package
```

The app is then at `out/Benar-darwin-arm64/Benar.app`. It is not signed with a developer identity and it is not notarised.

## Install

```
pnpm install:app
```

This command copies the built app to `/Applications/Benar.app`. If the app does not open, sign it ad hoc:

```
codesign --force --deep --sign - /Applications/Benar.app
```

## Use

1. Select the folder and type the name. `Take from a Word file…` takes the two from the path of a Word file.
2. Add the parties and the other entries of the intake.
3. Click `Add rows from intake`. Delete each row whose text is not in the document.
4. Add the texts that the intake does not have, for example a witness, with `expect` set to `detected`.
5. Click `Save`. For the next document of the same matter, click `Start the next file of this matter`.

## Layout

| Path | Contents |
| --- | --- |
| `src/shared/` | The format, as pure functions: model, serialise, parse, validate, fill, target |
| `src/main/` | The main process: the window, the file access, the menu |
| `src/preload/` | The bridge: the six functions that the form can call |
| `src/renderer/` | The form (React, with the tokens of `tailwind.preset.js`) |
| `test/` | The tests (Vitest) |
