# Changelog

## Unreleased

- `factory unfinished --json` always prints `{ tasksInQueue, tasks }`, and the plain output ends with a count summary.
- Windows: `bin/factory.cmd` launcher, and all child processes start with hidden consoles.
- `/factory:setup` checks `gh pr create` and `gh pr merge` permissions and can allow them; new `factory permissions check|allow` (writes to `~/.claude/settings.json` with a timestamped backup). The factory still never merges into main or master.
- The builder reports `hasCode`; documentation-only changes skip the checker and tester, which otherwise run in parallel (`factory step` may print `skip`, `factory end-step` may print `wait`, and `factory resume` adds `steps` when more than one must re-run).
- The approver defaults to Opus in newly created configs.
- Dashboard shows skipped and parallel steps.

## 0.1.0 — 2026-11-09

First release.

- `/factory`: preflight checks, resume or cancel unfinished tasks, and requirement refinement.
- `/orchestrator`: parallel task runners with the builder → cleaner → checker → tester → approver workflow and a limit of 2 runs per task.
- `/create-pr`: works standalone and never merges.
- `factory` state CLI: an enforced state machine, unique task ids across sessions, worktree lifecycle, and pause/resume/cancel/restart.
- Kanban dashboard: shadcn UI, light and dark modes, responsive layout, LAN access with a token and QR code, per-card notifications, and a previous-sessions toggle.
- Slow-step alerts through a plugin hook and a monitor.
