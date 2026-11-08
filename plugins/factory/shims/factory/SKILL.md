---
name: factory
description: Start the software factory - check the repo, offer to resume or cancel unfinished tasks, and refine requirements for a new feature before orchestrating parallel task agents. Use when the user runs /factory or asks the factory to build something.
argument-hint: "[what to build]"
---

<!-- factory-shim v{{VERSION}} -->
Invoke the `factory:start` skill with the Skill tool, passing these arguments through unchanged: $ARGUMENTS

If that skill is not available, tell the user the `factory` plugin is not installed or enabled, and that they can install it with `/plugin marketplace add <owner>/software-factory` followed by `/plugin install factory@software-factory`.
