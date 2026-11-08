---
name: resume
description: Resume a paused software factory task by id, continuing from the workflow step where it paused.
argument-hint: "<task id>"
---

Run `factory resume $ARGUMENTS`.

- If it prints that the pause request was withdrawn, the task never stopped, so just relay that.
- If it prints JSON (`{"id", "run", "step", "respawn": true}`), spawn the task runner again in the background, with the Agent tool:
  - `subagent_type: "factory:task-runner"`, `run_in_background: true`, `name: "runner-<id>"`, `description: "<id> resume"`
  - prompt:
    ```
    Factory task: <id>
    Project root: <absolute project root>
    Mode: resume:<step>
    ```
  Then say "<id> resumed at <step> (run <run>)." If the dashboard isn't running (`factory dashboard url` fails), run `factory dashboard start`.
- If it fails, show the CLI's error exactly (for example, a merged task can't be resumed). Do not work around it.
