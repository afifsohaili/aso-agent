import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import YAML from 'yaml'
import { exportDefaultConfig } from '../src/core/config-loader.js'

describe('config export', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-config-export-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should write aso-agent.yaml with all options and comments', () => {
    const filePath = exportDefaultConfig(tmpDir, false)

    expect(filePath).toBe(join(tmpDir, 'aso-agent.yaml'))
    expect(existsSync(filePath)).toBe(true)

    const content = readFileSync(filePath, 'utf-8')

    // Should contain top-level sections
    expect(content).toContain('session:')
    expect(content).toContain('opencode:')

    // Should contain all keys with defaults
    expect(content).toContain('max_iterations: 50')
    expect(content).toContain('max_time_per_iteration: 1800')
    expect(content).toContain('model:')
    expect(content).toContain('small_model:')
    expect(content).toContain('agent:')

    // Should contain explanatory comments
    expect(content).toContain('# Maximum number of implement')
    expect(content).toContain('# Primary model for the session')
    expect(content).toContain('# Agent type to use')

    // Should be valid YAML
    const parsed = YAML.parse(content)
    expect(parsed.session.max_iterations).toBe(50)
    expect(parsed.session.max_time_per_iteration).toBe(1800)
    expect(parsed.opencode.model).toBeTruthy()
    expect(parsed.opencode.small_model).toBeTruthy()
    expect(parsed.opencode.agent).toBe('build')
  })

  it('should throw when file already exists and force is false', () => {
    const filePath = join(tmpDir, 'aso-agent.yaml')
    writeFileSync(filePath, 'existing: content', 'utf-8')

    expect(() => exportDefaultConfig(tmpDir, false)).toThrow(
      'aso-agent.yaml already exists',
    )
  })

  it('should overwrite when force is true', () => {
    const filePath = join(tmpDir, 'aso-agent.yaml')
    writeFileSync(filePath, 'existing: content', 'utf-8')

    exportDefaultConfig(tmpDir, true)

    const content = readFileSync(filePath, 'utf-8')
    expect(content).toContain('session:')
    expect(content).toContain('opencode:')
    expect(content).not.toContain('existing: content')
  })

  it('should respect custom output path via -o flag (handled by CLI, path passthrough)', () => {
    const subDir = join(tmpDir, 'custom')
    mkdirSync(subDir, { recursive: true })
    const filePath = exportDefaultConfig(subDir, false)

    expect(filePath).toBe(join(subDir, 'aso-agent.yaml'))
    expect(existsSync(filePath)).toBe(true)

    const content = readFileSync(filePath, 'utf-8')
    expect(content).toContain('session:')
  })
})
