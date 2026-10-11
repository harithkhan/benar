---
name: ui-change
description: Change or add something that a user sees in the Benar form (a section, a flow, a dialog, the words on a control). Runs a design round with the project `ui-*` agents before the build and a review round with personas after it. Use it for every change in `src/renderer/`, also when the owner does not type the command.
argument-hint: "<what to change, and in which section> | continue <name of the plan file>"
---

The change: **$ARGUMENTS** (with no argument: the request of the owner in this conversation). `CLAUDE.md` holds the rules; they apply to every step.

## The standing brief of the owner

This applies to every UI change, as if the owner typed it:

> I leave it to your judgment how best to implement this. The UI and the UX must be pretty, look professionally designed and be intuitive to use. Use the design agents to help you. Spin off personas to review the work, and use their judgments to improve the page and its flow. You may reorganise the whole page on their comments. Get them to review the flow of the entire page.

## The agents

Use the project agents. Their files set the model and the effort (Opus, high), so pass no `model`.

| Agent | When | What it returns |
|---|---|---|
| `ui-architect` | before the build | the order of the page, the states, the words, the decisions |
| `ui-designer` | before the build | hierarchy, layout and states in the keys of the preset |
| `ui-persona` | before and after | where one user stops, misreads or makes a wrong file (one agent for each persona) |
| `ui-finish-gate` | after the build | PASS or HOLD, with the changes that it requires |
| `ui-a11y` | after the build | measured WCAG findings from the live preview |

Do not use the generic agents with similar names (`UX Architect`, `UI Designer`, `Persona Walkthrough Specialist`, `UI Finish-Gate Reviewer`, `Accessibility Auditor`): they are written for web sites.

**A small change** (one sentence describes the diff, nothing moves, no new control): skip step 4, and in step 8 run `ui-finish-gate` only.

## Steps

1. **Start checks.**
   - If the argument is `continue <name>`, the change is the one in `docs/plans/<name>.md`: read that file and continue from the next step of its progress log. Do not start a new design round.
   - Run `git status --short` and `git branch --show-current`. When the owner asks for a branch, or the tree holds changes of other work, work in a sibling worktree (`git worktree add ../benar-<branch-with-dashes> <branch>`, then `pnpm install --frozen-lockfile --prefer-offline` there). Never run `git stash`, `git checkout -- .` or `git clean` in a shared folder.
2. **Read the design.** `docs/PLAN.md` section 7 (the tokens, the components, the page from top to bottom, the flows), `tailwind.preset.js`, and `src/renderer/components/ui.tsx`.
3. **Screenshots of the current window.** Make them with the preview of the section "The preview" below. One script, named states, the sizes 1100 by 800 and 760 by 560. Reach a control with real key presses before a shot that must show its focus ring. The form holds the invented example of `docs/PLAN.md` section 4.3 only. The scripts and the screenshots stay in the scratchpad: no screenshot goes into the repository.
4. **Design round, before any code.** In one message, in parallel: `ui-architect`, `ui-designer`, and one `ui-persona` on the current window (the labeller for work that is done for each document, the helper for a question of words or of trust). Each brief has the request in the words of the owner, the screenshot paths with state and size, the sections of `docs/PLAN.md` and the folder. Where the agents disagree, the need of the persona decides, and the point is a decision of step 5.
5. **Decisions and plan.**
   - With the owner present: ask the decisions that are the owner's with `AskUserQuestion` (four at most), then go to plan mode. The plan lists the design decisions as the things to approve.
   - In a run with no owner: decide, and list the decisions in the report so that the owner can disagree.
   - Write the plan to `docs/plans/<name>.md` when it has more than three build steps. A smaller change gets that file only if `/handover` runs; `/handover` makes it.
6. **Tests first, then build.** A change of `src/renderer/state.ts`, of `src/renderer/messages.ts` or of `src/shared/` gets its test first. The project has no DOM test runtime, so a component has no unit test: the preview and the agents check it. The main session writes the code; `builder` agents are not for a UI change. Use the keys of the preset, and an existing component of `ui.tsx` before a new one. No inline style: the content policy refuses it.
7. **Verify.** `pnpm verify`. Then `pnpm package`, when the review uses the packaged app.
8. **Review round on the new window.** New screenshots of every state, and the live preview. In one message, in parallel: two `ui-persona` (the labeller, the helper), `ui-finish-gate` (with the decisions of step 5 and the list of the changed files), and `ui-a11y` (the debugging port, one example script, a scratch folder of its own). Leave the preview up, and tell `ui-a11y` through `SendMessage` when a source file changes under it.
9. **Fix and re-check.** Fix every `must-fix`, every line of "Required before PASS", and every `critical` and `serious` finding. Then one re-check of the fixes by the same agents through `SendMessage`, not by new agents. If the re-check gives a new must-fix, fix it and re-check one more time. Then stop: sort what is left into the groups of step 12.
10. **Code review.** `/code-review high` before the commit. When the diff touches a high-risk path (`src/main/`, `src/preload/`, the `src/shared/` files in `CLAUDE.md`), run the `reviewer` loop; start it when that part is stable, not at the end.
11. **Record.** Change `docs/PLAN.md` section 7 so that it describes the window as it now is: the page from top to bottom, the flows, a new component or token. Change `README.md` when the use of the app changed.
12. **Report.** What changed, and which finding of which agent caused it. The result of `pnpm verify`. Each open item in one group: A (blocks, with proof), B (another change owns it), C (one line in `docs/backlog.md`), D (a manual check for the owner: a Mac file dialog, the installed app). Commit only when the owner asked, through the `tasks` agent.

## The preview

The project has no DOM test runtime, and `pnpm start` needs a person at the window. Two previews work from a shell.

- **The packaged app.** `pnpm package`, then start `out/Benar-darwin-arm64/Benar.app/Contents/MacOS/Benar --remote-debugging-port=9333` as a background process. First check with `pgrep -x Benar` that the owner has no Benar open, and stop only your own process. Read `http://127.0.0.1:9333/json/list`, connect to `webSocketDebuggerUrl` with the global `WebSocket` of Node 22, and use the DevTools protocol. `window.benar.*` goes through the real bridge; call `saveTruth` on a scratch folder only. A File menu command arrives in the page as an event on `window`: `benar-menu-new`, `benar-menu-open`, `benar-menu-new-from-matter`, `benar-menu-save`.
- **The page alone**, for a fast look: a scratch Vite config outside the repository (root `src/renderer`, the React and Tailwind plugins, a virtual module that sets a stub `window.benar`), served to the built-in browser. The stub `setDirty` returns nothing.

Traps:

- Call `Emulation.setFocusEmulationEnabled` first, or focus and blur events do not fire.
- A Mac file dialog (`pickFolder`, `pickWordFile`, `openTruth`) cannot be operated through the port. It is a group D check.
- The unsaved-changes question holds a quit signal when the form is dirty. End your own process with `kill -KILL` then.
- The packaged app does not reload on a source change. Package again before the re-check of step 9.

## Keep the context small

- The agents read the screenshots. Read one yourself only to confirm that a script works.
- A search across many files goes to an `Explore` agent; you need its conclusion, not the output.
- On a note of the context-budget hook, run `/handover` at the next boundary: after step 5, after step 7 or after step 9.
