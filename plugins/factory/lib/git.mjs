import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function run(cmd, args, { cwd, allowFail = false } = {}) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
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
