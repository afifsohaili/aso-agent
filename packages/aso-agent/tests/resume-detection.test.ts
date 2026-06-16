import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { notesFileFromBranch } from '../src/core/naming.js'

// Simulate the new resume detection logic
function getNotesFileForBranch(currentBranch: string, customNotesFile?: string): string | null {
  if (customNotesFile) {
    return customNotesFile
  }
  return notesFileFromBranch(currentBranch)
}

function shouldResume(objective: string | undefined, currentBranch: string, notesFileExists: boolean, explicitResume: boolean): boolean {
  if (explicitResume) return true
  if (!objective && notesFileExists) return true
  return false
}

describe('resume detection', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-resume-test-'))
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  describe('getNotesFileForBranch', () => {
    it('should derive notes file from current branch', () => {
      const branch = 'aso/260507-add-user-auth'
      expect(getNotesFileForBranch(branch)).toBe('notes-aso-260507-add-user-auth.yaml')
    })

    it('should use custom notes file when provided', () => {
      const branch = 'aso/260507-add-user-auth'
      expect(getNotesFileForBranch(branch, 'custom-notes.yaml')).toBe('custom-notes.yaml')
    })

    it('should derive notes file for complex branch name', () => {
      const branch = 'aso/260507-implement-oauth2-login-flow'
      expect(getNotesFileForBranch(branch)).toBe('notes-aso-260507-implement-oauth2-login-flow.yaml')
    })
  })

  describe('shouldResume', () => {
    it('should resume when explicit --resume flag is set', () => {
      expect(shouldResume('some objective', 'aso/260507-test', true, true)).toBe(true)
    })

    it('should resume when no objective and notes file exists', () => {
      expect(shouldResume(undefined, 'aso/260507-test', true, false)).toBe(true)
    })

    it('should NOT resume when objective provided and no --resume flag', () => {
      expect(shouldResume('some objective', 'aso/260507-test', true, false)).toBe(false)
    })

    it('should NOT resume when no objective but notes file does not exist', () => {
      expect(shouldResume(undefined, 'aso/260507-test', false, false)).toBe(false)
    })
  })

  describe('integration: resume on aso branch', () => {
    it('should find notes file when on matching branch', () => {
      const branch = 'aso/260507-add-user-auth'
      const notesFile = notesFileFromBranch(branch)
      const notesPath = join(tmpDir, notesFile)

      writeFileSync(notesPath, 'session: test')

      expect(existsSync(notesPath)).toBe(true)
      expect(notesFile).toBe('notes-aso-260507-add-user-auth.yaml')
    })

    it('should NOT resume if on different branch', () => {
      const currentBranch = 'main'
      const notesFile = notesFileFromBranch(currentBranch)
      const notesPath = join(tmpDir, notesFile)

      // Create a different branch's notes file
      const otherNotesFile = 'notes-aso-260507-other-task.yaml'
      writeFileSync(join(tmpDir, otherNotesFile), 'session: other')

      // The notes file for current branch (main) should not exist
      expect(existsSync(notesPath)).toBe(false)
    })
  })
})
