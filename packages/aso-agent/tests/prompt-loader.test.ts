import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PromptLoader } from '../src/core/prompt-loader.js'

describe('PromptLoader', () => {
  let tmpDir: string
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-prompt-test-'))
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  // ── Constructor ───────────────────────────────────────────────────

  describe('constructor', () => {
    it('should initialize with working directory', () => {
      const loader = new PromptLoader(tmpDir)
      expect(loader).toBeDefined()
    })
  })

  // ── load() — built-in prompts ─────────────────────────────────────

  describe('load built-in prompts', () => {
    it('should load a built-in prompt', () => {
      const loader = new PromptLoader(tmpDir)
      const result = loader.load('implementer', {})

      expect(result.source).toBe('built-in')
      expect(result.content).toContain('Figure out ONE small/medium task')
      expect(result.path).toContain('implementer.md')
    })

    it('should load another built-in prompt', () => {
      const loader = new PromptLoader(tmpDir)
      const result = loader.load('stop-check', {})

      expect(result.source).toBe('built-in')
      expect(result.content).toContain('stop condition')
    })

    it('should substitute variables in template', () => {
      const loader = new PromptLoader(tmpDir)
      const result = loader.load('stop-check', {
        stop_when: 'All tests pass',
        objectives: 'Build auth',
      })

      expect(result.content).toContain('All tests pass')
      expect(result.content).toContain('Build auth')
      expect(result.content).not.toContain('{{stop_when}}')
      expect(result.content).not.toContain('{{objectives}}')
    })

    it('should not have placeholders after substituting all known variables', () => {
      const loader = new PromptLoader(tmpDir)
      const result = loader.load('implementer', {
        objectives: 'Build auth',
      })

      expect(result.content).not.toContain('{{objectives}}')
      expect(result.content).toContain('Build auth')
    })
  })

  // ── load() — override prompts ─────────────────────────────────────

  describe('load override prompts', () => {
    it('should prefer override prompt over built-in', () => {
      const overrideDir = join(tmpDir, '.aso-agent', 'prompts')
      mkdirSync(overrideDir, { recursive: true })
      writeFileSync(
        join(overrideDir, 'implementer.md'),
        '# Overridden\n\nThis is the override version.',
      )

      const loader = new PromptLoader(tmpDir)
      const result = loader.load('implementer', {})

      expect(result.source).toBe('overridden')
      expect(result.content).toContain('This is the override version')
      expect(result.path).toContain('.aso-agent')
    })

    it('should apply variable substitution to override prompts', () => {
      const overrideDir = join(tmpDir, '.aso-agent', 'prompts')
      mkdirSync(overrideDir, { recursive: true })
      writeFileSync(
        join(overrideDir, 'custom-agent.md'),
        'Task: {{taskName}} for {{agentName}}',
      )

      const loader = new PromptLoader(tmpDir)
      const result = loader.load('custom-agent', {
        taskName: 'discovery',
        agentName: 'Alpha',
      })

      expect(result.source).toBe('overridden')
      expect(result.content).toBe('Task: discovery for Alpha')
    })
  })

  // ── load() — error cases ──────────────────────────────────────────

  describe('load error cases', () => {
    it('should throw when prompt is not found in built-in or override', () => {
      const loader = new PromptLoader(tmpDir)
      expect(() => loader.load('non-existent-agent', {})).toThrow(
        /Prompt not found for agent 'non-existent-agent'/,
      )
    })

    it('should include both paths in the error message', () => {
      const loader = new PromptLoader(tmpDir)
      try {
        loader.load('missing-agent', {})
        expect.fail('Expected load to throw')
      }
      catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        expect(msg).toContain('missing-agent.md')
        expect(msg).toContain('Expected built-in at:')
        expect(msg).toContain('or override at:')
      }
    })
  })

  // ── listBuiltins() ────────────────────────────────────────────────

  describe('listBuiltins', () => {
    it('should list all built-in prompt names without .md extension', () => {
      const loader = new PromptLoader(tmpDir)
      const builtins = loader.listBuiltins()

      expect(builtins).toContain('implementer')
      expect(builtins).toContain('stop-check')
      expect(builtins).not.toContain('implementer.md')
    })

    it('should only include .md files', () => {
      const loader = new PromptLoader(tmpDir)
      const builtins = loader.listBuiltins()

      for (const name of builtins) {
        expect(name).not.toContain('.')
      }
    })
  })

  // ── exportTo() ────────────────────────────────────────────────────

  describe('exportTo', () => {
    it('should export all built-in prompts to destination directory', () => {
      const loader = new PromptLoader(tmpDir)
      const result = loader.exportTo(tmpDir)

      expect(result.destDir).toBe(join(tmpDir, '.aso-agent', 'prompts'))
      expect(result.exported.length).toBeGreaterThanOrEqual(2)
      expect(result.exported).toContain('implementer')
      expect(result.exported).toContain('stop-check')

      // Verify files were actually copied
      const exportedPath = join(result.destDir, 'implementer.md')
      expect(existsSync(exportedPath)).toBe(true)
      const content = readFileSync(exportedPath, 'utf-8')
      expect(content).toContain('Figure out ONE small/medium task')
    })

    it('should create destination directory if it does not exist', () => {
      const loader = new PromptLoader(tmpDir)
      const destParent = join(tmpDir, 'new-project')
      expect(existsSync(join(destParent, '.aso-agent', 'prompts'))).toBe(false)

      loader.exportTo(destParent)

      expect(existsSync(join(destParent, '.aso-agent', 'prompts'))).toBe(true)
    })

    it('should overwrite existing files on export', () => {
      const loader = new PromptLoader(tmpDir)
      const destDir = join(tmpDir, '.aso-agent', 'prompts')
      mkdirSync(destDir, { recursive: true })
      writeFileSync(join(destDir, 'implementer.md'), 'old content')

      loader.exportTo(tmpDir)

      const content = readFileSync(join(destDir, 'implementer.md'), 'utf-8')
      expect(content).toContain('Figure out ONE small/medium task')
      expect(content).not.toContain('old content')
    })
  })
})
