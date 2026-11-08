import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as sm from './state.mjs';
import { FactoryError } from './state.mjs';
import { Store, DEFAULT_CONFIG } from './store.mjs';
import { git, run, mainRoot, currentBranch, defaultBranch, dirtyFiles } from './git.mjs';
import { nextTaskId, nextSessionId } from './ids.mjs';
import { checkOnce } from './watchdog.mjs';
import { detectCommands } from './detect.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `factory — state CLI for the software factory

Setup
  factory preflight [--json]                  Check git, clean tree, gh install/auth, remote, branch
  factory init                                Create .factory/ and add it to .gitignore
  factory detect                              Suggest format/lint/typecheck/test commands (JSON)
  factory config [get|set <key> <value>]      Read or change .factory/config.json (dot keys, JSON values)
  factory session start --branch <b> [--requirements <file>]
  factory session current|end
  factory guard-base <branch>                 Fail if <branch> is the repository's default branch

Tasks
  factory task create --title <t> --file <task.md> [--depends T-1,T-2]
  factory task show <id> [--json]
  factory ready                               Backlog task ids (current session) whose dependencies merged
  factory unfinished [--json]                 Tasks left backlog/in_progress/paused/approved/error
  factory status [--all] [--json]
  factory tests <id>                          Print "none" if the task says "No Tests", else the list

Task runner protocol
  factory start <id>                          backlog -> in_progress
  factory step <id> <step>                    Prints continue | pause | cancel
  factory end-step <id> <step> --approved true|false [--error <msg>] [--tokens <n>]
                                              Prints next | retry | merged | error | cancel
  factory approve <id> --pr <url>             Approver records the PR before merging
  factory log <id> <message>
  factory worktree <id>                       Create (or reuse) the task worktree; prints its path
  factory wrapup <id>                         Remove worktree and merged branch, fast-forward main checkout

Control
  factory pause <id> | resume <id> [--recover] | cancel <id> [--clean] | restart <id> [--prompt <text>]
  factory clean <id>                          Remove the worktree of a cancelled or errored task

Bare commands
  factory shims check|install [--force]       Install the /factory, /orchestrator and /create-pr user skills

Monitoring
  factory watchdog [--once] [--interval <s>] [--throttle <s>]
  factory dashboard start|stop|url|open
`;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) flags[key] = true;
      else {
        flags[key] = value;
        i++;
      }
    } else positional.push(arg);
  }
  return { positional, flags };
}

function requireValue(flags, key, hint) {
  const value = flags[key];
  if (typeof value !== 'string' || !value.trim()) throw new FactoryError(`Missing --${key}${hint ? ` (${hint})` : ''}.`);
  return value;
}

function openStore({ mustExist = true } = {}) {
  const root = mainRoot();
  if (!root) throw new FactoryError('Not inside a git repository. Run the factory from your project directory.');
  const store = new Store(root);
  if (mustExist && !store.exists()) throw new FactoryError('No .factory/ directory here. Start the factory with /factory first.');
  return store;
}

const now = () => new Date().toISOString();

function elapsed(state) {
  if (!state.startedAt) return '-';
  const end = state.finishedAt ? Date.parse(state.finishedAt) : Date.now();
  const mins = Math.max(0, Math.floor((end - Date.parse(state.startedAt)) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m` : `${mins}m`;
}

function allTasks(store) {
  return store.taskIds().filter((id) => store.hasTask(id)).map((id) => store.readTask(id));
}

function sessionTasks(store, all) {
  const session = store.currentSessionId();
  const tasks = allTasks(store);
  return all || !session ? tasks : tasks.filter((t) => t.sessionId === session);
}

// ---------- setup ----------

