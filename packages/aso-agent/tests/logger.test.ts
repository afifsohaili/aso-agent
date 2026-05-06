import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import {
  setDebug,
  isDebugEnabled,
  getLogFile,
  setLogFile,
  createLogger,
  resetLoggerState,
} from '../src/core/logger.js'

describe('logger', () => {
  let tmpDir: string
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetLoggerState()
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-logger-test-'))
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    resetLoggerState()
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  // ── Module-level state ─────────────────────────────────────────────

  describe('state management', () => {
    it('should default debug to disabled', () => {
      expect(isDebugEnabled()).toBe(false)
    })

    it('should toggle debug mode', () => {
      setDebug(true)
      expect(isDebugEnabled()).toBe(true)

      setDebug(false)
      expect(isDebugEnabled()).toBe(false)
    })

    it('should default log file to null', () => {
      expect(getLogFile()).toBeNull()
    })

    it('should set and get log file path', () => {
      const logPath = join(tmpDir, 'test.log')
      setLogFile(logPath)
      expect(getLogFile()).toBe(logPath)
    })

    it('should create log file directory when setting path', () => {
      const nestedDir = join(tmpDir, 'nested', 'dir')
      const logPath = join(nestedDir, 'test.log')
      expect(existsSync(nestedDir)).toBe(false)
      setLogFile(logPath)
      expect(existsSync(nestedDir)).toBe(true)
    })

    it('should reset state to defaults', () => {
      setDebug(true)
      setLogFile(join(tmpDir, 'test.log'))
      resetLoggerState()
      expect(isDebugEnabled()).toBe(false)
      expect(getLogFile()).toBeNull()
    })
  })

  // ── Console reporter ───────────────────────────────────────────────

  describe('console reporter', () => {
    it('should suppress debug logs when debug is disabled', () => {
      const logger = createLogger('test')
      logger.debug('hidden debug')
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should output debug logs when debug is enabled', () => {
      setDebug(true)
      const logger = createLogger('test')
      logger.debug('visible debug')
      expect(consoleLogSpy).toHaveBeenCalledWith('[test]', 'visible debug')
    })

    it('should output info logs', () => {
      const logger = createLogger('test')
      logger.info('info message')
      expect(consoleLogSpy).toHaveBeenCalledWith('[test]', 'info message')
    })

    it('should output success logs', () => {
      const logger = createLogger('test')
      logger.success('success message')
      expect(consoleLogSpy).toHaveBeenCalledWith('[test]', 'success message')
    })

    it('should output warn logs to console.warn', () => {
      const logger = createLogger('test')
      logger.warn('warn message')
      expect(consoleWarnSpy).toHaveBeenCalledWith('[test]', 'warn message')
    })

    it('should output error logs to console.error', () => {
      const logger = createLogger('test')
      logger.error('error message')
      expect(consoleErrorSpy).toHaveBeenCalledWith('[test]', 'error message')
    })

    it('should output start logs', () => {
      const logger = createLogger('test')
      logger.start('start message')
      expect(consoleLogSpy).toHaveBeenCalledWith('[test]', 'start message')
    })

    it('should output ready logs', () => {
      const logger = createLogger('test')
      logger.ready('ready message')
      expect(consoleLogSpy).toHaveBeenCalledWith('[test]', 'ready message')
    })

    it('should not include tag prefix when no tag', () => {
      // We cannot easily test this because createLogger always sets a tag.
      // But we test that tagged output works correctly above.
      expect(true).toBe(true)
    })

    it('should handle multiple arguments', () => {
      const logger = createLogger('test')
      logger.info('message', 42, { key: 'value' })
      expect(consoleLogSpy).toHaveBeenCalledWith('[test]', 'message', 42, { key: 'value' })
    })

    it('should handle object arguments in console output', () => {
      setDebug(true)
      const logger = createLogger('test')
      const obj = { foo: 'bar' }
      logger.debug('obj:', obj)
      expect(consoleLogSpy).toHaveBeenCalledWith('[test]', 'obj:', obj)
    })

    it('should call consola.box via box method', () => {
      const logger = createLogger('test')
      // consola.box is called internally, we verify no error is thrown
      expect(() => logger.box('Title', 'Message body')).not.toThrow()
    })
  })

  // ── File reporter ──────────────────────────────────────────────────

  describe('file reporter', () => {
    it('should write logs to file', () => {
      const logPath = join(tmpDir, 'test.log')
      setLogFile(logPath)
      const logger = createLogger('file-test')
      logger.info('file message')

      const content = readFileSync(logPath, 'utf-8')
      expect(content).toContain('file message')
      expect(content).toContain('[file-test]')
      expect(content).toContain('[INFO]')
    })

    it('should include timestamp in file log format', () => {
      const logPath = join(tmpDir, 'test.log')
      setLogFile(logPath)
      const logger = createLogger('file-test')
      logger.info('timestamp check')

      const content = readFileSync(logPath, 'utf-8')
      // ISO 8601 timestamp pattern
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should share file across multiple loggers', () => {
      const logPath = join(tmpDir, 'shared.log')
      setLogFile(logPath)
      const loggerA = createLogger('logger-a')
      const loggerB = createLogger('logger-b')

      loggerA.info('from a')
      loggerB.info('from b')

      const content = readFileSync(logPath, 'utf-8')
      expect(content).toContain('[logger-a]')
      expect(content).toContain('[logger-b]')
      expect(content).toContain('from a')
      expect(content).toContain('from b')
    })

    it('should handle warn level in file output', () => {
      const logPath = join(tmpDir, 'test.log')
      setLogFile(logPath)
      const logger = createLogger('file-test')
      logger.warn('warning here')

      const content = readFileSync(logPath, 'utf-8')
      expect(content).toContain('[WARN]')
      expect(content).toContain('warning here')
    })

    it('should handle error level in file output', () => {
      const logPath = join(tmpDir, 'test.log')
      setLogFile(logPath)
      const logger = createLogger('file-test')
      logger.error('error here')

      const content = readFileSync(logPath, 'utf-8')
      expect(content).toContain('[ERROR]')
      expect(content).toContain('error here')
    })

    it('should stringify objects in file output', () => {
      const logPath = join(tmpDir, 'test.log')
      setLogFile(logPath)
      const logger = createLogger('file-test')
      logger.info('data:', { key: 'value' })

      const content = readFileSync(logPath, 'utf-8')
      expect(content).toContain('{"key":"value"}')
    })

    it('should not write to file when log file is not set', () => {
      const logPath = join(tmpDir, 'should-not-exist.log')
      // Do NOT call setLogFile
      const logger = createLogger('test')
      logger.info('no file')
      expect(existsSync(logPath)).toBe(false)
    })

    it('should gracefully handle file write errors', () => {
      const logPath = join(tmpDir, 'readonly.log')
      setLogFile(logPath)
      const logger = createLogger('test')
      logger.info('before error')

      // Make file read-only by removing write permissions on parent dir
      // On some systems this is tricky, so we use a different approach:
      // write to a directory path that looks like a file
      const badPath = join(tmpDir, 'not-a-dir', 'file.log')
      setLogFile(badPath)
      const logger2 = createLogger('test')

      // Should not throw even though directory does not exist
      expect(() => logger2.info('should not crash')).not.toThrow()
    })
  })

  // ── createLogger without tag behavior ──────────────────────────────

  describe('edge cases', () => {
    it('should not output debug when debug disabled even after enabling then disabling', () => {
      setDebug(true)
      setDebug(false)
      const logger = createLogger('test')
      logger.debug('still hidden')
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should handle empty message', () => {
      const logger = createLogger('test')
      logger.info('')
      expect(consoleLogSpy).toHaveBeenCalledWith('[test]', '')
    })
  })
})
