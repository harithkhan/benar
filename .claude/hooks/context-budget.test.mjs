import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

// The working method in CLAUDE.md: a session hands over at about 400,000
// tokens of context. The hook reads the token count of the last request from
// the session log and gives the session one note for each band. Each test
// pipes a PostToolUse payload into the real hook script and reads its stdout
// and its exit code. Every session log here is invented, in the temp folder.

const hook = fileURLToPath(new URL('./context-budget.mjs', import.meta.url));

const root = mkdtempSync(path.join(tmpdir(), 'benar-budget-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const SECRET = 'INVENTED-TEXT-OF-A-SESSION';
let serial = 0;

/** A folder of its own for each test: the session logs, and the temp folder that holds the state of the hook. */
function world() {
  serial += 1;
  const dir = path.join(root, `w${String(serial)}`);
  const logs = path.join(dir, 'logs');
  const temp = path.join(dir, 'temp');
  mkdirSync(logs, { recursive: true });
  mkdirSync(temp, { recursive: true });
  return { logs, temp, session: `session-${String(serial)}` };
}

/** One request of the model with `count` tokens of context. */
function request(count, more = {}) {
  return JSON.stringify({
    type: 'assistant',
    isSidechain: false,
    message: {
      model: 'invented-model',
      content: [{ type: 'text', text: SECRET }],
      usage: {
        input_tokens: 2,
        cache_read_input_tokens: count - 12,
        cache_creation_input_tokens: 10,
        output_tokens: 500,
      },
    },
    ...more,
  });
}

const result = (text) =>
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: text }] } });

function write(file, lines) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, lines.map((line) => `${line}\n`).join(''));
  return file;
}

const mainLog = (w) => path.join(w.logs, `${w.session}.jsonl`);
const agentLog = (w, agent) =>
  path.join(w.logs, w.session, 'subagents', `agent-${agent}.jsonl`);

