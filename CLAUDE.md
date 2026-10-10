# Benar

A Mac desktop app (Electron, React, TypeScript) that makes and edits ground-truth files of the `manual-1` format. `docs/PLAN.md` is the full plan.

## Rules

- **No real data.** The files that this tool writes hold real client names. No real name, path or file goes into the repository, a test, a screenshot or a commit message. Tests use the invented example of section 4.3 of the plan only.
- **No network.** The app makes no request. It has no telemetry and no update check.
- **No text in logs.** A log line or an error message names the kind of problem only, never text of the form.
- **Disk writes.** The app writes one file only: the one that the user saves. No draft, no recent-files list, no app data with form text.
- **Path only for Word files.** The app never opens a Word document. It reads the path and checks that the file exists.
- **Private source.** The format comes from a private app. No file of this repository names that app.
- `.gitignore` holds `*.truth.json`, `*.docx`, `node_modules/`, `out/`, `.vite/`.
- Tests first for `src/shared/`. Never weaken a test to make it pass.

## Commands

- `pnpm install`: install the dependencies.
- `pnpm start`: run the app with the Vite dev server.
- `pnpm typecheck`: check the types.
- `pnpm test`: run the tests.
- `pnpm verify`: typecheck, then test. Run it before each commit.
- `pnpm package`: build `out/Benar-darwin-arm64/Benar.app`.
- `pnpm install:app`: copy the built app to `/Applications/Benar.app`.

## Layout

- `src/shared/`: the format, as pure functions (model, serialise, parse, validate, fill, target).
- `src/main/`: the main process (window, file access, menu).
- `src/preload/`: the bridge that the renderer can call.
- `src/renderer/`: the form (React, Tailwind tokens of `tailwind.preset.js`).
- `test/`: Vitest tests.
