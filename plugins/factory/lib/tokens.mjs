// Estimates tokens per task from Claude Code subagent transcripts. Every factory prompt
// starts with "Factory task: T-xxxx", so a transcript whose first user message carries
// that header belongs to the task. The transcript format is not a documented interface,
// so everything here is defensive and the dashboard labels the numbers as estimates.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HEADER = /Factory task: (T-\d+)/;
const cache = new Map(); // file -> { size, mtimeMs, taskId, usage }

export function projectTranscriptDir(root, home = os.homedir()) {
  return path.join(home, '.claude', 'projects', root.replace(/[^A-Za-z0-9]/g, '-'));
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('\n');
  return '';
}

export function parseTranscript(text) {
  let taskId = null;
  let sawUser = false;
  const seen = new Set();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  for (const line of text.split('\n')) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!sawUser && entry.type === 'user') {
      sawUser = true;
      taskId = textOf(entry.message?.content).match(HEADER)?.[1] ?? null;
      if (!taskId) return { taskId: null, usage };
    }
    const u = entry.type === 'assistant' ? entry.message?.usage : null;
    if (!u) continue;
    // Streaming writes several lines per message; count each message id once.
    const key = entry.message?.id ?? entry.uuid;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    usage.input += u.input_tokens ?? 0;
    usage.output += u.output_tokens ?? 0;
    usage.cacheRead += u.cache_read_input_tokens ?? 0;
    usage.cacheCreation += u.cache_creation_input_tokens ?? 0;
  }
  return { taskId, usage };
}

function* subagentTranscripts(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* subagentTranscripts(full);
    else if (entry.name.endsWith('.jsonl') && full.includes(`${path.sep}subagents${path.sep}`)) yield full;
  }
}

// Returns { [taskId]: { input, output, cacheRead, cacheCreation, total } }.
// total excludes cache reads, which re-count the same context on every turn.
export function tokensByTask(root, home) {
  const totals = {};
  for (const file of subagentTranscripts(projectTranscriptDir(root, home))) {
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat) continue;
    let hit = cache.get(file);
    if (!hit || hit.size !== stat.size || hit.mtimeMs !== stat.mtimeMs) {
      hit = { size: stat.size, mtimeMs: stat.mtimeMs, ...parseTranscript(fs.readFileSync(file, 'utf8')) };
      cache.set(file, hit);
    }
    if (!hit.taskId) continue;
    const t = (totals[hit.taskId] ??= { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 });
    t.input += hit.usage.input;
    t.output += hit.usage.output;
    t.cacheRead += hit.usage.cacheRead;
    t.cacheCreation += hit.usage.cacheCreation;
    t.total = t.input + t.output + t.cacheCreation;
  }
  return totals;
}
