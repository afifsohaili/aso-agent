# Autonomous AI Agent Research

## Executive Summary

This document catalogs research on autonomous AI coding agents, with focus on:
- **OpenCode**: The AI coding assistant we're building on top of
- **GNHF (Good Night Have Fun)**: The primary reference architecture
- **Nonstop Agent**: Anthropic-inspired 2-agent pattern
- **Other frameworks**: Claude Code, Devin, Codex

---

## 1. OpenCode Architecture

### 1.1 Overview

OpenCode is a terminal-based AI coding assistant with a full HTTP API. It can run in two modes:
- **TUI mode**: Interactive terminal UI (default)
- **Server mode**: Headless HTTP server (`opencode serve`)

### 1.2 CLI Commands

```
opencode [project]              # Start TUI (default)
opencode serve                  # Start headless server
opencode run [message..]        # Run with a message
opencode attach <url>           # Attach to running server
opencode session                # Manage sessions
opencode agent                  # Manage agents
opencode models [provider]      # List models
opencode stats                  # Show token usage
opencode export [sessionID]     # Export session data
opencode providers              # Manage AI providers
opencode mcp                    # Manage MCP servers
opencode acp                    # Start ACP server
opencode db                     # Database tools
```

### 1.3 Server Mode (`opencode serve`)

```bash
opencode serve \
  --hostname 127.0.0.1 \
  --port 0 \
  --print-logs \
  --log-level DEBUG
```

Options:
- `--port`: Port to listen on (default: 0 = random)
- `--hostname`: Hostname (default: 127.0.0.1)
- `--mdns`: Enable mDNS discovery
- `--cors`: Additional CORS domains
- `--pure`: Run without external plugins

Health check endpoint: `GET /global/health`

### 1.4 Official SDK: `@opencode-ai/sdk`

**Package Info:**
- Name: `@opencode-ai/sdk`
- Latest: `1.14.33`
- Size: ~515KB unpacked
- Exports: `client`, `server`, `process`, `v2/client`, `v2/data`

**Key Capabilities:**

```typescript
import { createOpencodeClient } from '@opencode-ai/sdk';

const client = createOpencodeClient({
  directory: '/path/to/project'
});
```

**API Surface (v2 SDK):**

| Class | Methods | Purpose |
|-------|---------|---------|
| `Global` | `health()`, `event()`, `dispose()`, `upgrade()`, `config` | Server-wide operations |
| `Auth` | `remove()`, `set()` | Credential management |
| `App` | `log()`, `agents()`, `skills()` | Application features |
| `Project` | `list()`, `current()`, `initGit()`, `update()` | Project management |
| `Pty` | `shells()`, `list()`, `create()`, `remove()`, `get()`, `update()`, `connect()` | Terminal sessions |
| `Config` | `get()`, `update()`, `providers()` | Configuration |
| `Tool` | `ids()`, `list()` | Tool discovery |
| `Worktree` | `list()`, `create()`, `remove()`, `reset()` | Git worktrees |
| `Session` | `list()`, `create()`, `status()`, `delete()`, `get()`, `update()`, `children()`, `todo()`, `init()`, `fork()`, `abort()`, `unshare()`, `share()`, `diff()`, `summarize()`, `messages()`, `prompt()`, `message()`, `promptAsync()`, `command()`, `shell()`, `revert()`, `unrevert()` | Session lifecycle |
| `File` | `list()`, `read()`, `status()` | File operations |
| `Find` | `text()`, `files()`, `symbols()` | Code search |
| `Mcp` | `status()`, `add()`, `connect()`, `disconnect()`, `auth` | MCP servers |
| `Lsp` | `status()` | LSP integration |
| `Event` | `subscribe()` | SSE events |

**Creating a Session:**

```typescript
const session = await client.session.create({
  directory: '/path/to/project',
  permission: [
    { permission: '*', pattern: '*', action: 'allow' }
  ]
});
// Returns: { id: string }
```

**Sending a Prompt:**

```typescript
const result = await client.session.prompt({
  sessionID: session.id,
  parts: [
    { type: 'text', text: 'Your prompt here' }
  ],
  format: {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        summary: { type: 'string' }
      },
      required: ['success', 'summary']
    },
    retryCount: 1
  },
  model: {
    providerID: 'openai',
    modelID: 'gpt-4o'
  }
});
```

