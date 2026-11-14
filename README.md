# Software Factory for Claude Code

An agentic software factory, packaged as a Claude Code plugin. It works like this:

- You describe a feature, and it asks you only the questions that matter.
- It splits the work into tasks that run **in parallel**, each in its own git worktree.
- Every task goes through the same five steps: **builder → cleaner → checker → tester → approver**.
- When a task passes, its PR is merged into your **orchestrator branch**.
- A live kanban board, which you can also open on your phone, shows where everything is.

The factory never merges anything into `main`. When all tasks are done, it opens one PR for you to review and merge.

## Install

```text
/plugin marketplace add Hillelman/software-factory
/plugin install factory@software-factory
/factory:setup
```

`/factory:setup` installs three short commands in `~/.claude/skills`: `/factory`, `/orchestrator` and `/create-pr`. They hand off to the plugin, so plugin updates keep applying. Run it again after an update if `/factory` says the commands are stale.

**Prerequisites:**

- Node 20+, git, and the [GitHub CLI](https://cli.github.com) (`gh auth login`).
- A GitHub remote.
- Any language or stack. The factory detects your format, lint, typecheck and test commands and asks you to confirm them.

## Commands

| Command                                | What it does                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/factory <idea>`                      | Runs the preflight checks: clean tree, gh installed and logged in, not on the default branch. Offers to resume or cancel unfinished tasks. Refines the idea into requirements, then hands off to `/orchestrator`. |
| `/orchestrator [requirements]`         | Splits the requirements into tasks, writes `.factory/tasks/T-xxxx/task.md` for each, opens the dashboard, and runs one background task agent per task, all at once.                                               |
| `/create-pr`                           | Opens or refreshes the PR from the current branch into the default branch, with a description and a list of changes. Works without the factory too. Never merges.                                                 |
| `/factory:status [--all \| id]`        | Shows the task table, or one task's details.                                                                                                                                                                      |
| `/factory:pause <id>`                  | Pauses a task after its current step finishes.                                                                                                                                                                    |
| `/factory:resume <id>`                 | Resumes a paused task at the step where it stopped.                                                                                                                                                               |
| `/factory:cancel <id> [--clean]`       | Cancels a task. With `--clean`, also removes its worktree.                                                                                                                                                        |
| `/factory:restart <id> <instructions>` | Restarts a task from the builder with new instructions and a fresh run budget.                                                                                                                                    |
| `/factory:dashboard [stop]`            | Opens the kanban board, or stops it.                                                                                                                                                                              |

Actions that aren't allowed are refused with a clear message. For example, pausing or restarting a merged task gives _"T-0007 is already merged into factory/x; create a new task instead."_

## How it works

<img width="1024" height="791" alt="Screenshot 2026-11-09 at 9 32 13" src="https://github.com/user-attachments/assets/9e5dbb24-9949-40f2-8e22-d73e57385931" />


```
main session (your model, effort, mode)
└── orchestrator ── splits work, opens dashboard, spawns runners
    ├── task-runner T-0001 (same model)          worktree .factory/worktrees/T-0001
    │   └── builder → cleaner → checker → tester → approver   (sonnet / haiku)
    ├── task-runner T-0002 …
    └── … all in parallel
```

- **Step contract:** each step returns `{ "isApproved": boolean, "errorMessage": string }`. Any `false` sends the task back to the **builder** with that error. A task gets at most **2 runs**, then its status becomes **Error**.
- **What each step does:**

  | Step     | Model  | Responsibility                                                                                                                                                                     |
  | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | builder  | opus   | Implements the task, or fixes the error it was given. It is the only step that writes feature code.                                                                                |
  | cleaner  | haiku  | Runs format, lint and typecheck, and removes dead code. It only makes mechanical, behavior-preserving fixes.                                                                       |
  | checker  | sonnet | Read-only security review of the task's diff: OWASP Top 10, secrets, authz, injection, dependencies.                                                                               |
  | tester   | sonnet | Picks the test layers the change needs: unit, integration, regression, E2E and UI/UX. It may add tests but never changes source code.                                              |
  | approver | sonnet | Checks that the task's Tests are covered (or the task says `No Tests`), commits, opens the PR into the orchestrator branch and merges it. A merge conflict counts as a failed run. |

- **State:** everything lives in `.factory/`, which is added to `.gitignore`. The `factory` CLI is the only thing that writes it, and it refuses illegal transitions, so a crashed session can be resumed. Task ids (`T-0001`, …) are never reused, even across sessions.
- **After a merge:** the runner runs `factory wrapup`, which removes the worktree and deletes the merged branch.
- **When everything has merged:** the orchestrator runs `/create-pr` into `main`. You merge that PR.

### Model overrides

Step models live in `.factory/config.json` (`models.builder` and so on). Task runners always inherit the session's model and effort.

## Dashboard

```text
/factory:dashboard
```

- Five columns: **Backlog**, **In progress**, **Errors**, **Approved** and **Merged**.
- **Cards** show the id, title, current step, progress through the 5 steps, run number, elapsed time and tokens. Each card has its own notification toggle (sound plus toast).
- **Click a card** to open a drawer with each run's step timeline, the step reports, the task file and the full event log.
- **Header:** a light/dark/system theme switch, a toggle that shows tasks from previous sessions, and a **phone button** that shows a QR code for opening the board on another device on your network.
- **Layout:** it adapts to phones (tabs), tablets (horizontal scroll) and desktops (all five columns).
- **Access:** the server listens on your LAN and needs the access token in the link. Requests without it get `401`.
- **Tokens:** these are estimated from Claude Code's subagent transcripts, which are not a documented format, so the numbers are marked `~`.

### Slow-step alerts

When a step runs longer than `stuck_minutes` (default 7, set in the plugin settings), you get a desktop notification with sound, a toast on the dashboard, and a line in your Claude session. Two things check for this:

- an async `PostToolUse` hook, throttled, which fires whenever any agent makes a tool call;
- a background monitor, for steps stuck inside one long command.

## Things to know

- **Permissions:** background agents can't show permission prompts. The orchestrator offers to add an allowlist (git, gh, `factory` and your toolchain) to `.claude/settings.local.json`.
- **Parallelism:** Claude Code allows about 20 concurrent subagents per session, so any tasks beyond that wait in Backlog.
- **Pause:** a pause takes effect between steps. A running step is never interrupted halfway through.
- **Cancel:** cancelling doesn't close a PR that the approver already opened.

## Development

```bash
cd plugins/factory && npm test                      # CLI + state machine (node:test)
cd plugins/factory/dashboard && pnpm i && pnpm typecheck && pnpm lint && pnpm test
pnpm build                                          # dist/ is committed so users need no build step
claude plugin validate plugins/factory --strict
claude --plugin-dir ./plugins/factory               # try it locally
```

Bump `version` in `plugins/factory/.claude-plugin/plugin.json` for every release, and update `CHANGELOG.md`.

## License

MIT
