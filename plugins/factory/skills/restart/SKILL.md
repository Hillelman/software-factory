---
name: restart
description: Restart a software factory task by id with new instructions. Resets its run budget and starts the workflow again from the builder. Works for tasks in error, cancelled or paused.
argument-hint: "<task id> <new instructions>"
---

The first word of `$ARGUMENTS` is the task id, and the rest is the new instructions.

1. If there are no instructions, ask for them in one short question. An empty restart is allowed only if the user confirms.
2. Run `factory restart <id> --prompt '<instructions>'`, quoting safely. The CLI appends the instructions to the task file under "Restart instructions", where they override earlier text, and resets the task to backlog with a fresh run budget.
   - If it fails, show the error exactly and stop. A merged task cannot be restarted: suggest creating a new task with `/factory`. A running task has to be paused or cancelled first.
3. Spawn the runner in the background with the Agent tool: `subagent_type: "factory:task-runner"`, `run_in_background: true`, `name: "runner-<id>"`, `description: "<id> restart"`, and this prompt:
   ```
   Factory task: <id>
   Project root: <absolute project root>
   Mode: fresh
   ```
   If the dashboard isn't running, start it first with `factory dashboard start`.
4. Reply: "<id> restarted from the builder."