**Structured Output Format:**

```typescript
type OutputFormat = 
  | { type: 'text' }
  | { type: 'json_schema'; schema: JsonSchema; retryCount?: number };
```

**Async Prompt (non-blocking):**

```typescript
await client.session.promptAsync({
  sessionID: session.id,
  parts: [{ type: 'text', text: '...' }]
});
// Returns immediately, process in background
```

**Streaming Events:**

```typescript
const events = await client.event.subscribe();
// Server-sent events for real-time updates
```

**Server Management:**

```typescript
import { createOpencodeServer } from '@opencode-ai/sdk/server';

const server = await createOpencodeServer({
  hostname: '127.0.0.1',
  port: 0, // random port
  timeout: 30000
});
// Returns: { url: string, close(): void }
```

### 1.5 Message Types

```typescript
interface UserMessage {
  id: string;
  sessionID: string;
  role: 'user';
  time: { created: number };
  agent: string;
  model: { providerID: string; modelID: string };
  format?: OutputFormat;
  system?: string;
  tools?: { [key: string]: boolean };
}

interface AssistantMessage {
  id: string;
  sessionID: string;
  role: 'assistant';
  time: { created: number; completed?: number };
  error?: ProviderAuthError | UnknownError | MessageOutputLengthError | 
          MessageAbortedError | StructuredOutputError | ContextOverflowError | ApiError;
  parentID: string;
  modelID: string;
  providerID: string;
  mode: string;
  agent: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
  finish?: string;
}
```

### 1.6 Token Usage Tracking

OpenCode reports token usage via SSE events:
- `input`: Input tokens
- `output`: Output tokens
- `cache.read`: Cache read tokens
- `cache.write`: Cache write tokens
- `reasoning`: Reasoning tokens

### 1.7 Key Files & Config

- **Binary**: `~/.opencode/bin/opencode` (~129MB)
- **Config dir**: `~/.config/opencode/`
- **Global config**: `~/.config/opencode/package.json` (has `@opencode-ai/plugin` dep)
- **Node modules**: `~/.config/opencode/node_modules/`

---

## 2. GNHF Architecture

### 2.1 Overview

GNHF ("Good Night Have Fun") is an autonomous agent orchestrator that:
- Runs AI agents continuously while you sleep
- Each iteration makes one small, committed change
- Maintains shared memory via `notes.md`
- Git discipline: commit on success, reset on failure

**GitHub**: https://github.com/kunchenguid/gnhf
**Stars**: 1.4k
**Language**: TypeScript (98.8%)

### 2.2 Architecture Diagram

```
┌─────────────┐
│  gnhf start │
└──────┬──────┘
       ▼
┌──────────────────────┐
│  validate clean git  │
│  create gnhf/ branch │
│  write prompt.md     │
└──────────┬───────────┘
           ▼
┌────────────────────────────┐     ┌──────────┐
│  build iteration prompt    │◄────┤  notes   │
│  (inject notes.md context) │     │   .md    │
└────────────┬───────────────┘     └──────────┘
             ▼
┌────────────────────────────┐
│  invoke your agent         │
│  (non-interactive mode)    │
└────────────┬───────────────┘
             ▼
      ┌─────────────┐
      │  success?   │
      └──┬──────┬───┘
    yes  │      │  no
         ▼      ▼
  ┌──────────┐  ┌───────────┐
  │  commit  │  │ git reset │
  │  append  │  │  --hard   │
  │ notes.md │  │ maybe wait│
  └────┬─────┘  └─────┬─────┘
       │              │
       ▼              ▼
  ┌────────────┐    yes   ┌──────────┐
  │ 3 consec.  ├─────────►│  abort   │
  │ failures   │          └────▲─────┘
  │ or perm.   ├───────────────┘
  │ error?     │
  └─────┬──────┘
     no │
        └──────────────────────────────────────┐
                                               │
                                               ▼
                                        (next iteration)
```

### 2.3 Core Components

#### 2.3.1 CLI (`src/cli.ts`)

