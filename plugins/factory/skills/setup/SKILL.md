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
3. Tell the user, in at most four lines: the commands are now `/factory <idea>`, `/orchestrator`, `/create-pr`, plus `/factory:status|pause|resume|cancel|restart|dashboard`. Run `/factory:setup` again after a plugin update if `/factory` reports stale commands.
