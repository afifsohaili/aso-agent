# Autonomous AI Agent - Implementation Plan

## Overview
Build an autonomous AI agent CLI (inspired by GNHF) that runs overnight, accepts vague instructions, self-orchestrates through planning/implementation/review cycles, maintains a `notes.md` source of truth, and continues until a `--stop-when` condition is met.

## Key Features
- **Self-orchestrating**: Spawns different agent types (planner, implementer, reviewer, researcher) based on current phase
- **Persistent state**: `notes.md` acts as source of truth across sessions (survives interruptions)
- **Stop-when evaluation**: Natural language condition checked after each iteration
- **MCP integration**: Uses web search, browser, and other MCPs for research
- **Resilient**: Handles service interruptions, can resume from `notes.md`

## Architecture

```
packages/agent/
├── src/
│   ├── cli.ts                    # Entry point, argument parsing
│   ├── orchestrator.ts           # Main loop, phase management
│   ├── agents/
│   │   ├── base-agent.ts         # Abstract base for all agents
│   │   ├── planner-agent.ts      # Breaks down vague instructions
│   │   ├── implementer-agent.ts  # Executes tasks via OpenCode API
│   │   ├── reviewer-agent.ts     # Evaluates what was done
│   │   ├── gap-analyzer.ts       # Finds missing pieces
│   │   └── researcher-agent.ts   # Uses MCPs to find info
│   ├── core/
│   │   ├── notes-manager.ts      # notes.md read/write/append
│   │   ├── state-manager.ts      # Session state persistence
│   │   ├── stop-condition.ts     # Evaluates stop-when
│   │   └── cycle-manager.ts      # Manages phase transitions
│   ├── services/
│   │   ├── opencode-client.ts    # OpenCode API integration
│   │   ├── mcp-client.ts         # MCP server connections
│   │   └── git-manager.ts        # Git operations (branch, commit)
│   └── types/
│       └── index.ts              # Shared types
├── bin/
│   └── agent.ts                  # CLI executable
├── tests/
│   └── ...                       # Feature tests
├── package.json
└── tsconfig.json
```

## Implementation Phases

### Phase 1: Foundation & Types (PR 1)
- [ ] Create package structure (`packages/agent/`)
- [ ] Set up TypeScript, build config, CLI entry
- [ ] Define core types (Agent, Phase, CycleState, NotesEntry, etc.)
- [ ] Implement `notes-manager.ts` - read/write/append to `notes.md`
- [ ] Implement `state-manager.ts` - JSON state persistence
- [ ] Implement `git-manager.ts` - branch creation, commits
- [ ] Write tests for core utilities

### Phase 2: Agent Framework (PR 2)
- [ ] Implement `base-agent.ts` with common interface
- [ ] Implement `planner-agent.ts` - creates implementation plan
- [ ] Implement `implementer-agent.ts` - executes via OpenCode
- [ ] Implement `reviewer-agent.ts` - evaluates results
- [ ] Implement `gap-analyzer.ts` - identifies missing work
- [ ] Implement `researcher-agent.ts` - uses web search MCP
- [ ] Write integration tests for agent flows

### Phase 3: Orchestrator & Stop Conditions (PR 3)
- [ ] Implement `cycle-manager.ts` - phase transitions (plan→implement→review→gap→research)
- [ ] Implement `stop-condition.ts` - evaluates natural language stop-when
- [ ] Implement `orchestrator.ts` - main loop with resume support
- [ ] Implement `opencode-client.ts` - API integration for self-control
- [ ] Implement `mcp-client.ts` - MCP server management
- [ ] CLI argument parsing (`--stop-when`, `--max-iterations`, etc.)
- [ ] Write end-to-end tests for full cycle

### Phase 4: Integration & Polish (PR 4)
- [ ] Self-discovery logic (determine next agent from notes)
- [ ] Error handling & retry with exponential backoff
- [ ] Progress reporting & logging
- [ ] Resume from interruption (read notes.md, determine state)
- [ ] Documentation & examples
- [ ] Final integration tests

## Agent Cycle Flow

```
┌─────────────────┐
│   User Input    │  (vague instruction + --stop-when)
└────────┬────────┘
         ▼
┌─────────────────┐
│  Planner Agent  │  → Creates detailed plan, writes to notes.md
└────────┬────────┘
         ▼
┌─────────────────┐
│Implementer Agent│  → Executes tasks using OpenCode API
└────────┬────────┘
         ▼
┌─────────────────┐
│ Reviewer Agent  │  → Evaluates what was done vs planned
└────────┬────────┘
         ▼
┌─────────────────┐
│  Gap Analyzer   │  → Finds missing pieces, adds to notes.md
└────────┬────────┘
         ▼
┌─────────────────┐
│Researcher Agent │  → Uses MCPs to find info for gaps (optional)
└────────┬────────┘
         ▼
┌─────────────────┐
│ Stop Condition  │  → Evaluates if stop-when is met
│   Evaluator     │
└────────┬────────┘
    yes  │      │  no
         ▼      ▼
    ┌────────┐  ┌─────────────────┐
    │  STOP  │  │  Self-Discovery │  → Determine next phase/agent
    └────────┘  └────────┬────────┘
                         │
                         └───────────────────────┐
                                                    │
                         ┌────────────────────────┘
                         ▼
              Continue to appropriate agent
```

## Notes.md Format

```markdown
# Agent Session Notes

## Session: <session-id>
Started: <timestamp>
Objective: <user's vague instruction>
Stop When: <stop condition>

## Phase: <current-phase>
Iteration: <n>

### Plan (Iteration N)
- [ ] Task 1
- [ ] Task 2

### Implementation (Iteration N)
Completed:
- Task 1: <summary>
- Task 2: <summary>
Files Changed:
- <file-path>: <description>

### Review (Iteration N)
Status: <pass/fail/partial>
Findings:
- <finding 1>
- <finding 2>

### Gaps (Iteration N)
- <gap 1>
- <gap 2>

### Research (Iteration N)
- <finding 1>
- <finding 2>

## Summary
Current State: <description>
Next Phase: <phase>
Next Agent: <agent-type>
```

## CLI Interface

```bash
# Basic usage
npx @monorepo/agent "reorganize all tasks according to logical units" --stop-when "all tasks are in appropriate folders"

# With options
npx @monorepo/agent "refactor codebase" \
  --stop-when "code coverage is above 80%" \
  --max-iterations 50 \
  --notes-file ./custom-notes.md \
  --branch agent/refactor-session

# Resume from notes.md
npx @monorepo/agent --resume ./notes.md
```

## Testing Strategy
- Unit tests for each manager/agent
- Integration tests for phase transitions
- E2E tests with mocked OpenCode API
- Test stop-when evaluation with various conditions

## Open Questions
1. Should we use a database for state or stick to file-based (notes.md + JSON)?
2. How does the implementer agent actually call OpenCode API? (Need to check OpenCode's programmatic API)
3. Should we support multiple concurrent agents or sequential only?
4. What's the minimum viable version for first release?

## Progress Tracking
| Phase | Status | PR |
|-------|--------|-----|
| Foundation & Types | 🔲 Not Started | #1 |
| Agent Framework | 🔲 Not Started | #2 |
| Orchestrator | 🔲 Not Started | #3 |
| Integration | 🔲 Not Started | #4 |
