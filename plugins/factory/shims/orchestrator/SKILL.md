---
name: orchestrator
description: Run the software factory orchestrator - split approved requirements into parallel tasks, spawn a task agent per task, and track them on the kanban dashboard. Use when the user runs /orchestrator or when /factory hands off approved requirements.
argument-hint: "[requirements file or text]"
---

<!-- factory-shim v{{VERSION}} -->
Invoke the `factory:orchestrator` skill with the Skill tool, passing these arguments through unchanged: $ARGUMENTS

If that skill is not available, tell the user the `factory` plugin is not installed or enabled.