Entry point. Handles:
- Argument parsing (Commander.js)
- Git validation
- Branch creation
- Run setup/resume
- Orchestrator initialization
- Exit summary rendering

Key flags:
```bash
gnhf "reduce complexity of the codebase"
gnhf --max-iterations 10 --max-tokens 5000000
gnhf --worktree "implement feature X"  # isolated worktree
gnhf --stop-when "all tests pass"
```

#### 2.3.2 Orchestrator (`src/core/orchestrator.ts`)

Main loop with state machine:

```typescript
interface OrchestratorState {
  status: 'running' | 'waiting' | 'aborted' | 'stopped';
  gracefulStopRequested: boolean;
  currentIteration: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  tokensEstimated: boolean;
  commitCount: number;
  iterations: IterationRecord[];
  successCount: number;
  failCount: number;
  consecutiveFailures: number;
  consecutiveErrors: number;
  startTime: Date;
  waitingUntil: Date | null;
  lastMessage: string | null;
}

interface IterationRecord {
  number: number;
  success: boolean;
  summary: string;
  keyChanges: string[];
  keyLearnings: string[];
  timestamp: Date;
}
```

**Loop Logic:**
1. Check pre-iteration abort conditions (max iterations, max tokens)
2. Increment iteration counter
3. Build iteration prompt (injects notes.md context)
4. Run agent
5. Process result:
   - Success: git commit, append to notes.md
   - Failure: git reset --hard
6. Check stop conditions
7. Handle consecutive failures with exponential backoff
8. Repeat

**Abort Conditions:**
- Max iterations reached
- Max tokens reached
- Stop condition met (`should_fully_stop: true`)
- 3 consecutive failures (configurable)
- Permanent agent error (e.g., low credit)
- User interrupt (Ctrl+C)

**Backoff Strategy:**
- Agent-reported failures: immediate retry
- Retryable hard errors: exponential backoff (60s * 2^(n-1))
- Permanent errors: abort immediately

#### 2.3.3 Agent Interface (`src/core/agents/types.ts`)

```typescript
interface Agent {
  name: string;
  close?(): Promise<void> | void;
  run(prompt: string, cwd: string, options?: AgentRunOptions): Promise<AgentResult>;
}

interface AgentResult {
  output: AgentOutput;
  usage: TokenUsage;
}

interface AgentOutput {
  success: boolean;
  summary: string;
  key_changes_made: string[];
  key_learnings: string[];
  should_fully_stop?: boolean;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimated?: boolean;
}
```

**Output Schema Builder:**

```typescript
function buildAgentOutputSchema(opts: {
  includeStopField: boolean;
  commitFields?: AgentOutputCommitField[];
}): AgentOutputSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      success: { type: 'boolean' },
      summary: { type: 'string' },
      key_changes_made: { type: 'array', items: { type: 'string' } },
      key_learnings: { type: 'array', items: { type: 'string' } }
    },
    required: ['success', 'summary', 'key_changes_made', 'key_learnings']
  };
}
```

#### 2.3.4 Prompt Template (`src/templates/iteration-prompt.ts`)

```
You are working autonomously towards an objective given below.
This is iteration {n}. Each iteration aims to make an incremental step forward.

## Instructions

1. Read .gnhf/runs/{runId}/notes.md first to understand what has been done
2. Identify the next smallest logical unit of work
3. If solution didn't work, document learnings and set success=false
4. If you made code changes, run build/tests/linters/formatters
5. Stop any background processes before finishing
6. Only submit final JSON after work is complete and validated

## Output

- success: whether you made meaningful progress
- summary: concise one-sentence summary
- key_changes_made: array of changes by logical unit
- key_learnings: array of new surprising learnings
- should_fully_stop: true if stop condition is met

## Objective

{prompt}
```

#### 2.3.5 Supported Agents

| Agent | Flag | Implementation |
|-------|------|----------------|
| Claude Code | `--agent claude` | Spawns `claude` CLI in non-interactive mode |
| Codex | `--agent codex` | Spawns `codex exec` in non-interactive mode |
| OpenCode | `--agent opencode` | Spawns `opencode serve`, creates session via HTTP API |
| Copilot | `--agent copilot` | Spawns `copilot` in JSONL mode |
| Pi | `--agent pi` | Spawns `pi` in JSON mode |
| Rovo Dev | `--agent rovodev` | Spawns `acli rovodev serve` |
| ACP | `--agent acp:<target>` | Uses bundled acpx runtime |

