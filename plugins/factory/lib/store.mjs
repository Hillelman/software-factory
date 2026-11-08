// File-backed state under <project>/.factory. All writes are atomic (tmp + rename)
// so the dashboard never reads a half-written file.
import fs from 'node:fs';
import path from 'node:path';
import { FactoryError } from './state.mjs';

export const DEFAULT_CONFIG = {
  maxRuns: 2,
  stuckMinutes: 7,
  port: 4317,
  models: { builder: 'sonnet', cleaner: 'haiku', checker: 'sonnet', tester: 'sonnet', approver: 'sonnet' },
  commands: { format: null, lint: null, typecheck: null, test: null, e2e: null, dev: null },
};

export class Store {
  constructor(root) {
    this.root = root;
    this.dir = path.join(root, '.factory');
  }

  path(...parts) {
    return path.join(this.dir, ...parts);
  }

  exists() {
    return fs.existsSync(this.dir);
  }

  readJson(file, fallback = undefined) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
      throw err;
    }
  }

  writeJson(file, data) {
    this.writeText(file, `${JSON.stringify(data, null, 2)}\n`);
  }

  writeText(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  }

  // Cross-process lock based on mkdir, which is atomic on every platform.
  withLock(name, fn, { timeoutMs = 10_000 } = {}) {
    const lock = this.path(`${name}.lock`);
    fs.mkdirSync(this.dir, { recursive: true });
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        fs.mkdirSync(lock);
        break;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        const age = Date.now() - fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs;
        if (age > 30_000) fs.rmSync(lock, { recursive: true, force: true });
        else if (Date.now() > deadline) throw new FactoryError(`Timed out waiting for lock ${lock}.`);
        else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
    }
    try {
      return fn();
    } finally {
      fs.rmSync(lock, { recursive: true, force: true });
    }
  }

  config() {
    const saved = this.readJson(this.path('config.json'), {});
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      models: { ...DEFAULT_CONFIG.models, ...saved.models },
      commands: { ...DEFAULT_CONFIG.commands, ...saved.commands },
    };
  }

  saveConfig(config) {
    this.writeJson(this.path('config.json'), config);
  }

  taskDir(id) {
    return this.path('tasks', id);
  }

  taskIds() {
    const dir = this.path('tasks');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((name) => /^T-\d+$/.test(name)).sort();
  }

  hasTask(id) {
    return fs.existsSync(path.join(this.taskDir(id), 'state.json'));
  }

  readTask(id) {
    if (!/^T-\d+$/.test(id ?? '')) throw new FactoryError(`"${id ?? ''}" is not a task id (expected something like T-0007).`);
    if (!this.hasTask(id)) throw new FactoryError(`Task ${id} does not exist. Run "factory status" to list tasks.`);
    return this.readJson(path.join(this.taskDir(id), 'state.json'));
  }

  writeTask(state) {
    this.writeJson(path.join(this.taskDir(state.id), 'state.json'), state);
  }

  // Read-modify-write a task under its lock. fn returns { state, ...extra } or a state.
  updateTask(id, fn) {
    this.readTask(id); // fail with a clear message before taking a lock in a missing directory
    return this.withLock(`tasks/${id}/state`, () => {
      const before = this.readTask(id);
      const result = fn(before);
      const wrapped = 'state' in result ? result : { state: result };
      this.writeTask(wrapped.state);
      return { before, ...wrapped };
    });
  }

  appendEvent(id, event) {
    const line = `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`;
    fs.appendFileSync(path.join(this.taskDir(id), 'events.jsonl'), line);
  }

  events(id) {
    const file = path.join(this.taskDir(id), 'events.jsonl');
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  }

  currentSessionId() {
    try {
      return fs.readFileSync(this.path('current-session'), 'utf8').trim() || null;
    } catch {
      return null;
    }
  }

  sessionIds() {
    const dir = this.path('sessions');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((name) => name.startsWith('S-')).sort();
  }

  readSession(id) {
    return this.readJson(this.path('sessions', id, 'session.json'), null);
  }

  writeSession(session) {
    this.writeJson(this.path('sessions', session.id, 'session.json'), session);
  }
}
