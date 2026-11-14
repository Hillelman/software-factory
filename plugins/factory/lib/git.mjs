import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Shared child-process options. windowsHide stops a console window flashing on Windows for every call.
export const childOptions = (extra = {}) => ({ windowsHide: true, ...extra });

export function run(cmd, args, { cwd, allowFail = false } = {}) {
  try {
    return execFileSync(cmd, args, childOptions({ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
  } catch (err) {
    if (allowFail) return null;
    const stderr = err.stderr?.toString().trim();
    throw new Error(`${cmd} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

export const git = (args, opts) => run('git', args, opts);

// The main checkout root, even when called from inside a task worktree.
export function mainRoot(cwd = process.cwd()) {
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, allowFail: true });
  if (!common) return null;
  return path.basename(common) === '.git' ? path.dirname(common) : git(['rev-parse', '--show-toplevel'], { cwd });
}

export function currentBranch(cwd) {
  return git(['branch', '--show-current'], { cwd, allowFail: true }) || null;
}

export function defaultBranch(cwd) {
  const viaGh = run('gh', ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'], { cwd, allowFail: true });
  if (viaGh) return viaGh;
  const head = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd, allowFail: true });
  if (head) return head.replace(/^origin\//, '');
  for (const name of ['main', 'master']) {
    if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], { cwd, allowFail: true })) return name;
  }
  return 'main';
}

export function dirtyFiles(cwd) {
  const out = git(['status', '--porcelain'], { cwd });
  return out ? out.split('\n').map((l) => l.slice(3)) : [];
}

// Every file the task changed relative to its base branch: commits on the task branch, plus
// uncommitted and untracked work (the builder does not commit). Returns null if git fails.
export function changedFiles(cwd, baseBranch, branch) {
  const committed = git(['diff', '--name-only', `${baseBranch}...${branch}`], { cwd, allowFail: true });
  const uncommitted = git(['diff', '--name-only', 'HEAD'], { cwd, allowFail: true });
  const untracked = git(['ls-files', '--others', '--exclude-standard'], { cwd, allowFail: true });
  if (committed === null || uncommitted === null || untracked === null) return null;
  const lines = [committed, uncommitted, untracked].flatMap((out) => out.split('\n')).map((l) => l.trim()).filter(Boolean);
  return [...new Set(lines)];
}
