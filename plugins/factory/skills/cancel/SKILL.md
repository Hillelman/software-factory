---
name: cancel
description: Cancel a software factory task by id. Stops its runner and optionally removes its worktree with --clean.
argument-hint: "<task id> [--clean]"
---

1. Run `factory cancel $ARGUMENTS`. If it fails (for example, the task is already merged or cancelled), show the error exactly and stop.
2. Stop the runner right away if it belongs to this session. Find the background agent named `runner-<id>` (the one you spawned earlier, or listed by the task tools) and stop it with TaskStop. If it isn't found, for example because it was started in another session, that's fine: the runner sees the cancelled state at its next step and exits on its own.
3. Reply with one line: "<id> cancelled." Add "Worktree removed." if `--clean` was passed. Otherwise add "Worktree kept at .factory/worktrees/<id>. Remove it later with `factory clean <id>`."

Note that cancelling does not close a PR the approver may already have opened. Mention the PR link if `factory task show <id> --json` has a `prUrl`.
