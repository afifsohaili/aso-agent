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
| `objective` | The vague instruction for the agent | (required) |
| `-s, --stop-when` | Stop condition in natural language | (required for new) |
| `-m, --max-iterations` | Maximum iterations | 50 |
| `-t, --max-time-per-iteration` | Max time per iteration (seconds) | 1800 |
| `-n, --notes-file` | Path to notes.yaml | ./notes.yaml |
| `-r, --resume` | Resume from existing notes.yaml | false |
| `-d, --debug` | Enable verbose debug logging | false |
| `-l, --log-file` | Write logs to file | (none) |
| `prompts list` | List built-in prompt names | — |
| `prompts export` | Export prompts to `.aso-agent/prompts/` | — |

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

## Customizing Prompts

Each agent uses a prompt template loaded from external `.md` files. You can export, inspect, and override these prompts per repository.

### Export Prompts

Export the built-in prompts to `.aso-agent/prompts/` so you can customize them:

```bash
aso-agent prompts export
```

This creates `.aso-agent/prompts/` in your current directory with all 7 prompt files:

```
.aso-agent/
└── prompts/
    ├── discovery.md
    ├── planner.md
    ├── implementer.md
    ├── reviewer.md
    ├── gap-analyzer.md
    ├── researcher.md
    └── stop-check.md
```

### How Overrides Work

When the agent runs, it checks for `.aso-agent/prompts/{agent-name}.md` first. If found, it uses your custom version. Otherwise, it falls back to the built-in prompt.

**Debug output shows which source is used:**

```bash
# With --debug flag
[prompt-loader] Using OVERRIDDEN prompt for discovery: .aso-agent/prompts/discovery.md
[prompt-loader] Using built-in prompt for planner: dist/prompts/planner.md
```

### Available Placeholder Variables

Prompts use `{{variable}}` placeholders that are populated at runtime. Here are the variables available for each agent:

#### Discovery Agent (`discovery.md`)

No dynamic variables. The prompt is static.

#### Planner Agent (`planner.md`)

| Variable | Description |
|----------|-------------|
| `{{phase_title}}` | Title of the current roadmap phase |
| `{{phase_description}}` | Description of the current roadmap phase |

#### Implementer Agent (`implementer.md`)

| Variable | Description |
|----------|-------------|
| `{{phase_title}}` | Title of the current roadmap phase |
| `{{phase_description}}` | Description of the current roadmap phase |
| `{{plan_tasks}}` | Numbered list of tasks from the planner |

#### Reviewer Agent (`reviewer.md`)

| Variable | Description |
|----------|-------------|
| `{{phase_title}}` | Title of the current roadmap phase |
| `{{implementation_summary}}` | Summary of what was implemented |
| `{{files_changed}}` | List of files changed with descriptions |
| `{{test_results}}` | Test output and pass/fail status |

#### Gap Analyzer Agent (`gap-analyzer.md`)

| Variable | Description |
|----------|-------------|
| `{{phase_title}}` | Title of the current roadmap phase |
| `{{implementation_summary}}` | Summary of what was implemented |
| `{{review_findings}}` | Numbered list of review findings |

#### Researcher Agent (`researcher.md`)

| Variable | Description |
|----------|-------------|
| `{{gaps}}` | Numbered list of gaps to research |

#### Stop Check Agent (`stop-check.md`)

| Variable | Description |
|----------|-------------|
| `{{stop_when}}` | The stop condition from session config |

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
│   ├── cli.ts                  # Entry point
│   ├── orchestrator.ts         # Main loop
│   ├── agents/
│   │   ├── base-agent.ts       # Abstract base with prompt loading
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
│   │   ├── prompt-loader.ts    # Prompt template loading
│   │   └── logger.ts           # Logging utility
│   ├── prompts/                # Built-in prompt templates (.md files)
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