#### 2.3.6 OpenCode Agent Implementation

Key details from `src/core/agents/opencode.ts`:

```typescript
class OpenCodeAgent implements Agent {
  // 1. Spawns opencode serve process
  // 2. Waits for health check (/global/health)
  // 3. Creates session with blanket permissions
  // 4. Streams messages via SSE (/global/event)
  // 5. Sends prompt with structured output schema
  // 6. Parses final structured JSON from SSE
  // 7. Tracks token usage from SSE events
  // 8. Cleans up: abort session, delete session, shutdown server
}
```

**Blanket Permission Ruleset:**
```typescript
const BLANKET_PERMISSION_RULESET = [
  { permission: '*', pattern: '*', action: 'allow' }
];
```

**Structured Output Format:**
```typescript
function buildStructuredOutputFormat(schema: AgentOutputSchema) {
  return {
    type: 'json_schema',
    schema,
    retryCount: 1
  };
}
```

**Stream Processing:**
- Connects to `/global/event` SSE endpoint
- Tracks message parts (text, reasoning, final_answer phases)
- Extracts structured output from `message.updated` events
- Aggregates token usage from streaming events
- Handles heartbeats and timeouts

### 2.4 Configuration

Config lives at `~/.gnhf/config.yml`:

```yaml
agent: claude  # default agent

# Optional binary overrides
agentPathOverride:
  claude: /path/to/custom-claude

# Optional CLI arg overrides
agentArgsOverride:
  codex:
    - -m
    - gpt-5.4
    - --full-auto

# Commit message convention
commitMessage:
  preset: conventional  # or omit for default

maxConsecutiveFailures: 3
preventSleep: true
```

### 2.5 State Management

**Per-run directory**: `.gnhf/runs/<runId>/`

Files:
- `prompt.md` - Original objective
- `notes.md` - Shared memory (built up across iterations)
- `output-schema.json` - Structured output schema
- `gnhf.log` - Debug log (JSONL)
- `iteration-<n>.jsonl` - Per-iteration agent output

**notes.md format:**
```markdown
# Run Notes

## Iteration 1
- Summary: ...
- Changes: ...
- Learnings: ...

## Iteration 2
...
```

### 2.6 Git Discipline

- Creates branch: `gnhf/<slugified-prompt>`
- Each successful iteration = one unsigned git commit
- Failed iterations = `git reset --hard`
- Commits use `--no-verify` if first attempt fails (handles hooks)
- Supports git worktrees for parallel agents

### 2.7 Worktree Mode

```bash
gnhf --worktree "implement feature X" &
gnhf --worktree "add tests" &
```

Creates isolated worktrees:
```
<repo>/                              ← original
<repo>-gnhf-worktrees/
  ├── <run-slug-1>/                  ← worktree 1
  └── <run-slug-2>/                  ← worktree 2
```

### 2.8 Exit Summary

Every run ends with a permanent stdout summary:
- Elapsed time
- Branch name
- Iteration count
- Token totals
- Branch diff stats
- Notes/log paths
- Review commands

---

## 3. Nonstop Agent (Anthropic Pattern)

### 3.1 Overview

Python framework implementing Anthropic's recommended patterns for long-running agents.

**GitHub**: https://github.com/seolcoding/nonstop-agent
**Stars**: 11
**Language**: Python

### 3.2 2-Agent Pattern

```
Session 1 (First Run):
┌─────────────────────────────────┐
│     INITIALIZER AGENT           │
│  - Read app_spec.txt            │
│  - Create feature_list.json     │
│  - Set up project structure     │
│  - Git init and first commit    │
└─────────────────────────────────┘

Sessions 2, 3, 4... (Continuation):
┌─────────────────────────────────┐
│       CODING AGENT              │
│  1. Orient: Read progress files │
│  2. Verify: Check features      │
│  3. Implement: One feature      │
│  4. Test: Verify                │
│  5. Commit: Save progress       │
│  6. Repeat                      │
└─────────────────────────────────┘
```

### 3.3 State Files

