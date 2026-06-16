import { describe, it, expect, vi } from 'vitest'
import type { OpenCodeClient } from '../src/services/opencode-client.js'

// We'll import after implementing
const { summarizeObjective, localSummarize } = await import('../src/core/summarize-objective.js')

describe('summarize-objective', () => {
  describe('localSummarize', () => {
    it('should extract key words from objective', () => {
      expect(localSummarize('Add user authentication with OAuth2')).toBe('add-user-authentication-oauth2')
    })

    it('should remove stop words', () => {
      expect(localSummarize('Implement the user login and fix the bug')).toBe('implement-user-login-fix-bug')
    })

    it('should truncate to 40 chars', () => {
      expect(localSummarize('Implement a comprehensive user authentication system with OAuth2 integration and session management')).toBe('implement-comprehensive-user-authenticat')
    })

    it('should handle empty string', () => {
      expect(localSummarize('')).toBe('')
    })

    it('should handle objective with special characters', () => {
      expect(localSummarize('Fix: login & OAuth!')).toBe('fix-login-oauth')
    })
  })

  describe('summarizeObjective', () => {
    it('should use LLM when available and return clean summary', async () => {
      const mockClient = {
        createSession: vi.fn().mockResolvedValue({
          id: 'test-session',
          promptWithSchema: vi.fn().mockResolvedValue({ summary: 'add-user-auth' }),
        }),
      } as unknown as OpenCodeClient

      const result = await summarizeObjective('Add user authentication with OAuth2', mockClient)
      expect(result).toBe('add-user-auth')
    })

    it('should fall back to local summarization when LLM fails', async () => {
      const mockClient = {
        createSession: vi.fn().mockRejectedValue(new Error('Server down')),
      } as unknown as OpenCodeClient

      const result = await summarizeObjective('Add user authentication with OAuth2', mockClient)
      expect(result).toBe('add-user-authentication-oauth2')
    })

    it('should fall back when LLM returns invalid summary', async () => {
      const mockClient = {
        createSession: vi.fn().mockResolvedValue({
          id: 'test-session',
          promptWithSchema: vi.fn().mockResolvedValue({ summary: '' }),
        }),
      } as unknown as OpenCodeClient

      const result = await summarizeObjective('Add user authentication with OAuth2', mockClient)
      expect(result).toBe('add-user-authentication-oauth2')
    })

    it('should fall back when LLM returns summary with invalid chars', async () => {
      const mockClient = {
        createSession: vi.fn().mockResolvedValue({
          id: 'test-session',
          promptWithSchema: vi.fn().mockResolvedValue({ summary: 'user auth!!!' }),
        }),
      } as unknown as OpenCodeClient

      const result = await summarizeObjective('Add user authentication with OAuth2', mockClient)
      expect(result).toBe('user-auth') // sanitized
    })

    it('should handle no client provided', async () => {
      const result = await summarizeObjective('Add user authentication with OAuth2', null)
      expect(result).toBe('add-user-authentication-oauth2')
    })
  })
})
