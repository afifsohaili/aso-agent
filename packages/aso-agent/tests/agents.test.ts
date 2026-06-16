import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ImplementerAgent } from '../src/agents/implementer-agent.js'
import { StopCheckAgent } from '../src/agents/stop-check-agent.js'
import { GapAnalyzerAgent } from '../src/agents/gap-analyzer-agent.js'
import { NotesManager } from '../src/core/notes-manager.js'
import { getStateDir, reportStopCheck, reportGap } from '../src/core/report-commands.js'
import type { AgentContext, NotesDocument, SessionConfig } from '../src/types/index.js'

// Mock the logger to avoid console output during tests
vi.mock('../src/core/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    start: vi.fn(),
    ready: vi.fn(),
    box: vi.fn(),
  })),
}))

function createMockSession() {
  return {
    prompt: vi.fn(),
    id: 'test-session-id',
  }
}

function createSessionConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    id: 'test-session',
    started: '2024-01-01T00:00:00Z',
    objectives: ['Test objective'],
    stop_when: 'Tests pass',
    branch: 'aso-agent/test',
    max_iterations: 50,
    max_time_per_iteration: 1800,
    ...overrides,
  }
}

function createBaseContext(overrides: Partial<AgentContext> = {}, tmpDir: string): AgentContext {
  const notes: NotesDocument = {
    session: createSessionConfig(),
    entries: [],
  }

  return {
    notes,
    currentStep: 1,
    workingDir: tmpDir,
    branch: 'aso-agent/test',
    notesFilePath: join(tmpDir, 'notes.yaml'),
    stateDir: getStateDir(tmpDir),
    ...overrides,
  }
}

describe('ImplementerAgent', () => {
  let agent: ImplementerAgent
  let mockSession: ReturnType<typeof createMockSession>
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-implementer-test-'))
    mockSession = createMockSession()
    agent = new ImplementerAgent({ session: mockSession as any })
    new NotesManager(join(tmpDir, 'notes.yaml')).initialize(createSessionConfig())
  })

  afterEach(() => {
    vi.clearAllMocks()
    rmSync(tmpDir, { recursive: true })
  })

  // ── getPromptVariables ────────────────────────────────────────────

  describe('getPromptVariables', () => {
    it('should format previous entries for prompt variables', () => {
      const context = createBaseContext({
        notes: {
          ...createBaseContext({}, tmpDir).notes,
          entries: [
            { step: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'First task', files_changed: [], tests_passed: true },
            { step: 2, timestamp: '2024-01-01T00:01:00Z', summary: 'Second task', files_changed: [{ path: 'a.ts', description: 'changed' }], tests_passed: false },
          ],
        },
      }, tmpDir)

      // Access protected method via type assertion
      const vars = (agent as any).getPromptVariables(context)

      expect(vars.previous_entries).toContain('Step 1: First task (tests: passed)')
      expect(vars.previous_entries).toContain('Step 2: Second task (tests: failed)')
    })

    it('should show no previous work when entries are empty', () => {
      const context = createBaseContext({}, tmpDir)
      const vars = (agent as any).getPromptVariables(context)

      expect(vars.previous_entries).toBe('No previous work done yet.')
    })

    it('should include objectives in prompt variables', () => {
      const context = createBaseContext({
        notes: {
          ...createBaseContext({}, tmpDir).notes,
          session: {
            ...createBaseContext({}, tmpDir).notes.session,
            objectives: ['Build auth', 'Add tests'],
          },
        },
      }, tmpDir)

      const vars = (agent as any).getPromptVariables(context)

      expect(vars.objectives).toContain('Build auth')
      expect(vars.objectives).toContain('Add tests')
    })
  })

  // ── run ───────────────────────────────────────────────────────────

  describe('run', () => {
    it('should send a plain prompt and return the last entry', async () => {
      const notesManager = new NotesManager(join(tmpDir, 'notes.yaml'))
      notesManager.appendEntry({
        step: 1,
        timestamp: '2024-01-01T00:00:00Z',
        summary: 'Added login feature',
        files_changed: [{ path: 'src/auth.ts', description: 'Added login' }],
        tests_passed: true,
      })

      const context = createBaseContext({}, tmpDir)
      const result = await agent.run(context)

      expect(mockSession.prompt).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
      expect(result.summary).toBe('Added login feature')
      expect(result.output.type).toBe('implement')
      expect(result.output.tests_passed).toBe(true)
    })

    it('should return failure when the last entry reports test failure', async () => {
      const notesManager = new NotesManager(join(tmpDir, 'notes.yaml'))
      notesManager.appendEntry({
        step: 1,
        timestamp: '2024-01-01T00:00:00Z',
        summary: 'Broken feature',
        files_changed: [],
        tests_passed: false,
      })

      const context = createBaseContext({}, tmpDir)
      const result = await agent.run(context)

      expect(result.success).toBe(false)
      expect(result.summary).toBe('Broken feature')
      expect(result.output.tests_passed).toBe(false)
    })

    it('should throw when no entry has been reported', async () => {
      const context = createBaseContext({}, tmpDir)
      await expect(agent.run(context)).rejects.toThrow('No implementer entry reported')
    })

    it('should inject objectives into the final prompt', async () => {
      const notesManager = new NotesManager(join(tmpDir, 'notes.yaml'))
      notesManager.appendEntry({
        step: 1,
        timestamp: '2024-01-01T00:00:00Z',
        summary: 'Added login feature',
        files_changed: [],
        tests_passed: true,
      })

      const context = createBaseContext({
        notes: {
          ...createBaseContext({}, tmpDir).notes,
          session: {
            ...createBaseContext({}, tmpDir).notes.session,
            objectives: ['Build login system'],
          },
        },
      }, tmpDir)

      await agent.run(context)

      const prompt = mockSession.prompt.mock.calls[0][0]
      expect(prompt).toContain('Build login system')
    })
  })
})

