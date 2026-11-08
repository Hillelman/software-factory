---
name: create-pr
description: Opens or refreshes a pull request from the current branch into the repository's default branch, with a brief description and the changes as a list. Works standalone on any branch of any GitHub repo, and is run by the factory orchestrator when all tasks have merged. Never merges.
argument-hint: "[--factory] [extra context]"
---

Create the pull request for the current branch. Be quick and quiet: run the checks, write the PR, and print its URL. Arguments: $ARGUMENTS

## Checks (stop on the first failure, with the fix)

1. `gh --version`. If gh is missing, tell the user to install it (`brew install gh` on macOS, or https://cli.github.com).
2. `gh auth status`. If it fails, tell the user to run `! gh auth login`.
3. Find the default branch: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`, falling back to `git symbolic-ref --short refs/remotes/origin/HEAD`, then to `main`/`master`.
4. If the current branch is the default branch, or HEAD is detached, refuse: "Switch to a feature branch first."
5. `git status --porcelain`. If there are uncommitted changes, list them and ask whether to continue without them. **Never commit them yourself.**
6. Run `git fetch origin <default>`. If `git rev-list --count origin/<default>..HEAD` is `0`, there is nothing to propose, so stop.

## Gather

- Run `git log --no-merges --format='%h %s' origin/<default>..HEAD` and `git diff --stat origin/<default>...HEAD`. Read the diff where the subject lines aren't enough to describe a change.
- **Factory mode** (the argument contains `--factory`, or `.factory/current-session` exists): run `factory session current` and `factory status --json`. Group the changes by task (id, title, task PR link). List any task that is in `error` or `cancelled` under "Not included". If such tasks exist and you were not called with `--factory`, ask once whether to proceed.

## Write

- **Title:** `<type>: <short summary>`, where type is one of feat, fix, refactor, docs, test, chore or perf. Use 72 characters at most.
- **Body:**

```
## Description
<2–4 sentences: what this branch delivers and why>

## Changes
- <one bullet per meaningful change; in factory mode: "<id> <title> (#<task PR>)" with sub-bullets>

## How to test
1. …

## Not included        ← only in factory mode, only if some tasks were not merged
- <id> <title> — <status>: <last error>
```

Add any extra context from the arguments to the Description.

## Publish

1. `git push -u origin HEAD`. This never force-pushes.
2. If `gh pr list --head <branch> --base <default> --state open --json url,number` already returns a PR, refresh it with `gh pr edit <number> --title … --body-file …`. Otherwise run `gh pr create --base <default> --head <branch> --title … --body-file …`.
3. Print the PR URL. **Never merge it.** Merging into the default branch is always the user's call.
