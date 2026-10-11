---
name: feature
description: Build one planned change to Benar, for example `/feature word-check`. Reads the parts of `docs/PLAN.md` that the change touches, then plans, writes tests first, implements, verifies and reviews. For a change of more than one file that is not only a change of the form.
argument-hint: <a short name for the change, for example word-check>
disable-model-invocation: true
---

Build the change **$ARGUMENTS** (the owner describes it in this conversation). `CLAUDE.md` holds the rules; they apply to every step.

1. **Scope.** Read the sections of `docs/PLAN.md` that the change touches: 4 for the format and the checks, 5 for the model, 6 for the main process and the bridge, 7 for the window. If the change is in section 10 ("Not in this build"), say so and ask the owner before you plan. If the change breaks a rule of `CLAUDE.md` (a network request, a second disk write, a read of a Word document), say so and stop.
2. **Earlier work.** If `docs/plans/$ARGUMENTS.md` exists, a previous session started this change. Read it and continue from its progress log.
3. **Decisions.** List each choice that is the owner's: a new key or value of the format, a new function on the bridge, a new dependency, a new check or a changed one. Ask the owner to decide each one before you plan.
4. **Plan.** In plan mode, write the plan as numbered build steps. Each step names its files (follow the layout in `CLAUDE.md`), the section of `docs/PLAN.md` that it builds, its tests and "done when". A step is small enough for one fresh agent: one module of `src/shared/`, the main process, or one section of the form. Mark a step that is mechanical. Say what is out of scope. Wait for approval. After approval, write the plan to `docs/plans/$ARGUMENTS.md` before step 5.
5. **Tests first.** Write the tests, with the number of the `docs/PLAN.md` section in the name of the test or of its `describe`. Test data is the invented example of section 4.3 (`test/example.ts`) only. Run them and confirm that each fails for the right reason. In a plan of more than three steps, each `builder` does this for its own step.
6. **Implement** until `pnpm verify` passes.
   - **A plan of up to three steps:** the main session builds it.
   - **A larger plan:** the main session orchestrates and does not write the product code. For each step, in order and one at a time, spawn a fresh `builder` agent with the path of the plan file, the step number and the folder to work in. Pass `model: sonnet` only for a step that the plan marks as mechanical. When the builder reports: read `git diff --stat`, run `pnpm verify`, add one dated line for the step to the progress log, and run the `reviewer` loop now if the step touched a high-risk path. Do not read the files that the builder changed. If `pnpm verify` fails, give the failing lines to the same builder through `SendMessage`. After two tries with no pass, stop the step and ask the owner; in a run with no owner, fix it in the main session and say so in the report.
   - **A step that builds or changes a part of the form** is not for a builder. The main session does that step itself with `/ui-change` (its steps 2 to 11), in the place of the step in the order of the plan.
7. **Review.** Run `/code-review` on the diff. If the diff touches a high-risk path (see `CLAUDE.md`), also run the `reviewer` agent loop.
8. **Record.** Change `docs/PLAN.md` so that it describes the app as it now is: the format, the checks, the bridge, the window. Change `README.md` when the use of the app changed.
9. **Report.** For each step of the plan, state: done, partly done or not started, and name the test that proves it. Then sort every open item into one group. Do not give an unsorted list of open items.
   - **A. Blocks the change.** A test of the plan fails, or the new code breaks a rule of `CLAUDE.md` or writes a wrong file. Each item needs a failing test on the invented example, or the exact input and the wrong result. An item without that proof is group C.
   - **B. Another change owns it.** Name the change, or the line of `docs/PLAN.md` section 10 that holds it.
   - **C. Hardening that the plan does not ask for.** Add one line to `docs/backlog.md` (make the file when it is not there). Do not fix it in this change.
   - **D. Manual check for the owner:** a Mac file dialog, the installed app, one real file with a run of `eval` (`docs/PLAN.md` section 9, item 8). The owner decides whether it blocks.

   If the change is not finished, run `/handover $ARGUMENTS`: it brings the decisions and the dated progress log in `docs/plans/$ARGUMENTS.md` up to date so that the next session can continue.

**Context.** On a note of the context-budget hook, run `/handover $ARGUMENTS` at the next step boundary. With the owner present, the session then waits for a `/clear`; the next session starts with `/feature $ARGUMENTS` and continues from the progress log (step 2).

**Fix rounds.** A fix round fixes only the group A items that the owner names, test first, and adds no scope. Review only the diff of that round, not the whole change. Sort new findings into A to D; do not fix them in the same round. Record each round in the progress log in `docs/plans/$ARGUMENTS.md` with its date and number. The count carries across sessions. After round 3, stop: show the owner what is still in group A and let the owner decide.

The change is done when every step is done and group A is empty. Groups B, C and D do not block it, unless the owner says that a group D check does. The plan file leaves the repository in the commit that closes the change: by then `docs/PLAN.md` holds its decisions. Commit only if the owner asks, through the `tasks` agent.