| File | Purpose | Mutable |
|------|---------|---------|
| `app_spec.txt` | Original requirements | No |
| `feature_list.json` | Feature checklist | Yes (passes field) |
| `claude-progress.txt` | Session notes | Yes |
| `claude_session.json` | Session ID | Yes |
| Git history | Code changes | Yes |

### 3.4 Security Layers

```
Layer 1: OS-Level Sandbox
  - Isolated bash execution
  - Filesystem escape prevention

Layer 2: Filesystem Restrictions
  - Operations limited to project dir
  - Read/Write/Edit tools scoped

Layer 3: Command Allowlist
  - Only permitted commands can run
  - Extra validation for sensitive commands
```

### 3.5 feature_list.json Format

```json
[
  {
    "category": "functional",
    "description": "User can log in with email and password",
    "steps": [
      "Step 1: Navigate to login page",
      "Step 2: Enter email",
      "Step 3: Enter password",
      "Step 4: Click login button",
      "Step 5: Verify redirect to dashboard"
    ],
    "passes": false
  }
]
```

Rules:
- `description` and `steps` are immutable
- Only change: `"passes": false` → `"passes": true`
- Order by priority: core features first

---

## 4. Other Frameworks

### 4.1 Claude Code (Anthropic)

- Agentic coding system embedded in terminal
- Understands codebase, edits files, runs commands
- Can be invoked in non-interactive mode for automation
- Supports `--output-schema` for structured responses
- OAuth authentication required

### 4.2 Devin (Cognition AI)

- First fully autonomous AI software engineer
- Cloud-based IDE with parallel development instances
- Interactive planning with human oversight
- Parallel sessions for multi-tasking
- ACU-based pricing model
- Features:
  - Long-running task persistence
  - Context retention across sessions
  - Browser automation
  - Terminal access
  - Git integration

### 4.3 Codex (OpenAI)

- OpenAI's coding agent
- `--full-auto` mode for autonomous operation
- `--output-schema` enforces OpenAI strict mode
- Requires every key in `properties` to be in `required`

### 4.4 ACP (Agent Client Protocol)

- Standardized protocol for AI agents
- Used by GNHF for extensible agent support
- Powered by acpx runtime (bundled with GNHF)
- Supports custom targets: `acp:<target-or-command>`

---

## 5. Key Patterns & Best Practices

### 5.1 Orchestration Patterns

| Pattern | Used By | Description |
|---------|---------|-------------|
| Iteration Loop | GNHF | Each cycle = one small committed change |
| 2-Agent | Nonstop | Initializer sets up, Coder continues |
| Shared Memory | GNHF, Nonstop | notes.md / feature_list.json |
| Git Discipline | GNHF | Commit on success, reset on failure |
| Worktree Isolation | GNHF | Parallel agents on same repo |
| Exponential Backoff | GNHF | Retry with increasing delays |
| Stop Conditions | GNHF | Natural language condition checking |

### 5.2 State Persistence

```
GNHF:        notes.md (markdown, human-readable)
Nonstop:     feature_list.json (structured, machine-readable)
Devin:       Cloud session + browser state
```

### 5.3 Prompt Engineering

**GNHF iteration prompt principles:**
1. Read shared memory first
2. Scope to smallest logical unit
3. Document failures as learnings
4. Validate before finishing
5. Stop background processes
6. Only submit JSON when complete

**Structured output schema:**
```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "success": { "type": "boolean" },
    "summary": { "type": "string" },
    "key_changes_made": { "type": "array", "items": { "type": "string" } },
    "key_learnings": { "type": "array", "items": { "type": "string" } },
    "should_fully_stop": { "type": "boolean" }
  },
  "required": ["success", "summary", "key_changes_made", "key_learnings"]
}
```

### 5.4 Error Handling

| Error Type | GNHF Behavior |
|------------|---------------|
| Agent-reported failure | Immediate retry, count toward consecutive |
| Retryable hard error | Exponential backoff |
| Permanent error | Abort immediately |
| No-op iteration | Count as failure |
| Timeout | Abort with cleanup |

### 5.5 Token Management

- Track input/output/cache tokens per iteration
- Aggregate across run for `--max-tokens` cap
- Mark estimates when authoritative usage unavailable
- Cap can abort mid-iteration

