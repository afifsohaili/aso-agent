# aso-agent

Autonomous AI agent that runs overnight, self-orchestrating through planning, implementation, review, and discovery cycles.

## Installation

```bash
pnpm add -D aso-agent
```

## Usage

### Start a new session

```bash
npx aso-agent "reorganize all tasks according to logical units" \
  --stop-when "all tasks are in appropriate folders"
```

### Resume from notes.yaml

```bash
npx aso-agent --resume
```

### Options

- `--stop-when, -s`: Natural language stop condition
- `--max-iterations, -m`: Maximum iterations (default: 50)
- `--max-time-per-iteration, -t`: Max seconds per iteration (default: 1800)
- `--notes-file, -n`: Path to notes.yaml (default: ./notes.yaml)
- `--resume, -r`: Resume from existing notes.yaml

## How It Works

1. **Discovery**: Analyzes objective and creates a roadmap of phases
2. **Plan**: Breaks down current phase into concrete tasks
3. **Implement**: Executes tasks with mandatory TDD (test first, then code)
4. **Review**: Acts as CI - checks tests, style, security, architecture
5. **Gap Analysis**: Finds missing pieces or incomplete work
6. **Research**: Uses MCPs (web search, browser) to fill knowledge gaps
7. **Stop Check**: Evaluates if `--stop-when` condition is met

The cycle repeats until the stop condition is met or max iterations reached.

## State Management

All state is stored in `notes.yaml` at the repo root:

```yaml
session:
  id: "aso-agent-2024-05-04T10-00-00"
  objective: "..."
  stop_when: "..."
  branch: "aso-agent/2024-05-04T10-00-00"

roadmap:
  - id: 1
    title: "Phase 1"
    status: completed

cycles:
  - cycle: 1
    phase: discovery
    status: completed
    summary: "..."
```

## Git Workflow

- Each session creates a new branch: `aso-agent/<timestamp>`
- One commit per agent invocation
- Failed iterations are still committed (for audit trail)
- No auto-merge to main - user reviews tomorrow

## Architecture

```
packages/aso-agent/
├── src/
│   ├── cli.ts              # Entry point
│   ├── orchestrator.ts     # Main loop
│   ├── agents/             # Agent implementations
│   │   ├── base-agent.ts
│   │   ├── discovery-agent.ts
│   │   ├── planner-agent.ts
│   │   ├── implementer-agent.ts
│   │   ├── reviewer-agent.ts
│   │   ├── gap-analyzer.ts
│   │   ├── researcher-agent.ts
│   │   └── stop-check-agent.ts
│   ├── core/
│   │   ├── notes-manager.ts
│   │   └── git-manager.ts
│   ├── services/
│   │   └── opencode-client.ts
│   └── types/
│       └── index.ts
└── tests/
    ├── notes-manager.test.ts
    └── git-manager.test.ts
```

## Testing

```bash
# Run tests
pnpm test

# Run with watch mode
pnpm test:watch
```

## Requirements

- Node.js 20+
- Git repository
- OpenCode binary (`~/.opencode/bin/opencode`)