describe('StopCheckAgent', () => {
  let agent: StopCheckAgent
  let mockSession: ReturnType<typeof createMockSession>
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-stopcheck-test-'))
    mockSession = createMockSession()
    agent = new StopCheckAgent({ session: mockSession as any })
    new NotesManager(join(tmpDir, 'notes.yaml')).initialize(createSessionConfig())
  })

  afterEach(() => {
    vi.clearAllMocks()
    rmSync(tmpDir, { recursive: true })
  })

  // ── getPromptVariables ────────────────────────────────────────────

  describe('getPromptVariables', () => {
    it('should format previous entries with git log', () => {
      const context = createBaseContext({
        notes: {
          ...createBaseContext({}, tmpDir).notes,
          entries: [
            { step: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'First task', files_changed: [], tests_passed: true },
          ],
        },
        gitLog: 'abc123 Added feature',
      }, tmpDir)

      const vars = (agent as any).getPromptVariables(context)

      expect(vars.previous_entries).toContain('Step 1: First task (tests: passed)')
      expect(vars.stop_when).toBe('Tests pass')
      expect(vars.git_log).toBe('abc123 Added feature')
    })

    it('should show no work done when entries are empty', () => {
      const context = createBaseContext({}, tmpDir)
      const vars = (agent as any).getPromptVariables(context)

      expect(vars.previous_entries).toBe('No work done yet.')
      expect(vars.git_log).toBe('No git log available.')
    })

    it('should use default git log when not provided', () => {
      const context = createBaseContext({ gitLog: undefined }, tmpDir)
      const vars = (agent as any).getPromptVariables(context)

      expect(vars.git_log).toBe('No git log available.')
    })

    it('should handle empty git log string', () => {
      const context = createBaseContext({ gitLog: '' }, tmpDir)
      const vars = (agent as any).getPromptVariables(context)

      expect(vars.git_log).toBe('No git log available.')
    })

    it('should include objectives in prompt variables', () => {
      const context = createBaseContext({
        notes: {
          ...createBaseContext({}, tmpDir).notes,
          session: {
            ...createBaseContext({}, tmpDir).notes.session,
            objectives: ['Build auth', 'Add tests'],
          },
        },
      }, tmpDir)

      const vars = (agent as any).getPromptVariables(context)

      expect(vars.objectives).toContain('Build auth')
      expect(vars.objectives).toContain('Add tests')
    })
  })

  // ── run ───────────────────────────────────────────────────────────

  describe('run', () => {
    it('should return success when should_stop is false', async () => {
      const stateDir = getStateDir(tmpDir)
      reportStopCheck(stateDir, { shouldStop: false, reason: 'More work needed' })

      const context = createBaseContext({}, tmpDir)
      const result = await agent.run(context)

      expect(mockSession.prompt).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
      expect(result.summary).toBe('CONTINUE: More work needed')
      expect(result.output.should_stop).toBe(false)
      expect(result.output.reason).toBe('More work needed')
    })

    it('should return success=false when should_stop is true', async () => {
      const stateDir = getStateDir(tmpDir)
      reportStopCheck(stateDir, { shouldStop: true, reason: 'All tests passing' })

      const context = createBaseContext({}, tmpDir)
      const result = await agent.run(context)

      expect(result.success).toBe(false)
      expect(result.summary).toBe('STOP: All tests passing')
      expect(result.output.should_stop).toBe(true)
    })

    it('should throw when no stop-check has been reported', async () => {
      const context = createBaseContext({}, tmpDir)
      await expect(agent.run(context)).rejects.toThrow('No stop-check result reported')
    })

    it('should inject objectives into the final prompt', async () => {
      const stateDir = getStateDir(tmpDir)
      reportStopCheck(stateDir, { shouldStop: false, reason: 'More work needed' })

      const context = createBaseContext({
        notes: {
          ...createBaseContext({}, tmpDir).notes,
          session: {
            ...createBaseContext({}, tmpDir).notes.session,
            objectives: ['Build login system'],
          },
        },
      }, tmpDir)

      await agent.run(context)

      const prompt = mockSession.prompt.mock.calls[0][0]
      expect(prompt).toContain('Build login system')
    })
  })
})

