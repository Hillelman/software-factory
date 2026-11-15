---
name: setup
description: One-time setup for the software factory plugin. Installs the bare /factory, /orchestrator and /create-pr commands as small user-level skills that hand off to this plugin, and checks prerequisites (Node, git, gh).
disable-model-invocation: true
---

1. Run `factory shims install`. It prints JSON with a state for each shim.
   - `installed` or `ok`: done.
   - The command exits non-zero when another skill already uses one of the names (`foreign`). Tell the user which file it is, and ask with AskUserQuestion whether to replace it. If they say yes, run `factory shims install --force`.
2. Check the prerequisites and report each one on a single line:
   - `node --version` must be 20 or newer.
   - `git --version`.
   - `gh --version` and `gh auth status`. If either fails, give the fix (`brew install gh` / `! gh auth login`).
3. Run `factory permissions check --json`. It reports `allowed`, `denied` or `prompt` for `gh pr create` and `gh pr merge`, plus any PreToolUse hooks on Bash. If both are `allowed`, say so and skip to step 4. Otherwise explain in at most four lines: task PRs merge only into the orchestrator branch, guarded by `factory guard-base`; the final PR into the default branch is never merged by the factory; declining means the user merges each task PR by hand. Ask with AskUserQuestion: "Allow (Recommended)" or "Don't allow". On Allow, run `factory permissions allow` (it edits only `~/.claude/settings.json`, makes a timestamped backup first, and never touches deny rules or hooks). Report any deny rule (file and rule) or hook that would still block the commands, and any warning the command printed.
4. Tell the user, in at most four lines: the commands are now `/factory <idea>`, `/orchestrator`, `/create-pr`, plus `/factory:status|pause|resume|cancel|restart|dashboard`. Run `/factory:setup` again after a plugin update if `/factory` reports stale commands.
