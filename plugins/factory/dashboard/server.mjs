#!/usr/bin/env node
// Factory dashboard server: zero dependencies. Serves the prebuilt UI from dist/ and a
// token-protected JSON + Server-Sent Events API over the project's .factory/ state.
// Binds 0.0.0.0 so phones on the same network can open it.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { STEPS } from '../lib/state.mjs';
import { tokensByTask } from '../lib/tokens.mjs';
import { currentBranch } from '../lib/git.mjs';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const root = path.resolve(arg('root', process.cwd()));
const store = new Store(root);
const infoFile = store.path('dashboard.json');
const previous = store.readJson(infoFile, {});
// Reuse the token so URLs bookmarked on a phone keep working across restarts.
const token = previous.token ?? crypto.randomBytes(18).toString('base64url');
const tokenBuf = Buffer.from(token);
let listening = null; // dashboard.json contents once the server is bound

function authorized(req, url) {
  const header = req.headers.authorization?.replace(/^Bearer /, '');
  const given = Buffer.from(header ?? url.searchParams.get('t') ?? '');
  return given.length === tokenBuf.length && crypto.timingSafeEqual(given, tokenBuf);
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

// ---------- data ----------

let tokenCache = { at: 0, totals: {} };
function tokenTotals() {
  if (Date.now() - tokenCache.at > 5_000) {
    try {
      tokenCache = { at: Date.now(), totals: tokensByTask(root) };
    } catch {
      tokenCache = { at: Date.now(), totals: tokenCache.totals };
    }
  }
  return tokenCache.totals;
}

function summary(state, tokens) {
  const estimated = tokens[state.id];
  const stuckLevel = state.step ? (state.alerts?.[`${state.run}:${state.step}`] ?? 0) : 0;
  return {
    id: state.id,
    title: state.title,
    sessionId: state.sessionId,
    status: state.status,
    step: state.step,
    lastPassed: state.lastPassed,
    run: state.run,
    maxRuns: state.maxRuns,
    control: state.control,
    prUrl: state.prUrl,
    lastError: state.lastError,
    dependsOn: state.dependsOn,
    restarts: state.restarts,
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    stepStartedAt: state.stepStartedAt,
    finishedAt: state.finishedAt,
    stuckLevel,
    tokens: estimated ? { ...estimated, estimated: true } : { total: state.tokens?.reported ?? 0, estimated: false },
  };
}

function readState() {
  const tokens = tokenTotals();
  const tasks = store.taskIds().filter((id) => store.hasTask(id)).map((id) => summary(store.readTask(id), tokens));
  const sessions = store.sessionIds().map((id) => store.readSession(id)).filter(Boolean);
  return {
    project: { name: path.basename(root), branch: currentBranch(root) },
    currentSession: store.currentSessionId(),
    sessions: sessions.map(({ id, branch, startedAt, endedAt, tasks: ids }) => ({ id, branch, startedAt, endedAt, taskCount: ids.length })),
    steps: STEPS,
    stuckMinutes: store.config().stuckMinutes,
    access: { localUrl: listening?.localUrl ?? null, lanUrls: listening?.lanUrls ?? [] },
    serverTime: new Date().toISOString(),
    tasks,
  };
}

function readTaskDetail(id) {
  const dir = store.taskDir(id);
  const runsDir = path.join(dir, 'runs');
  const runs = {};
  if (fs.existsSync(runsDir)) {
    for (const run of fs.readdirSync(runsDir).filter((r) => /^\d+$/.test(r))) {
      runs[run] = {};
      for (const step of STEPS) {
        const file = path.join(runsDir, run, `${step}.md`);
        if (fs.existsSync(file)) runs[run][step] = fs.readFileSync(file, 'utf8');
      }
    }
  }
  const taskFile = path.join(dir, 'task.md');
  return {
    task: summary(store.readTask(id), tokenTotals()),
    taskMd: fs.existsSync(taskFile) ? fs.readFileSync(taskFile, 'utf8') : '',
    events: store.events(id).slice(-500),
    runs,
  };
}

// ---------- live updates ----------

const clients = new Set();
let pending = null;
function broadcast() {
  clearTimeout(pending);
  pending = setTimeout(() => {
    for (const res of clients) res.write(`event: change\ndata: ${Date.now()}\n\n`);
  }, 150);
}

function watchTasks() {
  const dir = store.path('tasks');
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.watch(dir, { recursive: true }, (_event, file) => {
      if (!file || !/\.(lock|tmp)$/.test(file)) broadcast();
    });
  } catch {
    // Recursive watch is unavailable on some Linux kernels/filesystems: poll instead.
    setInterval(broadcast, 2_000);
  }
  // Token totals come from transcripts outside .factory; refresh them periodically.
  let lastTokens = '';
  setInterval(() => {
    const next = JSON.stringify(tokenTotals());
    if (next !== lastTokens) {
      lastTokens = next;
      broadcast();
    }
  }, 10_000);
}

// ---------- http ----------

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers });
  res.end(body);
}
const json = (res, status, data) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json' });

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  let file = path.resolve(DIST, rel);
  if (!file.startsWith(DIST + path.sep)) return send(res, 404, 'Not found');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html'); // SPA fallback
  if (!fs.existsSync(file)) return send(res, 500, 'Dashboard build missing: run "pnpm build" in the dashboard folder.');
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
  if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname);
  if (!authorized(req, url)) return json(res, 401, { error: 'Missing or invalid access token. Open the URL printed by /factory:dashboard.' });
  try {
    if (url.pathname === '/api/state') return json(res, 200, readState());
    const match = url.pathname.match(/^\/api\/tasks\/(T-\d+)$/);
    if (match) {
      if (!store.hasTask(match[1])) return json(res, 404, { error: `Task ${match[1]} not found.` });
      return json(res, 200, readTaskDetail(match[1]));
    }
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return undefined;
    }
    return json(res, 404, { error: 'Not found' });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
});

function listen(port, attemptsLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) listen(port + 1, attemptsLeft - 1);
    else {
      console.error(`Dashboard failed to start: ${err.message}`);
      process.exit(1);
    }
  });
  server.listen(port, '0.0.0.0', () => {
    const query = `?t=${token}`;
    const info = {
      pid: process.pid,
      port,
      token,
      localUrl: `http://localhost:${port}/${query}`,
      lanUrls: lanAddresses().map((ip) => `http://${ip}:${port}/${query}`),
      startedAt: new Date().toISOString(),
    };
    listening = info;
    store.writeJson(infoFile, info);
    console.log(`Factory dashboard on ${info.localUrl}`);
    for (const lan of info.lanUrls) console.log(`  LAN: ${lan}`);
  });
}

watchTasks();
listen(Number(arg('port', 4317)) || 4317, 20);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
