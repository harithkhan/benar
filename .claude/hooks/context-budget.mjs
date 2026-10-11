// PostToolUse hook for every tool.
//
// The working method in CLAUDE.md: one job for each session, and a handover
// at about 400,000 tokens of context. A session cannot see the size of its
// own context, so this hook reads the token count of the last request from
// the session log and tells the session. It gives one note at 400,000 tokens
// and one at each further 150,000.
//
// It is advice only. It never blocks a tool call: every path ends with exit
// code 0, and a fault gives no output. The note holds a count and no text of
// the session (the rule "No text in logs").
//
// A tool call inside a subagent has `agent_id` in its payload. The hook then
// reads the log of that subagent, `<session log without .jsonl>/subagents/
// agent-<agent_id>.jsonl`, and tells the subagent to report and stop. That
// place is what Claude Code writes today; it is not in its documentation.
// With no such file the hook is silent.
//
// What it cannot see: the request that is in progress (the log can be one
// step behind), a count that is more than TAIL_BYTES before the end of the
// log, and a model whose context window is smaller than LIMIT. A tool call
// of a subagent with no `agent_id` in its payload is read as a call of the
// session: the note of that band then goes to the subagent, and the session
// gets none for the band. `agent_type` alone does not show a subagent,
// because a session that was started as an agent has it too.
import { Buffer } from 'node:buffer';
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const LIMIT = 400_000;
const STEP = 150_000;
const MAX_BAND = 8;
// A count that falls by less than this below the edge of a band keeps the
// mark of the band: the count moves a little down and up at each request.
const SLACK = 50_000;
// A session log can be 60 MB, and one tool result in it 500 KB. The count is
// near the end, so the hook reads from the end in pieces and stops at it.
const TAIL_BYTES = 4 * 1024 * 1024;
const PIECE_BYTES = 64 * 1024;
const NEWLINE = 0x0a;
const OLD_MARK_MS = 14 * 24 * 60 * 60 * 1000;
const PLAIN_NAME = /^[A-Za-z0-9_-]{1,128}$/;

/** 0 below the limit, 1 from the limit, and one more for each further step. */
function bandOf(count) {
  if (count < LIMIT) return 0;
  return Math.min(MAX_BAND, 1 + Math.floor((count - LIMIT) / STEP));
}

const tokens = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** The context of one request of the model, in tokens; 0 for any other line of a log. */
function countOf(line, ofSubagent) {
  if (!line.includes('"usage"')) return 0;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return 0;
  }
  if (entry?.type !== 'assistant') return 0;
  // A request of a subagent says nothing about the context of the session.
  if (!ofSubagent && entry.isSidechain === true) return 0;
  const usage = entry.message?.usage;
  if (typeof usage !== 'object' || usage === null) return 0;
  // A message that the app made itself has a count of 0.
  return (
    tokens(usage.input_tokens) +
    tokens(usage.cache_read_input_tokens) +
    tokens(usage.cache_creation_input_tokens)
  );
}

/**
 * The context of the last request in a log, in tokens; 0 when the last
 * TAIL_BYTES of the log show none. Reads whole lines from the end.
 */
function lastCount(file, ofSubagent) {
  const handle = openSync(file, 'r');
  try {
    const { size } = fstatSync(handle);
    const floor = Math.max(0, size - TAIL_BYTES);
    let position = size;
    // The end of a line whose start is not read yet.
    let rest = Buffer.alloc(0);
    while (position > floor) {
      const length = Math.min(PIECE_BYTES, position - floor);
      position -= length;
      const piece = Buffer.alloc(length);
      let done = 0;
      while (done < length) {
        const read = readSync(handle, piece, done, length - done, position + done);
        if (read === 0) break;
        done += read;
      }
      const data = Buffer.concat([piece.subarray(0, done), rest]);
      // The text before the first line break is a whole line only at the
      // start of the file.
      const first = position === 0 ? -1 : data.indexOf(NEWLINE);
      if (position !== 0 && first === -1) {
        rest = data;
        continue;
      }
      rest = data.subarray(0, first + 1);
      const lines = data.toString('utf8', first + 1).split('\n');
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const count = countOf(lines[index], ofSubagent);
        if (count > 0) return count;
      }
    }
    return 0;
  } finally {
    closeSync(handle);
  }
}

