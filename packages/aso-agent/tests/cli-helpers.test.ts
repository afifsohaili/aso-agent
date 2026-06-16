import { describe, it, expect } from 'vitest'
import { notesFileFromBranch } from '../src/core/naming.js'

describe('cli notes file derivation', () => {
  describe('notesFileFromBranch', () => {
    it('should derive notes file from aso branch', () => {
      expect(notesFileFromBranch('aso/260507-add-user-auth')).toBe('notes-aso-260507-add-user-auth.yaml')
    })

    it('should derive notes file from aso branch with long summary', () => {
      expect(notesFileFromBranch('aso/260507-implement-comprehensive-user-authentication')).toBe('notes-aso-260507-implement-comprehensive-user-authentication.yaml')
    })

    it('should derive notes file from branch with collision counter', () => {
      expect(notesFileFromBranch('aso/260507-add-user-auth-2')).toBe('notes-aso-260507-add-user-auth-2.yaml')
    })

    it('should handle simple branch names', () => {
      expect(notesFileFromBranch('main')).toBe('notes-main.yaml')
    })
  })
})
