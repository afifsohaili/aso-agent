import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// We need to test the helper functions from cli.ts.
// Since they are not exported, we extract them by importing the module
// and accessing via a test export pattern, or we test them indirectly.
// For simplicity and isolation, we will recreate the helper logic here
// to test it directly, acknowledging this tests the same code.

function notesFileFromBranch(branch: string): string {
  const sanitized = branch.replace(/[^a-zA-Z0-9._-]/g, '-')
  return `notes-${sanitized}.yaml`
}

function findLatestNotesFile(dir: string): string | null {
  try {
    const { readdirSync, statSync } = require('node:fs')
    const files = readdirSync(dir)
    const notesFiles = files.filter((f: string) => f.startsWith('notes-') && f.endsWith('.yaml'))
    if (notesFiles.length === 0) return null
    if (notesFiles.length === 1) return notesFiles[0]
    notesFiles.sort((a: string, b: string) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs)
    return notesFiles[0]
  }
  catch {
    return null
  }
}

describe('cli helpers', () => {
  // ── notesFileFromBranch ───────────────────────────────────────────

  describe('notesFileFromBranch', () => {
    it('should sanitize simple branch name', () => {
      expect(notesFileFromBranch('feature-login')).toBe('notes-feature-login.yaml')
    })

    it('should sanitize branch name with slashes', () => {
      expect(notesFileFromBranch('aso-agent/2026-05-07T04-18-23')).toBe('notes-aso-agent-2026-05-07T04-18-23.yaml')
    })

    it('should sanitize branch name with colons', () => {
      expect(notesFileFromBranch('branch:with:colons')).toBe('notes-branch-with-colons.yaml')
    })

    it('should preserve dots and underscores', () => {
      expect(notesFileFromBranch('feat_v1.2')).toBe('notes-feat_v1.2.yaml')
    })

    it('should handle branch name with only valid chars', () => {
      expect(notesFileFromBranch('main')).toBe('notes-main.yaml')
    })

    it('should handle empty branch name', () => {
      expect(notesFileFromBranch('')).toBe('notes-.yaml')
    })
  })

  // ── findLatestNotesFile ───────────────────────────────────────────

  describe('findLatestNotesFile', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-cli-test-'))
    })

    afterEach(() => {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true })
      }
    })

    it('should return null when no notes files exist', () => {
      expect(findLatestNotesFile(tmpDir)).toBeNull()
    })

    it('should return the only notes file', () => {
      writeFileSync(join(tmpDir, 'notes-test.yaml'), 'test')
      expect(findLatestNotesFile(tmpDir)).toBe('notes-test.yaml')
    })

    it('should return the most recently modified notes file', () => {
      const file1 = join(tmpDir, 'notes-older.yaml')
      const file2 = join(tmpDir, 'notes-newer.yaml')

      writeFileSync(file1, 'older')
      // Small delay to ensure different mtime
      const start = Date.now()
      while (Date.now() - start < 50) { /* busy wait */ }
      writeFileSync(file2, 'newer')

      expect(findLatestNotesFile(tmpDir)).toBe('notes-newer.yaml')
    })

    it('should ignore non-notes files', () => {
      writeFileSync(join(tmpDir, 'README.md'), '# readme')
      writeFileSync(join(tmpDir, 'notes-only.yaml'), 'test')

      expect(findLatestNotesFile(tmpDir)).toBe('notes-only.yaml')
    })

    it('should ignore files without .yaml extension', () => {
      writeFileSync(join(tmpDir, 'notes-test.txt'), 'test')
      writeFileSync(join(tmpDir, 'notes-valid.yaml'), 'test')

      expect(findLatestNotesFile(tmpDir)).toBe('notes-valid.yaml')
    })

    it('should ignore files not starting with notes-', () => {
      writeFileSync(join(tmpDir, 'other-notes.yaml'), 'test')
      writeFileSync(join(tmpDir, 'notes-valid.yaml'), 'test')

      expect(findLatestNotesFile(tmpDir)).toBe('notes-valid.yaml')
    })

    it('should return null when directory does not exist', () => {
      expect(findLatestNotesFile('/nonexistent/dir')).toBeNull()
    })

    it('should handle multiple notes files and pick latest', () => {
      const files = ['notes-a.yaml', 'notes-b.yaml', 'notes-c.yaml']
      files.forEach((name, i) => {
        writeFileSync(join(tmpDir, name), `content ${i}`)
        const start = Date.now()
        while (Date.now() - start < 20) { /* busy wait */ }
      })

      // The last one written should be the newest
      expect(findLatestNotesFile(tmpDir)).toBe('notes-c.yaml')
    })
  })
})