function preflight(flags) {
  const checks = [];
  const add = (name, ok, message, fix) => checks.push({ name, ok, message, fix: ok ? null : fix });
  const root = mainRoot();
  add('git repository', Boolean(root), root ? root : 'Not inside a git repository.', 'Run `git init` (and push it to GitHub) first.');
  let branch = null;
  let base = null;
  if (root) {
    const dirty = dirtyFiles(root).filter((f) => !f.startsWith('.factory'));
    add('clean working tree', dirty.length === 0, dirty.length ? `Uncommitted changes:\n  ${dirty.join('\n  ')}` : 'Clean.', 'Commit or stash these changes, then run /factory again.');
    const ghVersion = run('gh', ['--version'], { allowFail: true });
    add('gh installed', Boolean(ghVersion), ghVersion ? ghVersion.split('\n')[0] : 'GitHub CLI not found.',
      process.platform === 'darwin' ? 'Install it with `brew install gh`.' : 'Install it from https://cli.github.com.');
    if (ghVersion) {
      const auth = run('gh', ['auth', 'status'], { cwd: root, allowFail: true });
      add('gh authenticated', auth !== null, auth !== null ? 'Logged in.' : 'gh is not authenticated.', 'Run `! gh auth login` in Claude Code.');
    }
    const remote = git(['remote', 'get-url', 'origin'], { cwd: root, allowFail: true });
    add('GitHub remote', Boolean(remote?.includes('github')), remote ?? 'No "origin" remote.', 'Add one with `git remote add origin git@github.com:<you>/<repo>.git` and push.');
    branch = currentBranch(root);
    base = defaultBranch(root);
    add('not on default branch', Boolean(branch) && branch !== base, branch ? `On ${branch} (default: ${base}).` : 'Detached HEAD.',
      `Tasks merge into the current branch, which must not be ${base}. Create an orchestrator branch, e.g. \`git switch -c factory/<feature> && git push -u origin HEAD\`.`);
  }
  const result = { ok: checks.every((c) => c.ok), root, branch, defaultBranch: base, checks };
  if (flags.json) console.log(JSON.stringify(result, null, 2));
  else for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}: ${c.message}${c.fix ? `\n  → ${c.fix}` : ''}`);
  return result.ok ? 0 : 1;
}

function init() {
  const store = openStore({ mustExist: false });
  for (const dir of ['tasks', 'sessions', 'worktrees']) fs.mkdirSync(store.path(dir), { recursive: true });
  if (!fs.existsSync(store.path('config.json'))) {
    store.saveConfig({ ...DEFAULT_CONFIG, commands: { ...DEFAULT_CONFIG.commands, ...(detectCommands(store.root).suggested ?? {}) } });
  }
  const gitignore = path.join(store.root, '.gitignore');
  const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : '';
  const ignored = current.split('\n').some((l) => ['.factory', '.factory/', '/.factory', '/.factory/'].includes(l.trim()));
  if (!ignored) fs.writeFileSync(gitignore, `${current}${current && !current.endsWith('\n') ? '\n' : ''}.factory/\n`);
  console.log(JSON.stringify({ root: store.root, gitignoreUpdated: !ignored, config: store.path('config.json') }));
  return 0;
}

function setByPath(obj, key, value) {
  const parts = key.split('.');
  const last = parts.pop();
  let cursor = obj;
  for (const part of parts) cursor = cursor[part] ??= {};
  cursor[last] = value;
}

function config(positional) {
  const store = openStore();
  const [action = 'get', key, raw] = positional;
  if (action === 'get') {
    const cfg = store.config();
    console.log(JSON.stringify(key ? key.split('.').reduce((o, k) => o?.[k], cfg) ?? null : cfg, null, 2));
    return 0;
  }
  if (action !== 'set' || !key || raw === undefined) throw new FactoryError('Usage: factory config set <key> <value>');
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }
  const cfg = store.config();
  setByPath(cfg, key, value);
  store.saveConfig(cfg);
  console.log(`${key} = ${JSON.stringify(value)}`);
  return 0;
}

function session(positional, flags) {
  const store = openStore();
  const action = positional[0];
  if (action === 'start') {
    const branch = requireValue(flags, 'branch', 'the orchestrator branch');
    guardBase(store.root, branch);
    const id = nextSessionId(store);
    const s = { id, branch, defaultBranch: defaultBranch(store.root), startedAt: now(), endedAt: null, tasks: [] };
    store.writeSession(s);
    if (typeof flags.requirements === 'string') fs.copyFileSync(flags.requirements, store.path('sessions', id, 'requirements.md'));
    store.writeText(store.path('current-session'), `${id}\n`);
    console.log(id);
    return 0;
  }
  const id = store.currentSessionId();
  if (action === 'current') {
    if (!id) throw new FactoryError('No active session.');
    console.log(JSON.stringify(store.readSession(id), null, 2));
    return 0;
  }
  if (action === 'end') {
    if (!id) throw new FactoryError('No active session.');
    store.writeSession({ ...store.readSession(id), endedAt: now() });
    fs.rmSync(store.path('current-session'), { force: true });
    console.log(`Ended ${id}.`);
    return 0;
  }
  throw new FactoryError('Usage: factory session start|current|end');
}

function guardBase(root, branch) {
  const base = defaultBranch(root);
  if (branch === base) {
    throw new FactoryError(`Refusing to use ${base}: it is the default branch. The factory only merges into an orchestrator branch, and you merge that into ${base} yourself.`);
  }
}

// ---------- tasks ----------

export function parseTests(markdown) {
  const match = markdown.match(/^##\s+Tests\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m);
  if (!match) return null;
  const body = match[1].trim();
  if (/^no tests\.?$/i.test(body)) return { none: true, items: [] };
  return { none: false, items: body.split('\n').map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s*(?:\[[ x]\]\s*)?/, '').trim()).filter(Boolean) };
}

function taskCreate(flags) {
  const store = openStore();
  const title = requireValue(flags, 'title');
  const file = requireValue(flags, 'file', 'path to the task markdown');
  const body = fs.readFileSync(file, 'utf8');
  const tests = parseTests(body);
  if (!tests) throw new FactoryError('The task file needs a "## Tests" section. Write "No Tests" there if the task has none.');
  if (!tests.none && tests.items.length === 0) throw new FactoryError('The "## Tests" section is empty. List the tests, or write "No Tests".');
  const dependsOn = typeof flags.depends === 'string' ? flags.depends.split(',').map((s) => s.trim()).filter(Boolean) : [];
  for (const dep of dependsOn) store.readTask(dep);
  const sessionId = store.currentSessionId();
  if (!sessionId) throw new FactoryError('No active session. Run "factory session start --branch <branch>" first.');
  const s = store.readSession(sessionId);
  const id = nextTaskId(store);
  const { maxRuns } = store.config();
  store.writeText(path.join(store.taskDir(id), 'task.md'), `# ${id}: ${title}\n\n${body.trim()}\n`);
  store.writeTask(sm.newTaskState({ id, title, sessionId, baseBranch: s.branch, dependsOn, maxRuns, now: now() }));
  store.appendEvent(id, { type: 'created', title });
  store.writeSession({ ...s, tasks: [...s.tasks, id] });
  console.log(id);
  return 0;
}

