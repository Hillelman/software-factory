---
name: create-pr
description: Open (or refresh) a pull request from the current branch into the repository's default branch, with a brief description and a list of changes. Works with or without the software factory. Use when the user runs /create-pr or asks to open the PR for this branch.
argument-hint: "[extra context for the description]"
---

<!-- factory-shim v{{VERSION}} -->
Invoke the `factory:create-pr` skill with the Skill tool, passing these arguments through unchanged: $ARGUMENTS

If that skill is not available, tell the user the `factory` plugin is not installed or enabled.
