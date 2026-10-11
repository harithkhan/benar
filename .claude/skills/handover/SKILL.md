---
name: handover
description: Write the state of the current work to `docs/plans/<id>.md`, so that a new session can continue it with a small context. Run it when the context-budget hook gives its note, before a `/clear` in the middle of a job, or when the owner asks for a handover.
argument-hint: "[id of the plan file, for example word-check]"
---

Write a handover for the work of this session. A session that knows nothing of this conversation must be able to continue from the file alone.

1. **Find the file.** The ID is `$ARGUMENTS`. With no argument it is the name of the `/feature` or `/ui-change` of this session, or else the branch name without its prefix (`feat/word-check` gives `word-check`). The file is `docs/plans/<id>.md` in the folder where the work is (the worktree, not always the launch folder).
2. **If the file does not exist, make it** with these headings: `# <id> <title>`, `## Context`, `## Decisions of the owner (<date>)`, `## Files`, `## Tests first`, `## Out of scope`, `## Verification`, `## Changes to the plan during the build`, `## Progress log`. Put the approved plan in as it was approved: copy it from the plan file of plan mode when there is one. Do not write it again from memory.
3. **Add one entry to the progress log**, `### <date>, session <n>`, with:
   - **Done:** each step that is done, and the test that proves it.
   - **The tree:** the folder, the branch, the last commit, the files that are changed and not committed, the result of `git rev-list --left-right --count main...HEAD`, and the result of the last `pnpm verify`.
   - **Rounds used:** the `reviewer` round (of three), the fix round, the re-checks of the design agents.
   - **Agents that still run:** a new session cannot reach them. Say what must run again. Name a preview process that still runs, with its port.
   - **Decisions since the last entry**, each with who made it (the owner or the session).
   - **What the next session must know:** a trap or a command that cost time, in five lines at most.
4. **Replace the last section, `### What is open`:** the exact next step (the file, the function, the test that must pass next), then each open item in one group: A (blocks, with proof), B (another change owns it), C (one line in `docs/backlog.md`), D (a manual check for the owner).
5. **Rules.** Dates in full (`2026-10-11`). No text of a form, no real name and no real path: the repository is public. Keep the entry short: the code and the tests say the rest.
6. **Then:**
   - With the owner present: end the turn. Say where the handover is, ask the owner to run `/clear`, and give the command that continues: `/feature <id>` for a planned change, `/ui-change continue <id>` for a UI change, or "continue `docs/plans/<id>.md`" for other work. If the owner says "continue", go on in this session.
   - In a run with no owner, when the note of the context-budget hook caused this handover: go on with the work.
   - A handover changes no stop rule. When `CLAUDE.md` or the skill that called this one says to stop (fix round 3 is used, a group A item blocks, the change needs the owner), stop after the handover, with or without the owner.

The plan file leaves the repository in the commit that closes the change: by then `docs/PLAN.md` holds its decisions.
