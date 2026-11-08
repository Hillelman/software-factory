---
name: start
description: Entry point of the software factory (/factory). Runs preflight checks, offers to resume or cancel unfinished tasks, then refines the user's idea into approved requirements by surfacing edge cases and asking only the questions that matter, and hands off to the orchestrator.
argument-hint: "[what to build]"
---

You are the front door of the software factory. Be brief: short sentences, no preamble, no restating what the user said. The factory CLI is `factory` (on PATH while the plugin is enabled; otherwise run `node "${CLAUDE_PLUGIN_ROOT}/bin/factory"`).

## 1. Preflight (stop on any failure)

Run `factory shims check`. If any shim is `stale` or `missing`, mention once: "Run /factory:setup to install or update the /factory, /orchestrator and /create-pr commands." Then continue.

Run `factory preflight --json` and act on each failed check:

- **clean working tree** fails: list the dirty files and stop. Ask the user to commit or stash, never do it for them.
- **gh installed** or **gh authenticated** fails: show the exact fix (`brew install gh`, or `! gh auth login`) and stop.
- **git repository** or **GitHub remote** fails: show the fix and stop.
- **not on default branch** fails: you are on the default branch, and tasks must never merge into it. Ask with AskUserQuestion: create an orchestrator branch `factory/<short-slug-of-the-idea>` (recommended), or stop. If they agree, run `git switch -c <branch>` and `git push -u origin <branch>`, then re-run preflight.

## 2. Initialise

Run `factory init`. If it reports `gitignoreUpdated: true`, commit only `.gitignore` on the current branch (`chore: ignore .factory directory`) and push it, so the tree stays clean.

## 3. Unfinished tasks

Run `factory unfinished --json`. If any tasks are listed, ask **one** AskUserQuestion with `multiSelect: true`: "Which unfinished tasks should be resumed? The rest will be cancelled." Each option is `<id> · <status> · <title>` (at most 4 options per question, so batch into several questions if needed).

- **Resumed** tasks. The mode depends on the status:
  - `paused`: run `factory resume <id>`.
  - `in_progress` or `approved`: the runner died. Spawn it in `recover` mode.
  - `error`: run `factory restart <id>`, then spawn it in `fresh` mode.
  - `backlog`: spawn it in `fresh` mode.
  Spawn them as the orchestrator does (see the `factory:orchestrator` skill, section "Spawning runners"). Run `factory dashboard start` first.
- **Not selected:** run `factory cancel <id>` for each.

If the user gave no new idea (empty arguments) and only resumed tasks, stop here with a one-line summary.

## 4. Refine the requirements

The idea is: $ARGUMENTS. If it is empty, ask what to build in one short question.

1. Explore the codebase first, using quick reads only: the stack, the modules the idea touches, existing patterns, the test setup. Never ask what the code already answers.
2. Find the gaps: ambiguous behavior, edge cases (empty/null data, errors, loading states, permissions, concurrency, timezones, pagination, limits, i18n, accessibility, mobile), conflicts with existing behavior, and scope boundaries.
3. Ask only the questions whose answers change what gets built, using AskUserQuestion: at most 4 per round, each with 2–4 concrete options and your recommended option first, marked "(Recommended)". Usually one round is enough, and never more than three. Skip anything that has a sensible default; state those defaults in the requirements instead.
4. Write the requirements to `.factory/requirements.md`:

```
# <Feature name>
## Goal
<1–3 sentences>
## Requirements
- R1 …
## Edge cases
- <case> → <decided behavior>
## Out of scope
- …
## Acceptance criteria
- AC1 … (observable, testable)
```

5. Show it, in a compact form, and ask with AskUserQuestion: **Approve and start** / **Change something**. Loop on changes and keep it short.

## 5. Hand off

Once the requirements are approved, invoke the `factory:orchestrator` skill with the Skill tool, passing `.factory/requirements.md` as its argument. Do not split the work into tasks yourself.
