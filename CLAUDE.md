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
- `.claude/`: the agents, the skills and the hook of the working method.

## Working method

- One job per session. Start a planned change with `/feature <name>` and a change of the form with `/ui-change`. Run `/clear` between jobs.
- A session hands over at about 400,000 tokens of context. `.claude/hooks/context-budget.mjs` gives a note at that size. On the note, run `/handover` at the next step boundary: it writes the state to `docs/plans/<id>.md`, and a new session continues from that file.
- Keep bulky output out of the main session. A search across many files goes to an `Explore` agent. Review agents read the screenshots.
- Plan first, in plan mode, when a change touches more than one file. Skip the plan when one sentence describes the diff.
- Write the tests first for `src/shared/`, `src/main/files.ts`, `src/main/policy.ts` and `src/renderer/state.ts`. Put the number of the `docs/PLAN.md` section in the name of the test or of its `describe`.
- UI work: start with `/ui-change`. It runs a design round with the project agents (`ui-architect`, `ui-designer`, `ui-persona`) before the build, and a review round (`ui-persona`, `ui-finish-gate`, `ui-a11y`) after it. Before you build a part of the form, read `docs/PLAN.md` section 7 and compare your result against it.
- The main session writes the code. Use subagents for wide searches and for independent review, not for implementation. One exception: for a change with an approved plan of more than three steps, the main session orchestrates and a fresh `builder` agent builds each step, one at a time (`.claude/skills/feature/SKILL.md`, step 6). A quick change and a `/ui-change` stay in the main session.
- Models: the main session runs on Opus at `high` effort (`xhigh` for a hard plan only). The agent files set the rest: `builder` and the `ui-*` agents on Opus `high`, `reviewer` on Fable `high`, `tasks` on Sonnet. Pass no `model` to them, except `model: sonnet` for a `builder` step that the plan marks as mechanical.
- When the owner asks for a commit, a commit and push, a build and install of the app or another simple mechanical task, give it to the `tasks` agent (Sonnet, medium effort). Use `tasks-high` (Sonnet, high effort) when the task has several dependent steps or more risk. Quote the owner's request in the brief. These agents do not change product code.
- Do not commit or push unless asked.
- After `pnpm verify` passes, run `/code-review` on the diff.
- `docs/PLAN.md` describes the app as it is. A change of the format, the checks, the bridge or the window changes that file in the same commit.
- Never report an unsorted list of open items. Sort each one into group A (blocks the change, with proof), B (another change owns it), C (hardening, goes to `docs/backlog.md`) or D (manual check for the owner). `.claude/skills/feature/SKILL.md` step 9 defines the groups. Only group A blocks a change.
- A fix round fixes only the group A items the owner names. It adds no scope, and its review covers only its own diff. Count the rounds in `docs/plans/<id>.md`; the count carries across sessions. Stop after round 3 and show the owner what is still open.

## High-risk paths

Real data in a public repository, a request that leaves the app, or a wrong file that gives wrong scores with no error: these are the failures that the rules exist to prevent. A change to any of these paths also needs a clean pass from the `reviewer` agent before you report it as done:

- `src/main/` and `src/preload/`: the one disk write, the request block, the content policy, the window settings, the six functions of the bridge
- `src/shared/serialise.ts`, `src/shared/parse.ts`, `src/shared/validate.ts`, `src/shared/fill.ts` and `src/shared/target.ts`: the key order, the round trip, the checks before a save, the entity ids, the save target
- `test/example.ts`: the only test data
- The guards: `.gitignore`, `.claude/hooks/`, `.claude/settings.json`
- `package.json` and `pnpm-workspace.yaml`, when a dependency or a build script changes

The loop: fix every finding in the main session, run `pnpm verify`, then spawn a fresh `reviewer`. Low findings do not start a new round. Stop after 3 rounds and show the owner what is still open.
