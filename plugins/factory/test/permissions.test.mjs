import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'factory');

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-perm-'));
  const home = path.join(base, 'home');
  const project = path.join(base, 'project');
  fs.mkdirSync(home);
  fs.mkdirSync(project);
  return { home, project, settings: path.join(home, '.claude', 'settings.json') };
}
function factory(...args) {
  const r = spawnSync(process.execPath, [BIN, 'permissions', ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}
const check = ({ home, project }) => JSON.parse(factory('check', '--json', '--home', home, '--project', project).out);
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
};
const backups = (env) => fs.readdirSync(path.dirname(env.settings)).filter((f) => f.startsWith('settings.json.bak-'));

test('check on empty home and project prompts for both commands', () => {
  const env = setup();
  const { commands, hooks } = check(env);
  assert.deepEqual(commands.map((c) => c.status), ['prompt', 'prompt']);
  assert.deepEqual(hooks, []);
});

test('allow creates settings.json, second run is a no-op', () => {
  const env = setup();
  assert.equal(factory('allow', '--home', env.home, '--project', env.project).code, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(env.settings, 'utf8')).permissions.allow, ['Bash(gh pr create:*)', 'Bash(gh pr merge:*)']);
  const before = fs.readFileSync(env.settings, 'utf8');
  assert.equal(factory('allow', '--home', env.home, '--project', env.project).code, 0);
  assert.equal(fs.readFileSync(env.settings, 'utf8'), before);
  assert.equal(backups(env).length, 0);
  assert.deepEqual(check(env).commands.map((c) => c.status), ['allowed', 'allowed']);
});

test('allow preserves existing keys and writes a backup', () => {
  const env = setup();
  const original = { model: 'opus', permissions: { allow: ['Bash(ls:*)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'check.sh' }] }] } };
  write(env.settings, original);
  const originalText = fs.readFileSync(env.settings, 'utf8');
  assert.equal(factory('allow', '--home', env.home, '--project', env.project).code, 0);
  const next = JSON.parse(fs.readFileSync(env.settings, 'utf8'));
  assert.deepEqual(Object.keys(next), ['model', 'permissions', 'hooks']);
  assert.equal(next.model, 'opus');
  assert.deepEqual(next.hooks, original.hooks);
  assert.deepEqual(next.permissions.allow, ['Bash(ls:*)', 'Bash(gh pr create:*)', 'Bash(gh pr merge:*)']);
  const found = backups(env);
  assert.equal(found.length, 1);
  assert.match(found[0], /^settings\.json\.bak-\d{14}$/);
  assert.equal(fs.readFileSync(path.join(path.dirname(env.settings), found[0]), 'utf8'), originalText);
  assert.equal(check(env).hooks.length, 1);
});

test('broad Bash(gh:*) allow counts as allowed and allow is a no-op', () => {
  const env = setup();
  write(env.settings, { permissions: { allow: ['Bash(gh:*)'] } });
  assert.deepEqual(check(env).commands.map((c) => c.status), ['allowed', 'allowed']);
  const before = fs.readFileSync(env.settings, 'utf8');
  assert.equal(factory('allow', '--home', env.home, '--project', env.project).code, 0);
  assert.equal(fs.readFileSync(env.settings, 'utf8'), before);
  assert.equal(backups(env).length, 0);
});

test('project deny rule reports denied with the file, and allow warns', () => {
  const env = setup();
  const file = path.join(env.project, '.claude', 'settings.json');
  write(file, { permissions: { deny: ['Bash(gh pr merge:*)'] } });
  const { commands } = check(env);
  assert.equal(commands[0].status, 'prompt');
  assert.equal(commands[1].status, 'denied');
  assert.equal(commands[1].file, file);
  const r = factory('allow', '--home', env.home, '--project', env.project);
  assert.equal(r.code, 0);
  assert.match(r.err, /deny/);
  assert.equal(JSON.parse(fs.readFileSync(env.settings, 'utf8')).permissions.allow.length, 2);
});

test('invalid JSON makes allow fail and leaves the file untouched', () => {
  const env = setup();
  write(env.settings, '{ "model": ');
  const before = fs.readFileSync(env.settings);
  const r = factory('allow', '--home', env.home, '--project', env.project);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /Invalid JSON/);
  assert.deepEqual(fs.readFileSync(env.settings), before);
  assert.equal(backups(env).length, 0);
});