### 5.6 Session Lifecycle

```
OpenCode:
1. Spawn server (opencode serve)
2. Wait for health check
3. Create session with permissions
4. Send prompt with structured output
5. Stream events via SSE
6. Parse final structured response
7. Abort session
8. Delete session
9. Shutdown server
```

---

## 6. Technology Comparison

| Feature | GNHF | Nonstop | Devin | Claude Code |
|---------|------|---------|-------|-------------|
| **Language** | TypeScript | Python | Cloud | TypeScript |
| **Open Source** | Yes | Yes | No | No |
| **Multi-Agent** | Yes (worktrees) | Yes (2-agent) | Yes | No |
| **Shared Memory** | notes.md | feature_list.json | Cloud | Session |
| **Git Integration** | Full (commit/reset) | Full | Full | Full |
| **Stop Conditions** | Yes (NL) | No | Yes | No |
| **Token Caps** | Yes | No | Yes | No |
| **Resume Support** | Yes | Yes | Yes | Yes |
| **Structured Output** | Yes (JSON schema) | No | Yes | Yes |
| **Agent Agnostic** | Yes (7 agents) | No (Claude only) | No | No |
| **Back-off** | Exponential | No | Yes | No |
| **Worktree Mode** | Yes | No | Parallel sessions | No |

---

## 7. Recommendations for Our Agent

### 7.1 Architecture Decisions

Based on this research, our agent should adopt:

1. **GNHF-style orchestration loop** - Proven, simple, effective
2. **OpenCode as primary agent** - Native SDK support, structured output
3. **notes.md as shared memory** - Human-readable, git-tracked
4. **Git discipline** - Commit on success, reset on failure
5. **JSON schema structured output** - Type-safe, machine-parseable
6. **Exponential backoff** - Handle transient failures gracefully
7. **Stop conditions** - Natural language conditions for flexibility

### 7.2 Differentiation from GNHF

Our agent should be MORE advanced by:

1. **Multiple agent types** (not just one):
   - Planner: Breaks down objectives into tasks
   - Researcher: Explores codebase, finds patterns
   - Implementer: Writes code
   - Reviewer: Validates changes
   - Documenter: Updates docs

2. **Better state management**:
   - notes.md for human-readable context
   - tasks.json for structured task tracking
   - Progress metrics and burndown

3. **Web dashboard** (Nuxt.js app):
   - Live progress tracking
   - Session history
   - Token usage graphs
   - Agent performance metrics

4. **Integration with existing infra**:
   - BullMQ for background job processing
   - PostgreSQL for persistence
   - Kysely for type-safe queries

5. **Better error recovery**:
   - Retry with different strategies
   - Agent handoff on repeated failures
   - Automatic issue creation

### 7.3 Key Files to Create

```
packages/agent/
├── src/
│   ├── cli.ts                    # Entry point
│   ├── orchestrator.ts           # Main loop
│   ├── agents/
│   │   ├── types.ts              # Agent interfaces
│   │   ├── factory.ts            # Agent creation
│   │   └── opencode.ts           # OpenCode agent
│   ├── prompts/
│   │   ├── iteration.ts          # Iteration prompt builder
│   │   └── schemas.ts            # Output schemas
│   ├── state/
│   │   ├── notes.ts              # notes.md management
│   │   └── tasks.ts              # tasks.json management
│   ├── git.ts                    # Git operations
│   └── utils/
│       ├── debug-log.ts          # Debug logging
│       └── sleep.ts              # Sleep prevention
├── package.json
└── tsconfig.json
```

---

## 8. Open Questions

1. How does OpenCode handle MCP server configuration via SDK?
2. What's the performance overhead of creating/destroying sessions per iteration?
3. Can we reuse a single OpenCode server across multiple orchestrator runs?
4. How do we handle OpenCode's permission prompts in headless mode?
5. What's the best way to stream progress to the web dashboard?
6. How do we implement agent-type routing (planner vs implementer)?
7. Should we support multiple LLM providers or stick with OpenCode?

---

*Research compiled: 2026-05-04*
*Sources: OpenCode SDK v1.14.33, GNHF v0.1.35, Nonstop Agent main*
