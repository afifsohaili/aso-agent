import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NotesManager } from '../src/core/notes-manager.js'
import type { SessionConfig } from '../src/types/index.js'

describe('NotesManager', () => {
  let tmpDir: string
  let notesPath: string
  let manager: NotesManager

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-test-'))
    notesPath = join(tmpDir, 'notes.yaml')
    manager = new NotesManager(notesPath)
  })

  afterEach(() => {
    import('node:fs').then(({ rmSync }) => {
      rmSync(tmpDir, { recursive: true })
    })
  })

  it('should return null when file does not exist', () => {
    expect(manager.read()).toBeNull()
  })

  it('should initialize a new notes document', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      test_command: 'npm test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    const doc = manager.initialize(config)

    expect(doc.session).toEqual(config)
    expect(doc.entries).toEqual([])
    expect(existsSync(notesPath)).toBe(true)
  })

  it('should append an entry', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      test_command: 'npm test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    manager.initialize(config)

    const entry = {
      step: 1,
      timestamp: '2024-01-01T00:00:00Z',
      summary: 'Added login endpoint',
      files_changed: [{ path: 'src/auth.ts', description: 'Added login function' }],
      tests_passed: true,
    }

    const doc = manager.appendEntry(entry)

    expect(doc.entries).toHaveLength(1)
    expect(doc.entries[0]).toEqual(entry)
  })

  it('should append multiple entries', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      test_command: 'npm test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    manager.initialize(config)

    manager.appendEntry({
      step: 1,
      timestamp: '2024-01-01T00:00:00Z',
      summary: 'First task',
      files_changed: [],
      tests_passed: true,
    })

    manager.appendEntry({
      step: 2,
      timestamp: '2024-01-01T00:01:00Z',
      summary: 'Second task',
      files_changed: [{ path: 'a.ts', description: 'changed' }],
      tests_passed: true,
    })

    const doc = manager.read()
    expect(doc?.entries).toHaveLength(2)
    expect(doc?.entries[0].summary).toBe('First task')
    expect(doc?.entries[1].summary).toBe('Second task')
  })

  it('should update session config', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      test_command: 'npm test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    manager.initialize(config)
    manager.updateSession({ opencode_session_id: 'session-123' })

    const doc = manager.read()
    expect(doc?.session.opencode_session_id).toBe('session-123')
    expect(doc?.session.objective).toBe('Test objective')
  })

  it('should get the last entry', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      test_command: 'npm test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    manager.initialize(config)
    expect(manager.getLastEntry()).toBeNull()

    manager.appendEntry({
      step: 1,
      timestamp: '2024-01-01T00:00:00Z',
      summary: 'First task',
      files_changed: [],
      tests_passed: true,
    })

    const last = manager.getLastEntry()
    expect(last).not.toBeNull()
    expect(last?.step).toBe(1)
    expect(last?.summary).toBe('First task')
  })

  it('should persist entries across reads', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      test_command: 'npm test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    manager.initialize(config)
    manager.appendEntry({
      step: 1,
      timestamp: '2024-01-01T00:00:00Z',
      summary: 'First task',
      files_changed: [{ path: 'a.ts', description: 'changed' }],
      tests_passed: true,
    })

    const freshManager = new NotesManager(notesPath)
    const doc = freshManager.read()

    expect(doc?.entries).toHaveLength(1)
    expect(doc?.entries[0].summary).toBe('First task')
    expect(doc?.entries[0].tests_passed).toBe(true)
  })

  it('should throw when appending entry without initialization', () => {
    expect(() =>
      manager.appendEntry({
        step: 1,
        timestamp: '2024-01-01T00:00:00Z',
        summary: 'Test',
        files_changed: [],
        tests_passed: true,
      }),
    ).toThrow('Cannot append entry: notes.yaml does not exist')
  })
})
