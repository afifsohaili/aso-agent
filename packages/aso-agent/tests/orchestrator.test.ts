import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Orchestrator } from '../src/orchestrator.js'
import type { NotesManager } from '../src/core/notes-manager.js'
import type { GitManager } from '../src/core/git-manager.js'
import type { OpenCodeClient, OpenCodeSession } from '../src/services/opencode-client.js'
import type { NotesDocument, AgentResult } from '../src/types/index.js'

// Mock logger
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

// Mock agents
const mockImplementerRun = vi.fn()
const mockStopCheckRun = vi.fn()

vi.mock('../src/agents/index.js', () => ({
  ImplementerAgent: vi.fn(function () {
    this.run = mockImplementerRun
  }),
  StopCheckAgent: vi.fn(function () {
    this.run = mockStopCheckRun
  }),
}))

function createNotesDoc(overrides: Partial<NotesDocument> = {}): NotesDocument {
  return {
    session: {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      test_command: 'npm test',
      max_iterations: 5,
      max_time_per_iteration: 1800,
      ...overrides.session,
    },
    entries: [],
    ...overrides,
  }
}

function createMockNotesManager(): NotesManager {
  const entries: any[] = []
  let session: any = null

  return {
    read: vi.fn(() => session ? { session, entries } : null),
    getFilePath: vi.fn().mockReturnValue('/tmp/test/notes.yaml'),
    initialize: vi.fn((config) => {
      session = config
      entries.length = 0
      return { session, entries }
    }),
    appendEntry: vi.fn((entry) => {
      entries.push(entry)
      return { session, entries }
    }),
    updateSession: vi.fn((updates) => {
      if (!session) session = {}
      Object.assign(session, updates)
      return { session, entries }
    }),
    getLastEntry: vi.fn(() => entries.length > 0 ? entries[entries.length - 1] : null),
  } as unknown as NotesManager
}

function createMockGitManager(): GitManager {
  return {
    getLogSinceBranchCreated: vi.fn().mockReturnValue('abc123 Initial commit'),
  } as unknown as GitManager
}

function createMockOpenCodeClient(): OpenCodeClient {
  return {
    writeConfig: vi.fn(),
    removeConfig: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    startServer: vi.fn(),
    stopServer: vi.fn(),
  } as unknown as OpenCodeClient
}

function createMockSession(): OpenCodeSession {
  return { id: 'session-123' } as OpenCodeSession
}

