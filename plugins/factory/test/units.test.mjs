import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTests, shims } from '../lib/cli.mjs';
import { highestInText, formatTaskId } from '../lib/ids.mjs';
import { findStuck, checkOnce } from '../lib/watchdog.mjs';
import { parseTranscript, tokensByTask, projectTranscriptDir } from '../lib/tokens.mjs';
import { Store } from '../lib/store.mjs';

test('parseTests reads a bullet list and the literal "No Tests"', () => {
  const md = '## Description\nx\n\n## Tests\n- [ ] filter hides done items\n2. empty list shows hint\n\n## Notes\nignored';
  assert.deepEqual(parseTests(md), { none: false, items: ['filter hides done items', 'empty list shows hint'] });
  assert.deepEqual(parseTests('## Tests\n\nNo Tests\n'), { none: true, items: [] });
  assert.deepEqual(parseTests('## Tests\nno tests.'), { none: true, items: [] });
  assert.equal(parseTests('## Description\nnothing'), null);
});

test('shims install with the plugin version and never overwrite a foreign skill without --force', (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-shims-'));
  const foreign = path.join(home, '.claude', 'skills', 'create-pr', 'SKILL.md');
  fs.mkdirSync(path.dirname(foreign), { recursive: true });
  fs.writeFileSync(foreign, 'my own create-pr skill');

  assert.equal(shims('install', {}, { home }), 1);
  const installed = fs.readFileSync(path.join(home, '.claude', 'skills', 'factory', 'SKILL.md'), 'utf8');
  assert.match(installed, /<!-- factory-shim v\d+\.\d+\.\d+ -->/);
  assert.match(installed, /factory:start/);
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'my own create-pr skill');

  assert.equal(shims('install', { force: true }, { home }), 0);
  assert.match(fs.readFileSync(foreign, 'utf8'), /factory:create-pr/);
  assert.equal(shims('check', {}, { home }), 0);
});

test('task ids are found in branch names and commit trailers only', () => {
  assert.equal(highestInText('refs/heads/factory/T-0012\nrefs/remotes/origin/factory/T-0003'), 12);
  assert.equal(highestInText('feat: x\n\nFactory-Task: T-0040\n'), 40);
  assert.equal(highestInText('fix T-9999 unrelated ticket'), 0);
  assert.equal(formatTaskId(7), 'T-0007');
  assert.equal(formatTaskId(12345), 'T-12345');
});

const MIN = 60_000;
const running = (over) => ({ id: 'T-0001', title: 't', status: 'in_progress', step: 'tester', run: 1, alerts: {}, stepStartedAt: new Date(0).toISOString(), ...over });

test('findStuck alerts at the threshold and again at twice the threshold', () => {
  assert.equal(findStuck([running()], 6 * MIN, 7).length, 0);
  assert.equal(findStuck([running()], 7 * MIN, 7)[0].level, 1);
  assert.equal(findStuck([running({ alerts: { '1:tester': 1 } })], 8 * MIN, 7).length, 0);
  assert.equal(findStuck([running({ alerts: { '1:tester': 1 } })], 14 * MIN, 7)[0].level, 2);
  assert.equal(findStuck([running({ alerts: { '1:tester': 2 } })], 60 * MIN, 7).length, 0);
  assert.equal(findStuck([running({ status: 'paused' })], 60 * MIN, 7).length, 0);
  assert.equal(findStuck([running({ run: 2, alerts: { '1:tester': 2 } })], 7 * MIN, 7).length, 1);
});

test('checkOnce notifies once per level and logs a stuck event', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-wd-'));
  const store = new Store(root);
  store.writeTask(running());
  const notes = [];
  const opts = { notify: (title, msg) => notes.push(msg), log: () => {} };
  checkOnce(store, 7 * MIN, opts);
  checkOnce(store, 8 * MIN, opts);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /tester has been running for 7 min/);
  assert.equal(store.events('T-0001')[0].type, 'stuck');
});

test('tokens are summed per task from subagent transcripts, deduped by message id', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-home-'));
  const root = '/work/my-app';
  const dir = path.join(projectTranscriptDir(root, home), 'sess-1', 'subagents');
  fs.mkdirSync(dir, { recursive: true });
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100 };
  const lines = [
    { type: 'user', message: { content: 'Factory task: T-0002\nWorktree: x' } },
    { type: 'assistant', message: { id: 'm1', usage } },
    { type: 'assistant', message: { id: 'm1', usage } },
    { type: 'assistant', message: { id: 'm2', usage } },
  ];
  fs.writeFileSync(path.join(dir, 'agent-a.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n'));
  fs.writeFileSync(path.join(dir, 'agent-b.jsonl'), JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'unrelated' }] } }));
  const totals = tokensByTask(root, home);
  assert.deepEqual(Object.keys(totals), ['T-0002']);
  assert.equal(totals['T-0002'].total, 230);
  assert.equal(totals['T-0002'].cacheRead, 2000);
  assert.equal(parseTranscript('not json\n').taskId, null);
});
