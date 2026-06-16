---
name: aso-agent
description: Report aso-agent step completion using CLI commands
---

## When to use this skill

Use this skill whenever you are operating inside an aso-agent session. The
aso-agent orchestrator will send you a task, let you work, and expect you to
report the outcome by running a specific CLI command at the end of your turn.

## Commands

### 1. After implementing a step

When you finish a focused implementation step, run:

```bash
aso-agent report-step --summary "<one-line summary>" --tests-passed <true|false> --files-changed '[{"path":"<file>","description":"<change>"}]'
```

Rules:
- Summary must be a single concise sentence.
- tests-passed must be true only if ALL project tests passed.
- files-changed must be valid JSON. Use an empty array if no files changed.

### 2. After evaluating the stop condition

When you finish evaluating whether to stop, run:

```bash
aso-agent stop-check --should-stop <true|false> --reason "<brief explanation>"
```

Rules:
- should-stop is true only if the session stop condition is clearly met.
- reason explains the decision.

### 3. After analyzing gaps

When you finish gap analysis, run:

```bash
aso-agent gap-report --gaps '["<gap 1>", "<gap 2>"]' --summary "<brief summary>"
```

Rules:
- gaps is a JSON array of strings.
- Use an empty array if no gaps remain.
- Each gap must be specific and actionable.

## Important

Do NOT output YAML, JSON, or any other structured format in your chat response to
report results. Always use the CLI command. The orchestrator reads the result
from the command's side effects.