describe('Orchestrator', () => {
  let orchestrator: Orchestrator
  let mockNotesManager: ReturnType<typeof createMockNotesManager>
  let mockGitManager: ReturnType<typeof createMockGitManager>
  let mockOpenCodeClient: ReturnType<typeof createMockOpenCodeClient>

  beforeEach(() => {
    vi.clearAllMocks()
    mockNotesManager = createMockNotesManager()
    mockGitManager = createMockGitManager()
    mockOpenCodeClient = createMockOpenCodeClient()

    orchestrator = new Orchestrator({
      notesManager: mockNotesManager,
      gitManager: mockGitManager,
      opencodeClient: mockOpenCodeClient,
      workingDir: '/tmp/test',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Constructor ───────────────────────────────────────────────────

  describe('constructor', () => {
    it('should initialize with provided options', () => {
      expect(orchestrator).toBeDefined()
    })
  })

  // ── run() - initialization errors ─────────────────────────────────

  describe('run initialization', () => {
    it('should throw when notes document does not exist', async () => {
      mockNotesManager.read.mockReturnValue(null)

      await expect(orchestrator.run()).rejects.toThrow('No notes document found. Initialize first.')
    })

    it('should emit error event on fatal error', async () => {
      mockNotesManager.read.mockReturnValue(null)
      const errorHandler = vi.fn()
      orchestrator.on('error', errorHandler)

      try {
        await orchestrator.run()
      }
      catch {
        // Expected
      }

      expect(errorHandler).toHaveBeenCalled()
    })

    it('should emit finished event even on error', async () => {
      mockNotesManager.read.mockReturnValue(null)
      const finishedHandler = vi.fn()
      orchestrator.on('finished', finishedHandler)

      try {
        await orchestrator.run()
      }
      catch {
        // Expected
      }

      expect(finishedHandler).toHaveBeenCalled()
    })

    it('should clean up opencode.json in finally block on error', async () => {
      mockNotesManager.read.mockReturnValue(null)

      try {
        await orchestrator.run()
      }
      catch {
        // Expected
      }

      expect(mockOpenCodeClient.removeConfig).toHaveBeenCalledWith('/tmp/test')
    })
  })

  // ── run() - session management ────────────────────────────────────

  describe('run session management', () => {
    it('should resume existing session when opencode_session_id exists', async () => {
      const notes = createNotesDoc({
        session: { opencode_session_id: 'existing-session-123' },
      })
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.getSession.mockReturnValue(mockSession)

      // Stop after first iteration
      mockImplementerRun.mockResolvedValue({
        success: true,
        summary: 'Done',
        output: { type: 'implement', summary: 'Done', files_changed: [], tests_passed: true },
      })
      mockStopCheckRun.mockResolvedValue({
        success: true,
        summary: 'CONTINUE: more work',
        output: { type: 'stop-check', should_stop: true, reason: 'Done' },
      })

      await orchestrator.run()

      expect(mockOpenCodeClient.getSession).toHaveBeenCalledWith('existing-session-123')
      expect(mockOpenCodeClient.createSession).not.toHaveBeenCalled()
    })

    it('should create new session when no opencode_session_id exists', async () => {
      const notes = createNotesDoc()
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      mockImplementerRun.mockResolvedValue({
        success: true,
        summary: 'Done',
        output: { type: 'implement', summary: 'Done', files_changed: [], tests_passed: true },
      })
      mockStopCheckRun.mockResolvedValue({
        success: true,
        summary: 'CONTINUE: more work',
        output: { type: 'stop-check', should_stop: true, reason: 'Done' },
      })

      await orchestrator.run()

      expect(mockOpenCodeClient.createSession).toHaveBeenCalled()
      expect(mockNotesManager.updateSession).toHaveBeenCalledWith({ opencode_session_id: 'session-123' })
    })

    it('should write opencode.json at start', async () => {
      const notes = createNotesDoc()
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      mockImplementerRun.mockResolvedValue({
        success: true,
        summary: 'Done',
        output: { type: 'implement', summary: 'Done', files_changed: [], tests_passed: true },
      })
      mockStopCheckRun.mockResolvedValue({
        success: true,
        summary: 'CONTINUE',
        output: { type: 'stop-check', should_stop: true, reason: 'Done' },
      })

      await orchestrator.run()

      expect(mockOpenCodeClient.writeConfig).toHaveBeenCalledWith('/tmp/test')
    })

    it('should remove opencode.json in finally block', async () => {
      const notes = createNotesDoc()
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      mockImplementerRun.mockResolvedValue({
        success: true,
        summary: 'Done',
        output: { type: 'implement', summary: 'Done', files_changed: [], tests_passed: true },
      })
      mockStopCheckRun.mockResolvedValue({
        success: true,
        summary: 'CONTINUE',
        output: { type: 'stop-check', should_stop: true, reason: 'Done' },
      })

      await orchestrator.run()

      expect(mockOpenCodeClient.removeConfig).toHaveBeenCalledWith('/tmp/test')
    })
  })

  // ── run() - events ────────────────────────────────────────────────

  describe('run events', () => {
    it('should emit started event', async () => {
      const notes = createNotesDoc()
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      mockImplementerRun.mockResolvedValue({
        success: true,
        summary: 'Done',
        output: { type: 'implement', summary: 'Done', files_changed: [], tests_passed: true },
      })
      mockStopCheckRun.mockResolvedValue({
        success: true,
        summary: 'CONTINUE',
        output: { type: 'stop-check', should_stop: true, reason: 'Done' },
      })

      const startedHandler = vi.fn()
      orchestrator.on('started', startedHandler)

      await orchestrator.run()

      expect(startedHandler).toHaveBeenCalled()
    })

    it('should emit finished event', async () => {
      const notes = createNotesDoc()
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      mockImplementerRun.mockResolvedValue({
        success: true,
        summary: 'Done',
        output: { type: 'implement', summary: 'Done', files_changed: [], tests_passed: true },
      })
      mockStopCheckRun.mockResolvedValue({
        success: true,
        summary: 'CONTINUE',
        output: { type: 'stop-check', should_stop: true, reason: 'Done' },
      })

      const finishedHandler = vi.fn()
      orchestrator.on('finished', finishedHandler)

      await orchestrator.run()

      expect(finishedHandler).toHaveBeenCalled()
    })

    it('should emit step:started event', async () => {
      const notes = createNotesDoc()
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      mockImplementerRun.mockResolvedValue({
        success: true,
        summary: 'Step 1 done',
        output: { type: 'implement', summary: 'Step 1 done', files_changed: [], tests_passed: true },
      })
      mockStopCheckRun.mockResolvedValue({
        success: true,
        summary: 'CONTINUE',
        output: { type: 'stop-check', should_stop: true, reason: 'Done' },
      })

      const stepStartedHandler = vi.fn()
      orchestrator.on('step:started', stepStartedHandler)

      await orchestrator.run()

      expect(stepStartedHandler).toHaveBeenCalledWith({ step: 1 })
    })
  })

  // ── run() - main loop logic ───────────────────────────────────────

  describe('run main loop', () => {
    it('should run one iteration and stop when stop condition is met', async () => {
      const notes = createNotesDoc()
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      mockImplementerRun.mockResolvedValue({
        success: true,
        summary: 'Implemented feature',
        output: { type: 'implement', summary: 'Implemented feature', files_changed: [{ path: 'a.ts', description: 'added' }], tests_passed: true },
      })
      mockStopCheckRun.mockResolvedValue({
        success: false,
        summary: 'STOP: all done',
        output: { type: 'stop-check', should_stop: true, reason: 'All tests passing' },
      })

      const stoppedHandler = vi.fn()
      orchestrator.on('stopped', stoppedHandler)

      await orchestrator.run()

      expect(mockImplementerRun).toHaveBeenCalledTimes(1)
      expect(mockStopCheckRun).toHaveBeenCalledTimes(1)
      expect(mockNotesManager.appendEntry).toHaveBeenCalledTimes(1)
      expect(stoppedHandler).toHaveBeenCalledWith({ reason: 'stop_condition_met' })
    })

    it('should continue to next iteration when stop condition is not met', async () => {
      // Use stateful mock without overriding read() so entries accumulate
      const notes = createNotesDoc()
      mockNotesManager.initialize(notes.session)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      let callCount = 0
      mockImplementerRun.mockImplementation(() => {
        callCount++
        return Promise.resolve({
          success: true,
          summary: `Step ${callCount}`,
          output: { type: 'implement', summary: `Step ${callCount}`, files_changed: [], tests_passed: true },
        })
      })

      let stopCallCount = 0
      mockStopCheckRun.mockImplementation(() => {
        stopCallCount++
        return Promise.resolve({
          success: true,
          summary: 'CONTINUE',
          output: { type: 'stop-check', should_stop: stopCallCount >= 2, reason: stopCallCount >= 2 ? 'Done' : 'More work' },
        })
      })

      await orchestrator.run()

      expect(mockImplementerRun).toHaveBeenCalledTimes(2)
      expect(mockStopCheckRun).toHaveBeenCalledTimes(2)
      expect(mockNotesManager.appendEntry).toHaveBeenCalledTimes(2)
    })

    it('should stop when max iterations is reached', async () => {
      const notes = createNotesDoc({
        session: { max_iterations: 1 },
        entries: [{ step: 1, timestamp: '2024-01-01T00:00:00Z', summary: 'First', files_changed: [], tests_passed: true }],
      })
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      const stoppedHandler = vi.fn()
      orchestrator.on('stopped', stoppedHandler)

      await orchestrator.run()

      expect(mockImplementerRun).not.toHaveBeenCalled()
      expect(stoppedHandler).toHaveBeenCalledWith({ reason: 'max_iterations_reached' })
    })

    it('should emit step:failed when implementer returns success=false', async () => {
      const notes = createNotesDoc()
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      mockImplementerRun.mockResolvedValue({
        success: false,
        summary: 'Tests failed',
        output: { type: 'implement', summary: 'Tests failed', files_changed: [], tests_passed: false },
      })
      mockStopCheckRun.mockResolvedValue({
        success: true,
        summary: 'CONTINUE',
        output: { type: 'stop-check', should_stop: true, reason: 'Done' },
      })

      const stepFailedHandler = vi.fn()
      orchestrator.on('step:failed', stepFailedHandler)

      await orchestrator.run()

      expect(stepFailedHandler).toHaveBeenCalledWith({ step: 1, summary: 'Tests failed' })
    })

    it('should emit step:failed when an error is thrown during step execution', async () => {
      const notes = createNotesDoc()
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      let callCount = 0
      mockImplementerRun.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.reject(new Error('Agent crashed'))
        }
        return Promise.resolve({
          success: true,
          summary: 'Recovered',
          output: { type: 'implement', summary: 'Recovered', files_changed: [], tests_passed: true },
        })
      })

      mockStopCheckRun.mockImplementation(() => Promise.resolve({
        success: true,
        summary: 'CONTINUE',
        output: { type: 'stop-check', should_stop: callCount >= 1, reason: 'Done' },
      }))

      const stepFailedHandler = vi.fn()
      orchestrator.on('step:failed', stepFailedHandler)

      await orchestrator.run()

      expect(stepFailedHandler).toHaveBeenCalledWith({ step: 1, error: 'Agent crashed' })
    })

    it('should append entry with empty files_changed for non-implement output', async () => {
      const notes = createNotesDoc()
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      mockImplementerRun.mockResolvedValue({
        success: true,
        summary: 'Done',
        output: { type: 'stop-check', should_stop: false, reason: 'ok' } as any,
      })
      mockStopCheckRun.mockResolvedValue({
        success: true,
        summary: 'CONTINUE',
        output: { type: 'stop-check', should_stop: true, reason: 'Done' },
      })

      await orchestrator.run()

      expect(mockNotesManager.appendEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          files_changed: [],
          tests_passed: false,
        }),
      )
    })
  })

  // ── stop() ────────────────────────────────────────────────────────

  describe('stop', () => {
    it('should set running to false and emit stopping event', () => {
      const stoppingHandler = vi.fn()
      orchestrator.on('stopping', stoppingHandler)

      orchestrator.stop()

      expect(stoppingHandler).toHaveBeenCalled()
    })

    it('should cause run loop to exit on next iteration check', async () => {
      const notes = createNotesDoc()
      mockNotesManager.read.mockReturnValue(notes)

      const mockSession = createMockSession()
      mockOpenCodeClient.createSession.mockResolvedValue(mockSession)

      // First implementer takes a while, stop during it
      mockImplementerRun.mockImplementation(async () => {
        orchestrator.stop()
        return {
          success: true,
          summary: 'Done',
          output: { type: 'implement', summary: 'Done', files_changed: [], tests_passed: true },
        }
      })

      mockStopCheckRun.mockResolvedValue({
        success: true,
        summary: 'CONTINUE',
        output: { type: 'stop-check', should_stop: false, reason: 'More work' },
      })

      await orchestrator.run()

      // Should have run at least one iteration
      expect(mockImplementerRun).toHaveBeenCalledTimes(1)
    })
  })
})
