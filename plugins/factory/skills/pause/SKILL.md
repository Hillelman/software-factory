---
name: pause
description: Pause a running software factory task by id. The task stops at its next workflow step boundary and can be resumed later.
argument-hint: "<task id>"
---

Run `factory pause $ARGUMENTS`.

- If it succeeds, say: "<id> will pause after its current step (<step>) finishes. Resume with /factory:resume <id>." Get the current step from `factory task show <id> --json`.
- If it fails, show the CLI's error exactly. For example, merged, cancelled and not-started tasks cannot be paused. Do not try to work around it.

A step that is already running is never interrupted halfway through, because that would leave the worktree in an unknown state.
