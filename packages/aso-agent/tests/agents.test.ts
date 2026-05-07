import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ImplementerAgent } from '../src/agents/implementer-agent.js'
import { StopCheckAgent } from '../src/agents/stop-check-agent.js'
import type { AgentContext, NotesDocument } from '../src/types/index.js'

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
    promptWithSchema: vi.fn(),
    id: 'test-session-id',
  }
}

function createBaseContext(overrides: Partial<AgentContext> = {}): AgentContext {
  const notes: NotesDocument = {
    session: {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    },
    entries: [],
  }

  return {
    notes,
    currentStep: 1,
    workingDir: '/tmp/test',
    branch: 'aso-agent/test',
    notesFilePath: '/tmp/test/notes.yaml',
    ...overrides,
  }
}

describe('ImplementerAgent', () => {
  let agent: ImplementerAgent
  let mockSession: ReturnType<typeof createMockSession>

  beforeEach(() => {
    mockSession = createMockSession()
    agent = new ImplementerAgent({ session: mockSession as any })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── getPromptVariables ────────────────────────────────────────────

  describe('getPromptVariables', () => {
    it('should format previous entries for prompt variables', () => {
      const context = createBaseContext({
        notes: {
          ...createBaseContext().notes,
          entries: [
            { step: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'First task', files_changed: [], tests_passed: true },
            { step: 2, timestamp: '2024-01-01T00:01:00Z', summary: 'Second task', files_changed: [{ path: 'a.ts', description: 'changed' }], tests_passed: false },
          ],
        },
      })

      // Access protected method via type assertion
      const vars = (agent as any).getPromptVariables(context)

      expect(vars.previous_entries).toContain('Step 1: First task (tests: passed)')
      expect(vars.previous_entries).toContain('Step 2: Second task (tests: failed)')
    })

    it('should show no previous work when entries are empty', () => {
      const context = createBaseContext()
      const vars = (agent as any).getPromptVariables(context)

      expect(vars.previous_entries).toBe('No previous work done yet.')
    })
  })

  // ── run ───────────────────────────────────────────────────────────

  describe('run', () => {
    it('should return success when tests pass', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'implement',
        summary: 'Added login feature',
        files_changed: [{ path: 'src/auth.ts', description: 'Added login' }],
        tests_passed: true,
      })

      const context = createBaseContext()
      const result = await agent.run(context)

      expect(result.success).toBe(true)
      expect(result.summary).toBe('Added login feature')
      expect(result.output.type).toBe('implement')
      expect(result.output.tests_passed).toBe(true)
    })

    it('should return failure when tests do not pass', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'implement',
        summary: 'Broken feature',
        files_changed: [],
        tests_passed: false,
      })

      const context = createBaseContext()
      const result = await agent.run(context)

      expect(result.success).toBe(false)
      expect(result.summary).toBe('Broken feature')
      expect(result.output.tests_passed).toBe(false)
    })

    it('should throw when AI response is missing summary', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'implement',
        files_changed: [],
        tests_passed: true,
      })

      const context = createBaseContext()
      await expect(agent.run(context)).rejects.toThrow("ImplementerAgent: AI response missing 'summary'")
    })

    it('should throw when AI response has empty string summary', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'implement',
        summary: '',
        files_changed: [],
        tests_passed: true,
      })

      const context = createBaseContext()
      await expect(agent.run(context)).rejects.toThrow("ImplementerAgent: AI response missing 'summary'")
    })

    it('should throw when AI response is missing files_changed', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'implement',
        summary: 'Some work',
        tests_passed: true,
      })

      const context = createBaseContext()
      await expect(agent.run(context)).rejects.toThrow("ImplementerAgent: AI response missing 'files_changed' array")
    })

    it('should throw when files_changed is not an array', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'implement',
        summary: 'Some work',
        files_changed: 'not-an-array',
        tests_passed: true,
      })

      const context = createBaseContext()
      await expect(agent.run(context)).rejects.toThrow("ImplementerAgent: AI response missing 'files_changed' array")
    })

    it('should throw when AI response is missing tests_passed', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'implement',
        summary: 'Some work',
        files_changed: [],
      })

      const context = createBaseContext()
      await expect(agent.run(context)).rejects.toThrow("ImplementerAgent: AI response missing 'tests_passed' boolean")
    })

    it('should throw when tests_passed is not a boolean', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'implement',
        summary: 'Some work',
        files_changed: [],
        tests_passed: 'yes',
      })

      const context = createBaseContext()
      await expect(agent.run(context)).rejects.toThrow("ImplementerAgent: AI response missing 'tests_passed' boolean")
    })

    it('should accept files_changed with valid entries', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'implement',
        summary: 'Multi-file change',
        files_changed: [
          { path: 'src/a.ts', description: 'Added feature A' },
          { path: 'src/b.ts', description: 'Fixed bug B' },
        ],
        tests_passed: true,
      })

      const context = createBaseContext()
      const result = await agent.run(context)

      expect(result.success).toBe(true)
      expect(result.output.files_changed).toHaveLength(2)
      expect(result.output.files_changed[0].path).toBe('src/a.ts')
    })
  })
})

