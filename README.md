# ASO Agent - Autonomous Self-Orchestrating AI Agent

An autonomous AI agent CLI that runs overnight, self-orchestrates through implement/stop-check iterations, maintains a `notes.yaml` as source of truth, and stops when a `--stop-when` condition is met.

## Features

- **Self-orchestrating**: Iterates through Implement → Stop-Check until done
- **Persistent state**: `notes.yaml` acts as source of truth across sessions (survives interruptions)
- **TDD mandatory**: Implementer writes tests first, runs them, commits results
- **Git discipline**: Auto-creates branches, commits per iteration
- **Resume support**: Ctrl+C and resume later from `notes.yaml`
- **Debug mode**: `--debug` flag for verbose logging

## Prerequisites

- [OpenCode CLI](https://opencode.ai/) — The agent uses OpenCode's API to run AI sessions. Make sure it's installed and available in your `$PATH`.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the agent (starts its own OpenCode server automatically)
npx aso-agent "refactor codebase" \
  --stop-when "code coverage is above 80%"
```

## Usage

### Basic

```bash
npx aso-agent "reorganize all tasks according to logical units" \
  --stop-when "all tasks are in appropriate folders"
```

### With Options

```bash
npx aso-agent "refactor codebase" \
  --stop-when "code coverage is above 80%" \
  --max-iterations 50 \
  --max-time-per-iteration 1800 \
  --notes-file ./notes.yaml
```

### Resume

```bash
# Auto-resume from the latest notes file
npx aso-agent

# Or resume from a specific file
npx aso-agent --resume --notes-file ./notes.yaml
```

### Debug Mode

```bash
npx aso-agent "implement feature X" --stop-when "feature X works" --debug
```

### Log to File

```bash
npx aso-agent "implement feature X" \
  --stop-when "feature X works" \
  --debug \
  --log-file ./aso-agent.log
```

### Local Development (PNPM Link)

```bash
# From the monorepo root
cd packages/aso-agent
pnpm link --global

# Now use anywhere on your system
aso-agent "reorganize all tasks according to logical units" \
  --stop-when "all tasks are in appropriate folders"
```

To unlink later:
```bash
pnpm unlink --global
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `objective` | The vague instruction for the agent | (required for new sessions) |
| `-s, --stop-when` | Stop condition in natural language | (required for new) |
| `-m, --max-iterations` | Maximum iterations | 50 |
| `-t, --max-time-per-iteration` | Max time per iteration (seconds) | 1800 |
| `-n, --notes-file` | Path to notes.yaml | auto-derived from branch |
| `-r, --resume` | Resume from existing notes.yaml | false |
| `-d, --debug` | Enable verbose debug logging | false |
| `-l, --log-file` | Write logs to file | (none) |
| `prompts list` | List built-in prompt names | — |
| `prompts export` | Export prompts to `.aso-agent/prompts/` | — |

## Agent Loop

Each iteration the agent performs two steps:

1. **Implementer**: Writes tests, implements the change, runs tests, commits
2. **Stop-Check**: Evaluates if the `--stop-when` condition is met

The loop continues until the stop condition is met or `max-iterations` is reached.

## Running in Docker (Recommended for Security)

```bash
# Build the image
docker build -t aso-agent .

# Run on current directory
docker run -it --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  aso-agent \
  "your objective here" \
  --stop-when "your stop condition"
```

The Dockerfile uses Alpine Linux and automatically installs OpenCode CLI. See `packages/aso-agent/README.md` for full Docker documentation (persisting notes, saving logs, connecting to PostgreSQL, resuming after crashes).

## Packages

### `packages/aso-agent`

The core autonomous agent CLI. See above for usage.

### `packages/aso-agent-opencode-hooks`

An OpenCode plugin that preserves critical implementation-stage instructions across context compaction events.

When OpenCode compacts the conversation history (due to context window limits), the detailed implementer prompt can be lost. This plugin injects the core instruction back into the compaction summary, ensuring the agent continues to work in small, focused increments rather than tackling vague big goals.

```typescript
import { PreserveInstructions } from 'aso-agent-opencode-hooks'

// Register with your OpenCode setup
```

## Development

```bash
# Run web app
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build

# Lint
pnpm lint

# Run agent tests
pnpm --filter aso-agent test
```

## License

MIT