function taskShow(id, flags) {
  const store = openStore();
  const state = store.readTask(id);
  if (flags.json) console.log(JSON.stringify({ state, events: store.events(id) }, null, 2));
  else {
    console.log(fs.readFileSync(path.join(store.taskDir(id), 'task.md'), 'utf8'));
    console.log(`Status: ${state.status}  Step: ${state.step ?? '-'}  Run: ${state.run}/${state.maxRuns}  PR: ${state.prUrl ?? '-'}`);
    if (state.lastError) console.log(`Last error (${state.lastError.step}, run ${state.lastError.run}): ${state.lastError.message}`);
  }
  return 0;
}

function ready() {
  const store = openStore();
  const tasks = sessionTasks(store, false);
  const byId = Object.fromEntries(allTasks(store).map((t) => [t.id, t]));
  const ids = tasks.filter((t) => t.status === 'backlog' && t.dependsOn.every((d) => byId[d]?.status === 'merged')).map((t) => t.id);
  console.log(ids.join('\n'));
  return 0;
}

function unfinished(flags) {
  const store = openStore();
  const tasks = allTasks(store).filter((t) => !['merged', 'cancelled'].includes(t.status));
  if (flags.json) console.log(JSON.stringify(tasks.map(({ id, title, status, step, run, sessionId }) => ({ id, title, status, step, run, sessionId }))));
  else for (const t of tasks) console.log(`${t.id}  ${t.status.padEnd(11)} ${t.sessionId}  ${t.title}`);
  return 0;
}

function status(flags) {
  const store = openStore();
  const tasks = sessionTasks(store, Boolean(flags.all));
  if (flags.json) {
    console.log(JSON.stringify(tasks, null, 2));
    return 0;
  }
  if (tasks.length === 0) {
    console.log('No tasks.');
    return 0;
  }
  console.log(`${'ID'.padEnd(8)}${'STATUS'.padEnd(12)}${'STEP'.padEnd(10)}RUN  ${'TIME'.padEnd(7)}TITLE`);
  for (const t of tasks) {
    const st = t.control === 'pause' ? 'pausing' : t.status;
    console.log(`${t.id.padEnd(8)}${st.padEnd(12)}${(t.step ?? '-').padEnd(10)}${`${t.run}/${t.maxRuns}`.padEnd(5)}${elapsed(t).padEnd(7)}${t.title}`);
  }
  return 0;
}

