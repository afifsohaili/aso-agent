import { describe, it, expect } from 'vitest'

// Import the naming utilities (to be created)
// These will fail until we implement them

const { notesFileFromBranch, generateBranchName, generateSessionId, sanitizeSummary, checkBranchCollision } = await import('../src/core/naming.js')

describe('naming utilities', () => {
  describe('notesFileFromBranch', () => {
    it('should convert aso branch to notes file', () => {
      expect(notesFileFromBranch('aso/260507-add-user-auth')).toBe('notes-aso-260507-add-user-auth.yaml')
    })

    it('should convert branch with multiple slashes', () => {
      expect(notesFileFromBranch('aso/260507-fix-login-oauth-flow')).toBe('notes-aso-260507-fix-login-oauth-flow.yaml')
    })

    it('should convert branch with numbers only', () => {
      expect(notesFileFromBranch('aso/260507-123')).toBe('notes-aso-260507-123.yaml')
    })

    it('should handle branch with 40 char summary', () => {
      const longSummary = 'a'.repeat(40)
      expect(notesFileFromBranch(`aso/260507-${longSummary}`)).toBe(`notes-aso-260507-${longSummary}.yaml`)
    })
  })

  describe('generateBranchName', () => {
    it('should generate branch with yymmdd format', () => {
      const date = new Date('2026-05-07')
      expect(generateBranchName(date, 'add-user-auth')).toBe('aso/260507-add-user-auth')
    })

    it('should generate branch with year boundary date', () => {
      const date = new Date('2026-01-01')
      expect(generateBranchName(date, 'new-year-task')).toBe('aso/260101-new-year-task')
    })

    it('should generate branch with max 40 char summary', () => {
      const date = new Date('2026-05-07')
      const longSummary = 'a'.repeat(50)
      expect(generateBranchName(date, longSummary)).toBe(`aso/260507-${'a'.repeat(40)}`)
    })
  })

  describe('generateSessionId', () => {
    it('should generate session ID matching branch format', () => {
      const date = new Date('2026-05-07')
      expect(generateSessionId(date, 'add-user-auth')).toBe('aso-260507-add-user-auth')
    })
  })

  describe('sanitizeSummary', () => {
    it('should lowercase and hyphenate', () => {
      expect(sanitizeSummary('Add User Auth')).toBe('add-user-auth')
    })

    it('should remove special characters', () => {
      expect(sanitizeSummary('Fix: login & OAuth!')).toBe('fix-login-oauth')
    })

    it('should truncate to 40 chars', () => {
      expect(sanitizeSummary('implement user authentication with OAuth2 and session management')).toBe('implement-user-authentication-with-oauth')
    })

    it('should handle empty string', () => {
      expect(sanitizeSummary('')).toBe('')
    })
  })

  describe('checkBranchCollision', () => {
    it('should return original if no collision', () => {
      const existing = ['aso/260507-other-task']
      expect(checkBranchCollision('aso/260507-add-user-auth', existing)).toBe('aso/260507-add-user-auth')
    })

    it('should append -2 on first collision', () => {
      const existing = ['aso/260507-add-user-auth']
      expect(checkBranchCollision('aso/260507-add-user-auth', existing)).toBe('aso/260507-add-user-auth-2')
    })

    it('should append -3 on second collision', () => {
      const existing = ['aso/260507-add-user-auth', 'aso/260507-add-user-auth-2']
      expect(checkBranchCollision('aso/260507-add-user-auth', existing)).toBe('aso/260507-add-user-auth-3')
    })

    it('should handle collision with already numbered branch', () => {
      const existing = ['aso/260507-add-user-auth', 'aso/260507-add-user-auth-2', 'aso/260507-add-user-auth-3']
      expect(checkBranchCollision('aso/260507-add-user-auth', existing)).toBe('aso/260507-add-user-auth-4')
    })
  })
})