function pipe(w, input) {
  const run = spawnSync(process.execPath, [hook], {
    input,
    env: { ...process.env, TMPDIR: w.temp, TEMP: w.temp, TMP: w.temp },
    encoding: 'utf8',
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function fire(w, more = {}) {
  return pipe(
    w,
    JSON.stringify({
      session_id: w.session,
      transcript_path: mainLog(w),
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      ...more,
    }),
  );
}

/** The note that the session gets, or `undefined` for a silent hook. */
function note(run) {
  expect(run.status).toBe(0);
  if (run.stdout === '') return undefined;
  const output = JSON.parse(run.stdout);
  expect(output.hookSpecificOutput.hookEventName).toBe('PostToolUse');
  return output.hookSpecificOutput.additionalContext;
}

describe('context budget hook: the main session', () => {
  it('is silent below 400,000 tokens', () => {
    const w = world();
    write(mainLog(w), [request(120_000), request(399_999)]);
    expect(note(fire(w))).toBeUndefined();
  });

  it('gives one note with the count at 400,000 tokens', () => {
    const w = world();
    write(mainLog(w), [request(120_000), request(412_400)]);
    const text = note(fire(w));
    expect(text).toContain('412K');
    expect(text).toContain('/handover');
    expect(text).not.toContain('subagent');
  });

  it('no text in logs: the note holds a count and no text of the session', () => {
    const w = world();
    write(mainLog(w), [result(SECRET), request(412_400), result(SECRET)]);
    const run = fire(w);
    expect(note(run)).toBeDefined();
    expect(run.stdout).not.toContain(SECRET);
    expect(run.stderr).toBe('');
  });

  it('is silent for a second call in the same band', () => {
    const w = world();
    write(mainLog(w), [request(412_400)]);
    expect(note(fire(w))).toBeDefined();
    write(mainLog(w), [request(412_400), request(530_000)]);
    expect(note(fire(w))).toBeUndefined();
  });

  it('gives a note again at each further 150,000 tokens', () => {
    const w = world();
    write(mainLog(w), [request(412_400)]);
    expect(note(fire(w))).toContain('412K');
    write(mainLog(w), [request(550_000)]);
    expect(note(fire(w))).toContain('550K');
    write(mainLog(w), [request(699_999)]);
    expect(note(fire(w))).toBeUndefined();
    write(mainLog(w), [request(910_000)]);
    expect(note(fire(w))).toContain('910K');
  });

  it('starts again after the count falls (a compaction or a new context)', () => {
    const w = world();
    write(mainLog(w), [request(470_000)]);
    expect(note(fire(w))).toBeDefined();
    write(mainLog(w), [request(470_000), request(80_000)]);
    expect(note(fire(w))).toBeUndefined();
    write(mainLog(w), [request(470_000), request(80_000), request(405_000)]);
    expect(note(fire(w))).toContain('405K');
  });

  it('gives no second note for a small fall across the edge of a band', () => {
    const w = world();
    write(mainLog(w), [request(552_000)]);
    expect(note(fire(w))).toContain('552K');
    write(mainLog(w), [request(547_000)]);
    expect(note(fire(w))).toBeUndefined();
    write(mainLog(w), [request(551_000)]);
    expect(note(fire(w))).toBeUndefined();
    write(mainLog(w), [request(396_000)]);
    expect(note(fire(w))).toBeUndefined();
    write(mainLog(w), [request(401_000)]);
    expect(note(fire(w))).toBeUndefined();
  });

  it('keeps its marks when the end of the log shows no count', () => {
    const w = world();
    write(mainLog(w), [request(470_000)]);
    expect(note(fire(w))).toBeDefined();
    const results = [];
    for (let index = 0; index < 60; index += 1) results.push(result('x'.repeat(100_000)));
    write(mainLog(w), [request(470_000), ...results]);
    expect(note(fire(w))).toBeUndefined();
    write(mainLog(w), [request(470_000), ...results, request(471_000)]);
    expect(note(fire(w))).toBeUndefined();
  });

  it('removes the marks of a session that ended two weeks ago', () => {
    const w = world();
    const folder = path.join(w.temp, 'benar-context-budget');
    mkdirSync(folder);
    const old = path.join(folder, 'old-session.2');
    const recent = path.join(folder, 'recent-session.2');
    writeFileSync(old, '');
    writeFileSync(recent, '');
    const before = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    utimesSync(old, before, before);
    write(mainLog(w), [request(412_400)]);
    expect(note(fire(w))).toBeDefined();
    expect(existsSync(old)).toBe(false);
    expect(existsSync(recent)).toBe(true);
  });

  it('reads the last request that has a count', () => {
    const w = world();
    const empty = JSON.stringify({
      type: 'assistant',
      isSidechain: false,
      message: { model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } },
    });
    write(mainLog(w), [request(900_000), request(440_000), empty, result('x')]);
    expect(note(fire(w))).toContain('440K');
  });

  it('does not count a request of a subagent in the log of the session', () => {
    const w = world();
    write(mainLog(w), [request(100_000), request(700_000, { isSidechain: true })]);
    expect(note(fire(w))).toBeUndefined();
  });
});

describe('context budget hook: a subagent', () => {
  it('reads the log of the subagent and tells it to report and stop', () => {
    const w = world();
    write(mainLog(w), [request(50_000)]);
    write(agentLog(w, 'a1b2c3'), [request(402_000, { isSidechain: true })]);
    const text = note(fire(w, { agent_id: 'a1b2c3', agent_type: 'builder' }));
    expect(text).toContain('402K');
    expect(text).toContain('subagent');
    expect(text).toContain('stop');
    expect(text).not.toContain('/handover');
    // The whole task of a `builder` is one step of a plan: "finish the step" would not stop it.
    expect(text).toContain('Finish the edit or the check');
    expect(text).not.toContain('step');
  });

  it('reads the log of the subagent when the payload names that log', () => {
    const w = world();
    write(mainLog(w), [request(50_000)]);
    const log = write(agentLog(w, 'a1b2c3'), [request(402_000, { isSidechain: true })]);
    const text = note(fire(w, { agent_id: 'a1b2c3', transcript_path: log }));
    expect(text).toContain('402K');
    expect(text).toContain('subagent');
  });

  it('is silent when the subagent has no log, also when the session is large', () => {
    const w = world();
    write(mainLog(w), [request(650_000)]);
    expect(note(fire(w, { agent_id: 'a1b2c3' }))).toBeUndefined();
  });

  it('keeps the bands of a subagent apart from the bands of the session', () => {
    const w = world();
    write(mainLog(w), [request(430_000)]);
    write(agentLog(w, 'a1b2c3'), [request(430_000, { isSidechain: true })]);
    expect(note(fire(w, { agent_id: 'a1b2c3' }))).toContain('subagent');
    expect(note(fire(w))).toContain('/handover');
    expect(note(fire(w, { agent_id: 'a1b2c3' }))).toBeUndefined();
  });

  it('is silent for an agent ID that is not a plain name', () => {
    const w = world();
    write(mainLog(w), [request(650_000)]);
    // Where a join of the unchecked ID with the folder of the subagents would land.
    const outside = write(path.join(w.logs, 'outside.jsonl'), [request(650_000)]);
    const agent = '../../../../outside';
    expect(path.join(w.logs, w.session, 'subagents', `agent-${agent}.jsonl`)).toBe(outside);
    expect(note(fire(w, { agent_id: agent }))).toBeUndefined();
  });
});

describe('context budget hook: it never stops a tool call', () => {
  it('is silent when the log does not exist', () => {
    const w = world();
    expect(note(fire(w))).toBeUndefined();
  });

  it('is silent for an empty payload, a payload that is not JSON, and a payload with no log', () => {
    const w = world();
    expect(note(pipe(w, ''))).toBeUndefined();
    expect(note(pipe(w, 'not json'))).toBeUndefined();
    expect(note(pipe(w, '[]'))).toBeUndefined();
    expect(note(pipe(w, JSON.stringify({ hook_event_name: 'PostToolUse' })))).toBeUndefined();
    expect(note(fire(w, { transcript_path: 42 }))).toBeUndefined();
  });

  it('is silent for another hook event', () => {
    const w = world();
    write(mainLog(w), [request(650_000)]);
    expect(note(fire(w, { hook_event_name: 'PreToolUse' }))).toBeUndefined();
  });

  it('is silent for a log with no count', () => {
    const w = world();
    write(mainLog(w), [result('x'), '{"type":"assistant","message":{}}', '']);
    expect(note(fire(w))).toBeUndefined();
  });

  it('passes a line that is not JSON and reads the request before it', () => {
    const w = world();
    write(mainLog(w), [request(412_400), '{"type":"assistant","message":{"usage":']);
    expect(note(fire(w))).toContain('412K');
  });

  it('keeps its state in its own folder for a session ID with path signs', () => {
    const w = world();
    write(mainLog(w), [request(412_400)]);
    expect(note(fire(w, { session_id: '../../escape' }))).toContain('412K');
    expect(readdirSync(w.temp)).toEqual(['benar-context-budget']);
    expect(existsSync(path.join(w.logs, '..', 'escape'))).toBe(false);
    // The same ID again: the state was kept, so the band has its note already.
    expect(note(fire(w, { session_id: '../../escape' }))).toBeUndefined();
  });
});

describe('context budget hook: a large log', () => {
  const filler = result('x'.repeat(100_000));

  it('finds the count behind a tool result of 500 KB', () => {
    const w = world();
    const lines = [request(900_000)];
    for (let index = 0; index < 60; index += 1) lines.push(filler);
    lines.push(request(430_000), result('y'.repeat(500_000)), result('z'.repeat(200_000)));
    write(mainLog(w), lines);
    expect(note(fire(w))).toContain('430K');
  });

  it('reads a request whose line is longer than one piece of the read', () => {
    const w = world();
    write(mainLog(w), [
      request(900_000),
      request(445_000, { pad: 'p'.repeat(200_000) }),
      result('y'.repeat(70_000)),
    ]);
    expect(note(fire(w))).toContain('445K');
  });

  it('reads the end of the log only', () => {
    const w = world();
    const lines = [request(900_000)];
    for (let index = 0; index < 60; index += 1) lines.push(filler);
    write(mainLog(w), lines);
    expect(note(fire(w))).toBeUndefined();
  });
});
