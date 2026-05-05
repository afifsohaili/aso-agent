# ASO Agent - Autonomous Self-Orchestrating AI Agent

An autonomous AI agent CLI that runs overnight, self-orchestrates through planning/implementation/review cycles, maintains a `notes.yaml` as source of truth, and stops when a `--stop-when` condition is met.

## Features

- **Self-orchestrating**: Cycles through Discovery → Plan → Implement → Review → Gap → Research → Stop-Check
- **Persistent state**: `notes.yaml` acts as source of truth across sessions (survives interruptions)
- **TDD mandatory**: Implementer writes tests first, runs them, commits results
- **Git discipline**: Auto-creates branches, commits per agent invocation
- **Resume support**: Ctrl+C and resume later from `notes.yaml`
- **Debug mode**: `--debug` flag for verbose logging

## Installation

```bash
pnpm install
pnpm build
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
npx aso-agent --resume --notes-file ./notes.yaml
```

### Debug Mode

```bash
npx aso-agent "implement feature X" --stop-when "feature X works" --debug
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `objective` | The vague instruction for the agent | (required) |
| `-s, --stop-when` | Stop condition in natural language | (required for new) |
| `-m, --max-iterations` | Maximum iterations | 50 |
| `-t, --max-time-per-iteration` | Max time per iteration (seconds) | 1800 |
| `-n, --notes-file` | Path to notes.yaml | ./notes.yaml |
| `-r, --resume` | Resume from existing notes.yaml | false |
| `-d, --debug` | Enable verbose debug logging | false |

## Agent Cycle

```
Discovery → Plan → Implement → Review → Gap → Research → Stop-Check
     ↑_____________________________________________________|
```

- **Discovery**: Analyzes objective, creates/evaluates roadmap
- **Plan**: Breaks down current phase into tasks
- **Implement**: Executes tasks with mandatory TDD
- **Review**: CI-like review of code quality and tests
- **Gap**: Identifies missing pieces
- **Research**: Uses MCPs (web search, browser) to fill gaps
- **Stop-Check**: Evaluates if `--stop-when` condition is met

## Running in Docker (Recommended for Security)

For security isolation, run the agent inside a Docker container:

### Quick Start

```bash
# Build the image (from repo root)
docker build -t aso-agent .

# Run on current directory
docker run -it --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  aso-agent \
  "your objective here" \
  --stop-when "your stop condition"
```

### Building the Image

The Dockerfile at the repo root builds everything needed:

```bash
docker build -t aso-agent .
```

This image:
- Uses `node:24-alpine` (lightweight, secure)
- Installs OpenCode CLI automatically
- Includes git and other required tools
- Builds the agent from source

### Security Features

- **Isolated filesystem**: Only mounted volumes are accessible
- **Ephemeral**: Use `--rm` to clean up after run
- **Resource limits**: Add `--memory` and `--cpus` flags:
  ```bash
  docker run --memory=4g --cpus=2 ...
  ```
- **Read-only mounts**: Mount sensitive directories read-only if needed:
  ```bash
  docker run -v ~/.opencode:/root/.opencode:ro ...
  ```

### Persisting Notes

By default, `notes.yaml` is written inside the container. To persist it across runs:

```bash
# Notes will be saved in current directory
docker run -it --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  aso-agent \
  "your objective" \
  --stop-when "your stop condition" \
  --notes-file /workspace/notes.yaml
```

### Resume After Crash

Since notes.yaml is on your host filesystem, you can resume even if the container crashes:

```bash
docker run -it --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  aso-agent \
  --resume \
  --notes-file /workspace/notes.yaml
```

## Architecture

```
packages/aso-agent/
├── src/
│   ├── cli.ts              # Entry point
│   ├── orchestrator.ts     # Main loop
│   ├── agents/
│   │   ├── base-agent.ts   # Abstract base
│   │   ├── discovery-agent.ts
│   │   ├── planner-agent.ts
│   │   ├── implementer-agent.ts
│   │   ├── reviewer-agent.ts
│   │   ├── gap-analyzer.ts
│   │   ├── researcher-agent.ts
│   │   └── stop-check-agent.ts
│   ├── core/
│   │   ├── notes-manager.ts    # notes.yaml I/O
│   │   ├── git-manager.ts      # Git operations
│   │   └── logger.ts           # Logging utility
│   ├── services/
│   │   └── opencode-client.ts  # OpenCode API
│   └── types/
│       └── index.ts
├── tests/
│   ├── notes-manager.test.ts
│   └── git-manager.test.ts
└── bin/
    └── aso-agent.mjs
```

## Development

```bash
cd packages/aso-agent

# Run tests
pnpm test

# Run with watch
pnpm test:watch

# Build
pnpm build

# Type check
pnpm typecheck
```

## License

MIT
