# Changelog

## 0.1.0 — 2026-11-09

First release.

- `/factory`: preflight checks, resume or cancel unfinished tasks, and requirement refinement.
- `/orchestrator`: parallel task runners with the builder → cleaner → checker → tester → approver workflow and a limit of 2 runs per task.
- `/create-pr`: works standalone and never merges.
- `factory` state CLI: an enforced state machine, unique task ids across sessions, worktree lifecycle, and pause/resume/cancel/restart.
- Kanban dashboard: shadcn UI, light and dark modes, responsive layout, LAN access with a token and QR code, per-card notifications, and a previous-sessions toggle.
- Slow-step alerts through a plugin hook and a monitor.
