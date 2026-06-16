import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NotesManager } from '../src/core/notes-manager.js'
import {
  reportStep,
  reportStopCheck,
  reportGap,
  readLastEntry,
  readStopCheck,
  readGapReport,
  getStateDir,
} from '../src/core/report-commands.js'
import type { SessionConfig } from '../src/types/index.js'

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

describe('report commands', () => {
  let tmpDir: string
  let notesManager: NotesManager
  let stateDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-report-test-'))
    notesManager = new NotesManager(join(tmpDir, 'notes.yaml'))
    notesManager.initialize(createSessionConfig())
    stateDir = getStateDir(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
  })

  describe('reportStep', () => {
    it('should append an entry to notes.yaml', () => {
      const notesFile = join(tmpDir, 'notes.yaml')
      const result = reportStep(notesFile, {
        summary: 'Added login feature',
        testsPassed: true,
        filesChanged: [
          { path: 'src/auth.ts', description: 'Added login' },
        ],
      })

      expect(result.success).toBe(true)

      const notes = notesManager.read()
      expect(notes).not.toBeNull()
      expect(notes!.entries).toHaveLength(1)
      expect(notes!.entries[0].summary).toBe('Added login feature')
      expect(notes!.entries[0].tests_passed).toBe(true)
      expect(notes!.entries[0].files_changed).toEqual([
        { path: 'src/auth.ts', description: 'Added login' },
      ])
    })

    it('should append multiple entries in order', () => {
      const notesFile = join(tmpDir, 'notes.yaml')
      reportStep(notesFile, { summary: 'First task', testsPassed: true })
      reportStep(notesFile, { summary: 'Second task', testsPassed: false })

      const notes = notesManager.read()
      expect(notes!.entries).toHaveLength(2)
      expect(notes!.entries[0].summary).toBe('First task')
      expect(notes!.entries[1].summary).toBe('Second task')
      expect(notes!.entries[0].step).toBe(1)
      expect(notes!.entries[1].step).toBe(2)
    })

    it('should default files_changed to empty array', () => {
      const notesFile = join(tmpDir, 'notes.yaml')
      reportStep(notesFile, { summary: 'No files changed', testsPassed: true })

      const notes = notesManager.read()
      expect(notes!.entries[0].files_changed).toEqual([])
    })

    it('should fail gracefully when notes.yaml does not exist', () => {
      const result = reportStep(join(tmpDir, 'missing.yaml'), {
        summary: 'Should fail',
        testsPassed: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('does not exist')
    })
  })

  describe('reportStopCheck', () => {
    it('should write stop-check state to state dir', () => {
      const result = reportStopCheck(stateDir, {
        shouldStop: true,
        reason: 'All tests passing',
      })

      expect(result.success).toBe(true)
      expect(existsSync(join(stateDir, 'stop-check.json'))).toBe(true)

      const state = readStopCheck(stateDir)
      expect(state).not.toBeNull()
      expect(state!.should_stop).toBe(true)
      expect(state!.reason).toBe('All tests passing')
    })

    it('should overwrite previous stop-check state', () => {
      reportStopCheck(stateDir, { shouldStop: false, reason: 'Continue' })
      reportStopCheck(stateDir, { shouldStop: true, reason: 'Stop now' })

      const state = readStopCheck(stateDir)
      expect(state!.should_stop).toBe(true)
      expect(state!.reason).toBe('Stop now')
    })
  })

  describe('reportGap', () => {
    it('should write gap report to state dir', () => {
      const result = reportGap(stateDir, {
        gaps: ['Missing validation', 'No error handling'],
        summary: 'Found 2 gaps',
      })

      expect(result.success).toBe(true)
      expect(existsSync(join(stateDir, 'gap-report.json'))).toBe(true)

      const state = readGapReport(stateDir)
      expect(state).not.toBeNull()
      expect(state!.gaps).toEqual(['Missing validation', 'No error handling'])
      expect(state!.summary).toBe('Found 2 gaps')
    })

    it('should allow empty gaps array', () => {
      reportGap(stateDir, { gaps: [], summary: 'No gaps found' })

      const state = readGapReport(stateDir)
      expect(state!.gaps).toEqual([])
    })
  })

  describe('readLastEntry', () => {
    it('should return the last entry from notes.yaml', () => {
      const notesFile = join(tmpDir, 'notes.yaml')
      reportStep(notesFile, { summary: 'First', testsPassed: true })
      reportStep(notesFile, { summary: 'Last', testsPassed: false })

      const last = readLastEntry(notesFile)
      expect(last).not.toBeNull()
      expect(last!.summary).toBe('Last')
      expect(last!.tests_passed).toBe(false)
    })

    it('should return null when notes.yaml has no entries', () => {
      const last = readLastEntry(join(tmpDir, 'notes.yaml'))
      expect(last).toBeNull()
    })
  })
})