describe('StopCheckAgent', () => {
  let agent: StopCheckAgent
  let mockSession: ReturnType<typeof createMockSession>

  beforeEach(() => {
    mockSession = createMockSession()
    agent = new StopCheckAgent({ session: mockSession as any })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── getPromptVariables ────────────────────────────────────────────

  describe('getPromptVariables', () => {
    it('should format previous entries with git log', () => {
      const context = createBaseContext({
        notes: {
          ...createBaseContext().notes,
          entries: [
            { step: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'First task', files_changed: [], tests_passed: true },
          ],
        },
        gitLog: 'abc123 Added feature',
      })

      const vars = (agent as any).getPromptVariables(context)

      expect(vars.previous_entries).toContain('Step 1: First task (tests: passed)')
      expect(vars.stop_when).toBe('Tests pass')
      expect(vars.git_log).toBe('abc123 Added feature')
    })

    it('should show no work done when entries are empty', () => {
      const context = createBaseContext()
      const vars = (agent as any).getPromptVariables(context)

      expect(vars.previous_entries).toBe('No work done yet.')
      expect(vars.git_log).toBe('No git log available.')
    })

    it('should use default git log when not provided', () => {
      const context = createBaseContext({ gitLog: undefined })
      const vars = (agent as any).getPromptVariables(context)

      expect(vars.git_log).toBe('No git log available.')
    })

    it('should handle empty git log string', () => {
      const context = createBaseContext({ gitLog: '' })
      const vars = (agent as any).getPromptVariables(context)

      expect(vars.git_log).toBe('No git log available.')
    })
  })

  // ── run ───────────────────────────────────────────────────────────

  describe('run', () => {
    it('should return success when should_stop is false', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'stop-check',
        should_stop: false,
        reason: 'More work needed',
      })

      const context = createBaseContext()
      const result = await agent.run(context)

      expect(result.success).toBe(true)
      expect(result.summary).toBe('CONTINUE: More work needed')
      expect(result.output.should_stop).toBe(false)
      expect(result.output.reason).toBe('More work needed')
    })

    it('should return success=false when should_stop is true', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'stop-check',
        should_stop: true,
        reason: 'All tests passing',
      })

      const context = createBaseContext()
      const result = await agent.run(context)

      expect(result.success).toBe(false)
      expect(result.summary).toBe('STOP: All tests passing')
      expect(result.output.should_stop).toBe(true)
    })

    it('should throw when AI response is missing should_stop', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'stop-check',
        reason: 'Some reason',
      })

      const context = createBaseContext()
      await expect(agent.run(context)).rejects.toThrow("StopCheckAgent: AI response missing 'should_stop' boolean")
    })

    it('should throw when should_stop is not a boolean', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'stop-check',
        should_stop: 'yes',
        reason: 'Some reason',
      })

      const context = createBaseContext()
      await expect(agent.run(context)).rejects.toThrow("StopCheckAgent: AI response missing 'should_stop' boolean")
    })

    it('should throw when AI response is missing reason', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'stop-check',
        should_stop: false,
      })

      const context = createBaseContext()
      await expect(agent.run(context)).rejects.toThrow("StopCheckAgent: AI response missing 'reason'")
    })

    it('should throw when reason is empty string', async () => {
      mockSession.promptWithSchema.mockResolvedValue({
        type: 'stop-check',
        should_stop: false,
        reason: '',
      })

      const context = createBaseContext()
      await expect(agent.run(context)).rejects.toThrow("StopCheckAgent: AI response missing 'reason'")
    })
  })
})
