import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../src/core/config-loader.js'

describe('config-loader', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-config-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should return empty defaults when no aso-agent.yaml exists', () => {
    const config = loadConfig(tmpDir)
    expect(config).toEqual({})
  })

  it('should not create aso-agent.yaml when it does not exist', () => {
    loadConfig(tmpDir)
    expect(existsSync(join(tmpDir, 'aso-agent.yaml'))).toBe(false)
  })

  it('should parse aso-agent.yaml when it exists', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'opencode:\n  model: anthropic/claude-sonnet-4-20250514\n',
      'utf-8',
    )

    const config = loadConfig(tmpDir)

    expect(config).toEqual({
      opencode: {
        model: 'anthropic/claude-sonnet-4-20250514',
      },
    })
  })

  it('should parse full config with all fields', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      [
        'session:',
        '  max_iterations: 100',
        '  max_time_per_iteration: 3600',
        'opencode:',
        '  model: anthropic/claude-sonnet-4-20250514',
        '  small_model: anthropic/claude-haiku-4-20250514',
        '  agent: plan',
      ].join('\n'),
      'utf-8',
    )

    const config = loadConfig(tmpDir)

    expect(config).toEqual({
      session: {
        max_iterations: 100,
        max_time_per_iteration: 3600,
      },
      opencode: {
        model: 'anthropic/claude-sonnet-4-20250514',
        small_model: 'anthropic/claude-haiku-4-20250514',
        agent: 'plan',
      },
    })
  })

  it('should parse config with only opencode section', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'opencode:\n  model: openai/gpt-4o\n',
      'utf-8',
    )

    const config = loadConfig(tmpDir)

    expect(config).toEqual({
      opencode: {
        model: 'openai/gpt-4o',
      },
    })
  })

  it('should parse config with only session section', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'session:\n  max_iterations: 10\n',
      'utf-8',
    )

    const config = loadConfig(tmpDir)

    expect(config).toEqual({
      session: {
        max_iterations: 10,
      },
    })
  })

  it('should throw on malformed YAML', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'opencode:\n  model: [unclosed list\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow()
  })

  it('should accept .yml extension as alternative', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yml'),
      'opencode:\n  model: anthropic/claude-sonnet-4-20250514\n',
      'utf-8',
    )

    const config = loadConfig(tmpDir)

    expect(config).toEqual({
      opencode: {
        model: 'anthropic/claude-sonnet-4-20250514',
      },
    })
  })

  it('should reject unknown top-level keys', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'foo: bar\nopencode:\n  model: x\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      "Invalid aso-agent.yaml: Unknown key 'foo' in '<root>'. Valid keys: session, opencode",
    )
  })

  it('should reject top-level value that is not an object', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'just a string',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      'Invalid aso-agent.yaml: Top-level value must be an object, got "just a string"',
    )
  })

  it('should reject null top-level value', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      '~',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      'Top-level value must be an object, got null',
    )
  })

  it('should reject session that is not an object', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'session: not-an-object\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      'Invalid aso-agent.yaml: \'session\' must be an object, got "not-an-object"',
    )
  })

  it('should reject session.max_iterations that is not a positive integer', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'session:\n  max_iterations: -1\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      "'session.max_iterations' must be a positive integer, got -1",
    )
  })

  it('should reject session.max_iterations that is a string', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'session:\n  max_iterations: "abc"\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      "'session.max_iterations' must be a positive integer, got \"abc\"",
    )
  })

  it('should reject session.max_time_per_iteration that is not a positive integer', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'session:\n  max_time_per_iteration: 0\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      "'session.max_time_per_iteration' must be a positive integer, got 0",
    )
  })

  it('should reject unknown keys in session', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'session:\n  foo: bar\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      "Unknown key 'foo' in 'session'. Valid keys: max_iterations, max_time_per_iteration",
    )
  })

  it('should reject opencode that is not an object', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'opencode: just-a-string\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      'Invalid aso-agent.yaml: \'opencode\' must be an object, got "just-a-string"',
    )
  })

  it('should reject opencode.model that is not a string', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'opencode:\n  model: 123\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      "'opencode.model' must be a non-empty string, got 123",
    )
  })

  it('should reject opencode.model that is empty string', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'opencode:\n  model: ""\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      "'opencode.model' must be a non-empty string, got \"\"",
    )
  })

  it('should reject opencode.small_model that is not a string', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'opencode:\n  small_model:\n    - list\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      "'opencode.small_model' must be a non-empty string, got array",
    )
  })

  it('should reject opencode.agent that is not a string', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'opencode:\n  agent: true\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      "'opencode.agent' must be a non-empty string, got true",
    )
  })

  it('should reject unknown keys in opencode', () => {
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'opencode:\n  model: x\n  foo: bar\n',
      'utf-8',
    )

    expect(() => loadConfig(tmpDir)).toThrow(
      "Unknown key 'foo' in 'opencode'. Valid keys: model, small_model, agent",
    )
  })

  it('should prefer .yaml over .yml when both exist', () => {
    // Write both
    writeFileSync(
      join(tmpDir, 'aso-agent.yaml'),
      'opencode:\n  model: from-yaml\n',
      'utf-8',
    )
    writeFileSync(
      join(tmpDir, 'aso-agent.yml'),
      'opencode:\n  model: from-yml\n',
      'utf-8',
    )

    const config = loadConfig(tmpDir)

    expect(config).toEqual({
      opencode: {
        model: 'from-yaml',
      },
    })
  })
})