describe('GapAnalyzerAgent', () => {
  let agent: GapAnalyzerAgent
  let mockSession: ReturnType<typeof createMockSession>
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-gap-test-'))
    mockSession = createMockSession()
    agent = new GapAnalyzerAgent({ session: mockSession as any })
    new NotesManager(join(tmpDir, 'notes.yaml')).initialize(createSessionConfig())
  })

  afterEach(() => {
    vi.clearAllMocks()
    rmSync(tmpDir, { recursive: true })
  })

  // ── getPromptVariables ────────────────────────────────────────────

  describe('getPromptVariables', () => {
    it('should format objectives and entries for prompt variables', () => {
      const context = createBaseContext({
        notes: {
          ...createBaseContext({}, tmpDir).notes,
          session: {
            ...createBaseContext({}, tmpDir).notes.session,
            objectives: ['Build auth', 'Add tests'],
          },
          entries: [
            { step: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'Added login', files_changed: [], tests_passed: true },
          ],
        },
        gitLog: 'abc123 Added login',
      }, tmpDir)

      const vars = (agent as any).getPromptVariables(context)

      expect(vars.previous_entries).toContain('Step 1: Added login (tests: passed)')
      expect(vars.original_objectives).toContain('Build auth')
      expect(vars.original_objectives).toContain('Add tests')
      expect(vars.git_log).toBe('abc123 Added login')
    })

    it('should use defaults when no entries or git log', () => {
      const context = createBaseContext({ gitLog: undefined }, tmpDir)
      const vars = (agent as any).getPromptVariables(context)

      expect(vars.previous_entries).toBe('No work done yet.')
      expect(vars.git_log).toBe('No git log available.')
    })
  })

  // ── run ───────────────────────────────────────────────────────────

  describe('run', () => {
    it('should return success=true when no gaps found', async () => {
      const stateDir = getStateDir(tmpDir)
      reportGap(stateDir, { gaps: [], summary: 'No gaps found' })

      const context = createBaseContext({}, tmpDir)
      const result = await agent.run(context)

      expect(mockSession.prompt).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
      expect(result.summary).toBe('No gaps found: No gaps found')
      expect(result.output.type).toBe('gap-analyzer')
      expect(result.output.gaps).toEqual([])
    })

    it('should return success=false when gaps are found', async () => {
      const stateDir = getStateDir(tmpDir)
      reportGap(stateDir, { gaps: ['Missing input validation', 'No error handling for API calls'], summary: 'Found 2 gaps' })

      const context = createBaseContext({}, tmpDir)
      const result = await agent.run(context)

      expect(result.success).toBe(false)
      expect(result.summary).toContain('Gaps found (2)')
      expect(result.output.gaps).toHaveLength(2)
      expect(result.output.gaps[0]).toBe('Missing input validation')
    })

    it('should throw when no gap report has been reported', async () => {
      const context = createBaseContext({}, tmpDir)
      await expect(agent.run(context)).rejects.toThrow('No gap analysis reported')
    })
  })
})