function tests(id) {
  const store = openStore();
  store.readTask(id);
  const parsed = parseTests(fs.readFileSync(path.join(store.taskDir(id), 'task.md'), 'utf8'));
  console.log(!parsed || parsed.none ? 'none' : parsed.items.map((t) => `- ${t}`).join('\n'));
  return 0;
}

// ---------- runner protocol ----------

function transition(id, fn, event) {
  const store = openStore();
  const result = store.updateTask(id, fn);
  if (event) store.appendEvent(id, typeof event === 'function' ? event(result) : event);
  return result;
}

function start(id) {
  transition(id, (s) => sm.start(s, now()), { type: 'started' });
  console.log('started');
  return 0;
}

function step(id, name) {
  const { signal, state } = transition(id, (s) => sm.beginStep(s, name, now()), ({ signal, state }) =>
    signal === 'continue' ? { type: 'step_started', step: name, run: state.run } : { type: signal === 'pause' ? 'paused' : 'cancel_seen', step: name, run: state.run });
  console.log(signal);
  if (signal === 'pause') console.error(`${id} paused before ${name} (run ${state.run}). Resume with /factory:resume ${id}.`);
  return 0;
}

function endStep(id, name, flags) {
  const approvedFlag = requireValue(flags, 'approved', 'true or false');
  if (!['true', 'false'].includes(approvedFlag)) throw new FactoryError('--approved must be true or false.');
  const isApproved = approvedFlag === 'true';
  const errorMessage = typeof flags.error === 'string' ? flags.error : '';
  const tokens = Number(flags.tokens) || 0;
  const { signal, state } = transition(
    id,
    (s) => {
      const r = sm.endStep(s, name, { isApproved, errorMessage }, now());
      return { ...r, state: { ...r.state, tokens: { reported: (r.state.tokens?.reported ?? 0) + tokens } } };
    },
    ({ signal, state }) => ({ type: 'step_finished', step: name, run: isApproved || signal === 'error' ? state.run : state.run - 1, isApproved, errorMessage, signal }),
  );
  console.log(signal);
  if (signal === 'error') console.error(`${id} failed ${state.maxRuns} runs. Last error: ${state.lastError.message}`);
  return 0;
}

function approve(id, flags) {
  const pr = requireValue(flags, 'pr', 'the pull request URL');
  const store = openStore();
  const s = store.readTask(id);
  guardBase(store.root, s.baseBranch);
  transition(id, (st) => sm.approve(st, pr), { type: 'approved', prUrl: pr });
  console.log('approved');
  return 0;
}

function log(id, message) {
  const store = openStore();
  store.readTask(id);
  if (!message) throw new FactoryError('Usage: factory log <id> <message>');
  store.appendEvent(id, { type: 'log', message });
  return 0;
}

