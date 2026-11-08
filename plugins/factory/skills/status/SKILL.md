---
name: status
description: Show the software factory's tasks with their status, current workflow step, run and elapsed time. Use when the user asks how the factory or a task is doing.
argument-hint: "[--all | <task id>]"
---

- If the argument is a task id (such as `T-0007`), run `factory task show <id>` and summarise it in at most five lines: the status, step, run, PR link, the last error if there is one, and the most recent events.
- Otherwise run `factory status $ARGUMENTS`. `--all` includes previous sessions. Print the table as returned, followed by one line with the dashboard URL from `factory dashboard url`, or "dashboard not running: /factory:dashboard".

If a command fails, show its error message exactly as printed.
