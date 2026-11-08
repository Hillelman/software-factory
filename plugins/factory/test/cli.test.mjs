// Drives bin/factory end to end against a throwaway git repo with a bare "origin".
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'factory');
let repo;

const sh = (cmd, args, cwd = repo) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function factory(...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: repo, encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}
function ok(...args) {
  const r = factory(...args);
  assert.equal(r.code, 0, `factory ${args.join(' ')} failed: ${r.err}`);
  return r.out;
}

before(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-cli-'));
  const origin = path.join(base, 'origin.git');
  repo = path.join(base, 'app');
  sh('git', ['init', '-q', '--bare', '-b', 'main', origin], base);
  sh('git', ['init', '-q', '-b', 'main', repo], base);
  sh('git', ['config', 'user.email', 't@example.com']);
  sh('git', ['config', 'user.name', 'Test']);
  sh('git', ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repo, 'README.md'), '# app\n');
  sh('git', ['add', '.']);
  sh('git', ['commit', '-qm', 'init']);
  sh('git', ['remote', 'add', 'origin', origin]);
  sh('git', ['push', '-q', '-u', 'origin', 'main']);
  sh('git', ['switch', '-qc', 'factory/feature']);
  sh('git', ['push', '-q', '-u', 'origin', 'factory/feature']);
});

function writeTask(name, tests = '- shows the filter') {
  const file = path.join(repo, '..', name);
  fs.writeFileSync(file, `## Description\nDo it.\n\n## Tests\n${tests}\n`);
  return file;
}

test('init creates .factory and ignores it exactly once', () => {
  ok('init');
  ok('init');
  const ignore = fs.readFileSync(path.join(repo, '.gitignore'), 'utf8');
  assert.equal(ignore.match(/\.factory\//g).length, 1);
  assert.ok(fs.existsSync(path.join(repo, '.factory', 'config.json')));
});

test('the default branch cannot be the orchestrator branch', () => {
  const r = factory('session', 'start', '--branch', 'main');
  assert.equal(r.code, 1);
  assert.match(r.err, /Refusing to use main: it is the default branch/);
});

test('full task lifecycle through the CLI, including worktree and wrapup', () => {
  ok('session', 'start', '--branch', 'factory/feature');
  assert.equal(factory('task', 'create', '--title', 'No tests section', '--file', path.join(repo, 'README.md')).code, 1);
  const id = ok('task', 'create', '--title', 'Add filter', '--file', writeTask('t1.md'));
  assert.match(id, /^T-\d{4}$/);
  assert.equal(ok('ready'), id);
  const wt = ok('worktree', id);
  assert.equal(sh('git', ['branch', '--show-current'], wt), `factory/${id}`);
  assert.equal(ok('worktree', id), wt, 'worktree is reused');

  ok('start', id);
  for (const step of ['builder', 'cleaner', 'checker', 'tester']) {
    assert.equal(ok('step', id, step), 'continue');
    assert.equal(ok('end-step', id, step, '--approved', 'true'), 'next');
  }
  assert.equal(ok('step', id, 'approver'), 'continue');
  assert.equal(factory('end-step', id, 'approver', '--approved', 'true').code, 1, 'needs approve first');
  ok('approve', id, '--pr', 'https://github.com/o/r/pull/1');
  assert.equal(ok('end-step', id, 'approver', '--approved', 'true'), 'merged');

  ok('wrapup', id);
  assert.ok(!fs.existsSync(wt));
  assert.equal(sh('git', ['branch', '--list', `factory/${id}`]), '');

  const paused = factory('pause', id);
  assert.equal(paused.code, 1);
  assert.match(paused.err, new RegExp(`${id} is already merged into factory/feature; create a new task instead`));
  assert.match(factory('restart', id, '--prompt', 'again').err, /already merged/);
  assert.match(factory('pause', 'T-9999').err, /does not exist/);
  assert.match(factory('pause', 'banana').err, /not a task id/);
});

test('two failed runs end in error and restart appends instructions', () => {
  const id = ok('task', 'create', '--title', 'Flaky', '--file', writeTask('t2.md', 'No Tests'));
  assert.equal(ok('tests', id), 'none');
  ok('start', id);
  ok('step', id, 'builder');
  assert.equal(ok('end-step', id, 'builder', '--approved', 'false', '--error', 'compile error'), 'retry');
  ok('step', id, 'builder');
  assert.equal(ok('end-step', id, 'builder', '--approved', 'false', '--error', 'still failing'), 'error');
  ok('restart', id, '--prompt', 'Use the existing date helper.');
  const md = fs.readFileSync(path.join(repo, '.factory', 'tasks', id, 'task.md'), 'utf8');
  assert.match(md, /## Restart instructions[\s\S]*Use the existing date helper\./);
  assert.match(ok('status'), new RegExp(`${id}\\s+backlog`));
});

test('ids stay unique across sessions and after .factory is deleted', () => {
  const before = ok('task', 'create', '--title', 'A', '--file', writeTask('t3.md'));
  ok('session', 'end');
  ok('session', 'start', '--branch', 'factory/feature');
  const next = ok('task', 'create', '--title', 'B', '--file', writeTask('t4.md'));
  assert.equal(Number(next.slice(2)), Number(before.slice(2)) + 1);

  // Simulate a merged task whose branch is gone but whose commit carries the trailer.
  fs.writeFileSync(path.join(repo, 'x.txt'), 'x');
  sh('git', ['add', 'x.txt']);
  sh('git', ['commit', '-qm', 'feat: x', '-m', 'Factory-Task: T-0050']);
  fs.rmSync(path.join(repo, '.factory'), { recursive: true, force: true });
  ok('init');
  ok('session', 'start', '--branch', 'factory/feature');
  assert.equal(ok('task', 'create', '--title', 'C', '--file', writeTask('t5.md')), 'T-0051');
});

test('pause/resume/cancel through the CLI', () => {
  const id = ok('task', 'create', '--title', 'Pausable', '--file', writeTask('t6.md'));
  assert.match(factory('pause', id).err, /only in-progress tasks/);
  ok('start', id);
  ok('pause', id);
  assert.equal(ok('step', id, 'builder'), 'pause');
  assert.deepEqual(JSON.parse(ok('resume', id)), { id, run: 1, step: 'builder', respawn: true });
  ok('cancel', id, '--clean');
  assert.equal(ok('step', id, 'builder'), 'cancel');
  assert.match(factory('cancel', id).err, /already cancelled/);
  assert.ok(ok('unfinished').split('\n').every((l) => !l.startsWith(id)));
});
