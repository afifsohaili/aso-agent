# ASO Agent - Autonomous Self-Orchestrating AI Agent

An autonomous AI agent CLI that runs overnight, self-orchestrates through implement/stop-check iterations, maintains a `notes.yaml` as source of truth, and stops when a `--stop-when` condition is met.

## Features

- **Self-orchestrating**: Iterates through Implement → Stop-Check until done
- **Persistent state**: `notes.yaml` acts as source of truth across sessions (survives interruptions)
- **TDD mandatory**: Implementer writes tests first, runs them, commits results
- **Git discipline**: Auto-creates branches, commits per iteration
- **Resume support**: Ctrl+C and resume later from `notes.yaml`
- **Debug mode**: `--debug` flag for verbose logging

## Installation

```bash
pnpm install
pnpm build
```

## Usage

### Local Development (PNPM Link)

The easiest way to use aso-agent during development:

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

Or just omit the objective to auto-resume from the latest notes file:

```bash
npx aso-agent
```

### Debug Mode

```bash
npx aso-agent "implement feature X" --stop-when "feature X works" --debug
```

### Log to File

When running in Docker or detached mode, save logs to a file:

```bash
aso-agent "implement feature X" \
  --stop-when "feature X works" \
  --debug \
  --log-file ./aso-agent.log
```

This creates a persistent log file with timestamps that survives container restarts.

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

## Customizing Prompts

Each agent uses a prompt template loaded from external `.md` files. You can export, inspect, and override these prompts per repository.

### Export Prompts

Export the built-in prompts to `.aso-agent/prompts/` so you can customize them:

```bash
aso-agent prompts export
```

This creates `.aso-agent/prompts/` in your current directory with 2 prompt files:

```
.aso-agent/
└── prompts/
    ├── implementer.md
    └── stop-check.md
```

### How Overrides Work

When the agent runs, it checks for `.aso-agent/prompts/{agent-name}.md` first. If found, it uses your custom version. Otherwise, it falls back to the built-in prompt.

**Debug output shows which source is used:**

```bash
# With --debug flag
[prompt-loader] Using OVERRIDDEN prompt for implementer: .aso-agent/prompts/implementer.md
[prompt-loader] Using built-in prompt for stop-check: dist/prompts/stop-check.md
```

### Available Placeholder Variables

Prompts use `{{variable}}` placeholders that are populated at runtime. Here are the variables available for each agent:

#### Implementer Agent (`implementer.md`)

| Variable | Description |
|----------|-------------|
| `{{previous_entries}}` | Summary of previous implementation steps |

#### Stop-Check Agent (`stop-check.md`)

| Variable | Description |
|----------|-------------|
| `{{stop_when}}` | The stop condition from session config |
| `{{previous_entries}}` | Summary of all previous steps |
| `{{git_log}}` | Git log since the session branch was created |

### Tips for Customization

- Edit the `.md` files directly — no rebuild needed
- Use `--debug` to confirm your overrides are loading
- Keep `{{variables}}` intact or they will appear as literal text in the prompt
- Remove `.aso-agent/prompts/` to revert to built-in prompts

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

### Saving Logs

When running in Docker, logs are lost when the container exits. Use `--log-file` to persist them:

```bash
docker run -it --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  aso-agent \
  "your objective" \
  --stop-when "your stop condition" \
  --debug \
  --log-file /workspace/aso-agent.log

# View logs after the container exits
cat ./aso-agent.log
```

### Connecting to Local PostgreSQL

If your app uses PostgreSQL running on your host machine, use `host.docker.internal`:

```bash
# On Mac/Windows - this maps host.docker.internal to your host
docker run -it --rm \
  -v $(pwd):/workspace \
  -v ~/.opencode:/root/.opencode \
  --add-host=host.docker.internal:host-gateway \
  -w /workspace \
  aso-agent \
  "your objective here" \
  --stop-when "your stop condition"
```

Then update your app's database config to use `host.docker.internal` instead of `localhost`:

```env
# .env or database config
DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/dbname
```

**Why this is needed**: Inside Docker, `localhost` refers to the container itself, not your host machine. `host.docker.internal` is a special DNS name that resolves to your host.

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
│   ├── cli.ts                  # Entry point, arg parsing, session lifecycle
│   ├── orchestrator.ts         # Main loop: implement → stop-check
│   ├── agents/
│   │   ├── base-agent.ts       # Abstract base with prompt loading
│   │   ├── implementer-agent.ts  # Writes tests, implements, commits
│   │   └── stop-check-agent.ts   # Evaluates stop condition
│   ├── core/
│   │   ├── notes-manager.ts    # notes.yaml I/O
│   │   ├── git-manager.ts      # Git operations
│   │   ├── prompt-loader.ts    # Prompt template loading
│   │   └── logger.ts           # Logging utility
│   ├── prompts/                # Built-in prompt templates (.md files)
│   ├── services/
│   │   └── opencode-client.ts  # OpenCode API
│   └── types/
│       └── index.ts
├── tests/
│   ├── agents.test.ts
│   ├── cli-helpers.test.ts
│   ├── git-manager.test.ts
│   ├── logger.test.ts
│   ├── notes-manager.test.ts
│   ├── opencode-client.test.ts
│   ├── orchestrator.test.ts
│   └── prompt-loader.test.ts
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