/** The log to read: the one of the session, or the one of the subagent that made the tool call. */
function logOf(payload) {
  const transcript = payload.transcript_path;
  if (typeof transcript !== 'string' || transcript === '') return undefined;
  const agent = payload.agent_id;
  if (agent === undefined || agent === null) return { file: transcript, agent: undefined };
  if (typeof agent !== 'string' || !PLAIN_NAME.test(agent)) return undefined;
  const name = `agent-${agent}.jsonl`;
  if (path.basename(transcript) === name) return { file: transcript, agent };
  return {
    file: path.join(transcript.replace(/\.jsonl$/, ''), 'subagents', name),
    agent,
  };
}

/** Removes the marks of sessions that ended long ago. A fault here changes nothing. */
function sweep(folder) {
  try {
    const limit = Date.now() - OLD_MARK_MS;
    for (const name of readdirSync(folder)) {
      const file = path.join(folder, name);
      if (statSync(file).mtimeMs < limit) rmSync(file, { force: true });
    }
  } catch {
    // The marks are small; the next note tries again.
  }
}

/**
 * True one time for each band of a session or a subagent. A file that only
 * one process can make is the mark, so that two tool calls at the same time
 * give one note. A note for a band also marks the bands below it. A count
 * that falls well below a band removes the mark of that band: after a
 * compaction the notes start again.
 */
function firstInBand(key, count) {
  const folder = path.join(tmpdir(), 'benar-context-budget');
  const mark = (band) => path.join(folder, `${key}.${String(band)}`);
  const band = bandOf(count);
  if (existsSync(folder)) {
    for (let above = bandOf(count + SLACK) + 1; above <= MAX_BAND; above += 1) {
      rmSync(mark(above), { force: true });
    }
  }
  if (band === 0) return false;
  mkdirSync(folder, { recursive: true });
  try {
    writeFileSync(mark(band), '', { flag: 'wx' });
  } catch {
    return false;
  }
  // The mark of the band is made: a fault from here on must not lose the note.
  try {
    for (let below = 1; below < band; below += 1) writeFileSync(mark(below), '');
  } catch {
    // A lower band can then give one more note after a fall of the count.
  }
  sweep(folder);
  return true;
}

function noteFor(payload) {
  if (typeof payload !== 'object' || payload === null) return undefined;
  if (payload.hook_event_name !== 'PostToolUse') return undefined;
  const log = logOf(payload);
  if (log === undefined) return undefined;

  const count = lastCount(log.file, log.agent !== undefined);
  // No count in reach says nothing about the context: the marks stay.
  if (count === 0) return undefined;
  const session = String(payload.session_id ?? 'session')
    .replaceAll(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 128);
  const key = log.agent === undefined ? session : `${session}.${log.agent}`;
  if (!firstInBand(key, count)) return undefined;

  const size = `${String(Math.round(count / 1000))}K`;
  if (log.agent !== undefined) {
    return (
      `Context budget: this subagent is at about ${size} tokens of context. ` +
      'Finish the edit or the check that you are in. Then report what is done and what is open, and stop. ' +
      'Do not start new work.'
    );
  }
  return (
    `Context budget (CLAUDE.md, "Working method"): this session is at about ${size} tokens of context, ` +
    'and the limit for one session is 400K. At the next step boundary, run /handover. ' +
    'Do not stop in the middle of an edit or of a check.'
  );
}

try {
  let text = '';
  for await (const chunk of process.stdin.setEncoding('utf8')) text += chunk;
  const note = noteFor(JSON.parse(text));
  if (note !== undefined) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: note },
      }),
    );
  }
} catch {
  // Advice only: a fault of this hook must not show in the session.
}
process.exitCode = 0;
