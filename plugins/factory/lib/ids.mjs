// Task and session ids that stay unique across sessions. The counter in .factory/seq
// is the primary source; git history is scanned too so ids are never reused even if
// .factory/ is deleted (approvers add a "Factory-Task: T-xxxx" trailer to commits).
import fs from 'node:fs';
import { git } from './git.mjs';

const ID_IN_GIT = /(?:factory\/|Factory-Task: )T-(\d+)/g;

export function formatTaskId(n) {
  return `T-${String(n).padStart(4, '0')}`;
}

export function highestInText(text) {
  let max = 0;
  for (const match of text.matchAll(ID_IN_GIT)) max = Math.max(max, Number(match[1]));
  return max;
}

function highestInGit(root) {
  const sources = [
    git(['branch', '-a', '--list', '*factory/T-*', '--format=%(refname)'], { cwd: root, allowFail: true }),
    git(['log', '--all', '--format=%s%n%b'], { cwd: root, allowFail: true }),
  ];
  return Math.max(0, ...sources.filter(Boolean).map(highestInText));
}

export function nextTaskId(store) {
  return store.withLock('seq', () => {
    const seqFile = store.path('seq');
    const saved = Number(fs.existsSync(seqFile) ? fs.readFileSync(seqFile, 'utf8').trim() : 0) || 0;
    const local = Math.max(0, ...store.taskIds().map((id) => Number(id.slice(2))));
    const next = Math.max(saved, local, highestInGit(store.root)) + 1;
    const id = formatTaskId(next);
    // Reserve the directory inside the lock so parallel creators never collide.
    fs.mkdirSync(store.taskDir(id), { recursive: true });
    store.writeText(seqFile, `${next}\n`);
    return id;
  });
}

export function nextSessionId(store, now = new Date()) {
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  const prefix = `S-${day}-`;
  const taken = store.sessionIds().filter((id) => id.startsWith(prefix)).map((id) => Number(id.slice(prefix.length)) || 0);
  return `${prefix}${Math.max(0, ...taken) + 1}`;
}