function worktree(id) {
  const store = openStore();
  const s = store.readTask(id);
  const dir = store.path('worktrees', id);
  store.withLock('git-main', () => {
    if (fs.existsSync(path.join(dir, '.git'))) return;
    git(['fetch', 'origin', s.baseBranch], { cwd: store.root, allowFail: true });
    const hasBranch = git(['rev-parse', '--verify', '--quiet', `refs/heads/${s.branch}`], { cwd: store.root, allowFail: true });
    const remoteBase = git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${s.baseBranch}`], { cwd: store.root, allowFail: true });
    const from = remoteBase ? `origin/${s.baseBranch}` : s.baseBranch;
    git(['worktree', 'prune'], { cwd: store.root, allowFail: true });
    git(hasBranch ? ['worktree', 'add', dir, s.branch] : ['worktree', 'add', '-b', s.branch, dir, from], { cwd: store.root });
    store.appendEvent(id, { type: 'worktree', path: dir, branch: s.branch, from: hasBranch ? s.branch : from });
  });
  console.log(dir);
  return 0;
}

function removeWorktree(store, s) {
  const dir = store.path('worktrees', s.id);
  store.withLock('git-main', () => {
    if (fs.existsSync(dir)) git(['worktree', 'remove', '--force', dir], { cwd: store.root, allowFail: true });
    fs.rmSync(dir, { recursive: true, force: true });
    git(['worktree', 'prune'], { cwd: store.root, allowFail: true });
    git(['branch', '-D', s.branch], { cwd: store.root, allowFail: true });
  });
}

function wrapup(id) {
  const store = openStore();
  const s = store.readTask(id);
  if (s.status !== 'merged') throw new FactoryError(`${id} is ${s.status}; wrapup only runs after the task is merged.`);
  removeWorktree(store, s);
  if (git(['ls-remote', '--heads', 'origin', s.branch], { cwd: store.root, allowFail: true })) {
    git(['push', 'origin', '--delete', s.branch], { cwd: store.root, allowFail: true });
  }
  // Keep the orchestrator checkout current so later tasks and /create-pr see merged work.
  store.withLock('git-main', () => {
    if (currentBranch(store.root) === s.baseBranch && dirtyFiles(store.root).filter((f) => !f.startsWith('.factory')).length === 0) {
      git(['pull', '--ff-only', 'origin', s.baseBranch], { cwd: store.root, allowFail: true });
    }
  });
  store.appendEvent(id, { type: 'wrapup', message: `Removed worktree and branch ${s.branch}.` });
  console.log(`wrapped up ${id}`);
  return 0;
}

// ---------- control ----------

function pause(id) {
  transition(id, sm.pause, { type: 'pause_requested' });
  console.log(`${id} will pause when its current step finishes.`);
  return 0;
}

function resume(id, flags) {
  const recover = Boolean(flags.recover);
  const { state, step: from, before } = transition(id, (s) => sm.resume(s, { recover }), { type: 'resumed', recover });
  if (before.status === 'in_progress' && !recover) {
    console.log(`${id} pause request withdrawn; it keeps running.`);
    return 0;
  }
  console.log(JSON.stringify({ id, run: state.run, step: from, respawn: true }));
  return 0;
}

function cancel(id, flags) {
  const store = openStore();
  const { state } = transition(id, (s) => sm.cancel(s, now()), { type: 'cancelled' });
  if (flags.clean) removeWorktree(store, state);
  console.log(`${id} cancelled${flags.clean ? ' and its worktree removed' : ''}.`);
  return 0;
}

function clean(id) {
  const store = openStore();
  const s = store.readTask(id);
  if (!['cancelled', 'error'].includes(s.status)) {
    throw new FactoryError(`${id} is ${s.status}; only cancelled or errored tasks can be cleaned (merged tasks are cleaned by wrapup).`);
  }
  removeWorktree(store, s);
  store.appendEvent(id, { type: 'cleaned', message: `Removed worktree and local branch ${s.branch}.` });
  console.log(`${id} worktree and local branch removed.`);
  return 0;
}

function restart(id, flags) {
  const store = openStore();
  const prompt = typeof flags.prompt === 'string' ? flags.prompt.trim() : '';
  transition(id, sm.restart, { type: 'restarted', prompt });
  if (prompt) {
    fs.appendFileSync(path.join(store.taskDir(id), 'task.md'), `\n## Restart instructions (${now()})\n\n${prompt}\n`);
  }
  console.log(`${id} reset to backlog with a fresh run budget.`);
  return 0;
}

// ---------- monitoring ----------

async function watchdog(flags) {
  const root = mainRoot();
  if (!root) return 0;
  const store = new Store(root);
  if (flags.once) {
    if (!store.exists()) return 0;
    // Called from a PostToolUse hook on every tool call; throttle to keep it cheap.
    const throttle = Number(flags.throttle) || 0;
    const stamp = store.path('watchdog.stamp');
    const last = fs.statSync(stamp, { throwIfNoEntry: false })?.mtimeMs ?? 0;
    if (throttle && Date.now() - last < throttle * 1000) return 0;
    fs.writeFileSync(stamp, '');
    checkOnce(store);
    return 0;
  }
  // Long-running mode (plugin monitor). Stays silent: everything it prints reaches Claude
  // as a notification, so it only speaks when a step is stuck.
  const interval = (Number(flags.interval) || 30) * 1000;
  for (;;) {
    try {
      if (store.exists()) checkOnce(store);
    } catch (err) {
      console.error(`[factory] watchdog: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function openUrl(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

async function dashboard(positional) {
  const store = openStore();
  const action = positional[0] ?? 'start';
  const infoFile = store.path('dashboard.json');
  const info = store.readJson(infoFile, {});
  const running = info.pid && pidAlive(info.pid);
  if (action === 'stop') {
    if (running) process.kill(info.pid);
    console.log(running ? 'Dashboard stopped.' : 'Dashboard was not running.');
    return 0;
  }
  if (action === 'url' || (running && action === 'start')) {
    if (!running) throw new FactoryError('Dashboard is not running. Start it with "factory dashboard start".');
    console.log(JSON.stringify(info, null, 2));
    return 0;
  }
  if (action === 'open') {
    if (!running) await dashboard(['start']);
    openUrl(store.readJson(infoFile).localUrl);
    return 0;
  }
  if (action !== 'start') throw new FactoryError('Usage: factory dashboard start|stop|url|open');
  const logFd = fs.openSync(store.path('dashboard.log'), 'a');
  const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'dashboard', 'server.mjs'), '--root', store.root, '--port', String(store.config().port)], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const next = store.readJson(infoFile, {});
    if (next.pid === child.pid) {
      console.log(JSON.stringify(next, null, 2));
      return 0;
    }
  }
  throw new FactoryError(`Dashboard did not start. See ${store.path('dashboard.log')}.`);
}

// ---------- bare-name shims (/factory, /orchestrator, /create-pr) ----------

const SHIM_MARKER = /<!-- factory-shim v([^ ]+) -->/;

export function shims(action, flags, { home = os.homedir(), pluginRoot = PLUGIN_ROOT } = {}) {
  const version = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const names = fs.readdirSync(path.join(pluginRoot, 'shims'));
  const report = names.map((name) => {
    const target = path.join(home, '.claude', 'skills', name, 'SKILL.md');
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    const installed = existing?.match(SHIM_MARKER)?.[1] ?? null;
    const state = existing === null ? 'missing' : installed === null ? 'foreign' : installed === version ? 'ok' : 'stale';
    return { name, target, state, installed };
  });
  if (action === 'install') {
    for (const shim of report) {
      if (shim.state === 'ok') continue;
      if (shim.state === 'foreign' && !flags.force) continue;
      const body = fs.readFileSync(path.join(pluginRoot, 'shims', shim.name, 'SKILL.md'), 'utf8').replaceAll('{{VERSION}}', version);
      fs.mkdirSync(path.dirname(shim.target), { recursive: true });
      fs.writeFileSync(shim.target, body);
      shim.state = 'installed';
    }
  } else if (action !== 'check') throw new FactoryError('Usage: factory shims check|install [--force]');
  console.log(JSON.stringify({ version, shims: report }, null, 2));
  const foreign = report.filter((s) => s.state === 'foreign');
  if (action === 'install' && foreign.length) {
    console.error(`Skipped ${foreign.map((s) => s.target).join(', ')}: a different skill already uses that name. Re-run with --force to replace it.`);
    return 1;
  }
  return 0;
}

// ---------- dispatch ----------

export async function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const [cmd, ...rest] = positional;
  try {
    switch (cmd) {
      case 'preflight': return preflight(flags);
      case 'init': return init();
      case 'detect': console.log(JSON.stringify(detectCommands(openStore({ mustExist: false }).root), null, 2)); return 0;
      case 'config': return config(rest);
      case 'session': return session(rest, flags);
      case 'guard-base': guardBase(openStore({ mustExist: false }).root, rest[0]); console.log('ok'); return 0;
      case 'task':
        if (rest[0] === 'create') return taskCreate(flags);
        if (rest[0] === 'show') return taskShow(rest[1], flags);
        throw new FactoryError('Usage: factory task create|show');
      case 'ready': return ready();
      case 'unfinished': return unfinished(flags);
      case 'status': return status(flags);
      case 'tests': return tests(rest[0]);
      case 'start': return start(rest[0]);
      case 'step': return step(rest[0], rest[1]);
      case 'end-step': return endStep(rest[0], rest[1], flags);
      case 'approve': return approve(rest[0], flags);
      case 'log': return log(rest[0], rest.slice(1).join(' '));
      case 'worktree': return worktree(rest[0]);
      case 'wrapup': return wrapup(rest[0]);
      case 'pause': return pause(rest[0]);
      case 'resume': return resume(rest[0], flags);
      case 'cancel': return cancel(rest[0], flags);
      case 'restart': return restart(rest[0], flags);
      case 'clean': return clean(rest[0]);
      case 'watchdog': return await watchdog(flags);
      case 'dashboard': return await dashboard(rest);
      case 'shims': return shims(rest[0], flags);
      case undefined: case 'help': case '--help': console.log(HELP); return 0;
      default: throw new FactoryError(`Unknown command "${cmd}". Run "factory help".`);
    }
  } catch (err) {
    console.error(`factory: ${err.message}`);
    return err instanceof FactoryError ? 1 : 2;
  }
}
