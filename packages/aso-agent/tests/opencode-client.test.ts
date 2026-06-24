import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, lstatSync, readlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OpenCodeClient, OpenCodeSession } from '../src/services/opencode-client.js'
import type { OpenCodeConfig } from '../src/types/index.js'

// Mock child_process spawn and exec
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}))

import { spawn, exec } from 'node:child_process'

/**
 * Resolve the actual path to @tarquinen/opencode-dcp for test use.
 */
async function resolveDcpPackageRoot(): Promise<string | null> {
  try {
    const url = await import.meta.resolve('@tarquinen/opencode-dcp')
    const entryPath = fileURLToPath(url)
    return dirname(dirname(entryPath))
  }
  catch {
    return null
  }
}

function createMockProcess() {
  const eventHandlers: Record<string, Array<(...args: any[]) => void>> = {}

  const mockProcess = {
    stdout: {
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        if (!eventHandlers[`stdout:${event}`]) eventHandlers[`stdout:${event}`] = []
        eventHandlers[`stdout:${event}`].push(handler)
      }),
    },
    stderr: {
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        if (!eventHandlers[`stderr:${event}`]) eventHandlers[`stderr:${event}`] = []
        eventHandlers[`stderr:${event}`].push(handler)
      }),
    },
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (!eventHandlers[event]) eventHandlers[event] = []
      eventHandlers[event].push(handler)
    }),
    kill: vi.fn(),
    emit: (event: string, ...args: any[]) => {
      eventHandlers[event]?.forEach(h => h(...args))
    },
  }

  return { mockProcess, eventHandlers }
}

describe('OpenCodeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should pick a random 5-digit port when none is provided', () => {
    const client = new OpenCodeClient()
    // @ts-expect-error accessing private for test
    const port = client.serverPort
    expect(port).toBeGreaterThanOrEqual(10000)
    expect(port).toBeLessThanOrEqual(65535)
  })

  it('should respect an explicitly provided port', () => {
    const client = new OpenCodeClient({ port: 4242 })
    // @ts-expect-error accessing private for test
    expect(client.serverPort).toBe(4242)
    // @ts-expect-error accessing private for test
    expect(client.baseUrl).toBe('http://localhost:4242')
  })

  it('should retry up to 5 times with different ports on health check failure', async () => {
    const { mockProcess } = createMockProcess()
    const spawnMock = vi.mocked(spawn)
    spawnMock.mockReturnValue(mockProcess as any)

    // Unmocked fetch will fail (ECONNREFUSED), triggering health check failure
    const client = new OpenCodeClient({ startupDelayMs: 10, stopTimeoutMs: 10 })

    await expect(client.startServer()).rejects.toThrow('Failed to start OpenCode server after 5 attempts')
    expect(spawnMock).toHaveBeenCalledTimes(5)

    // Verify different ports were used
    const ports = spawnMock.mock.calls.map(call => Number(call[1]![2]))
    const uniquePorts = new Set(ports)
    expect(uniquePorts.size).toBe(5)
  })

  it('should only try once when an explicit port is provided', async () => {
    const { mockProcess } = createMockProcess()
    const spawnMock = vi.mocked(spawn)
    spawnMock.mockReturnValue(mockProcess as any)

    const client = new OpenCodeClient({ port: 9999, startupDelayMs: 10, stopTimeoutMs: 10 })

    await expect(client.startServer()).rejects.toThrow('Failed to start OpenCode server after 1 attempt')
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      ['serve', '--port', '9999'],
      expect.any(Object),
    )
  })

  it('should succeed on the first attempt if health check passes', async () => {
    const { mockProcess } = createMockProcess()
    const spawnMock = vi.mocked(spawn)
    spawnMock.mockReturnValue(mockProcess as any)

    // Mock fetch to return ok on health check
    global.fetch = vi.fn().mockResolvedValue({ ok: true })

    const client = new OpenCodeClient({ startupDelayMs: 10, stopTimeoutMs: 10 })

    await expect(client.startServer()).resolves.toBeUndefined()
    expect(spawnMock).toHaveBeenCalledTimes(1)

    // Verify the port used was in the 5-digit range
    const port = Number(spawnMock.mock.calls[0]![1]![2])
    expect(port).toBeGreaterThanOrEqual(10000)
    expect(port).toBeLessThanOrEqual(65535)
  })

  it('should succeed on a retry after initial health check failure', async () => {
    const spawnMock = vi.mocked(spawn)
    let callCount = 0

    spawnMock.mockImplementation(() => {
      const { mockProcess } = createMockProcess()
      callCount++
      return mockProcess as any
    })

    // Fail first 2 health checks, succeed on 3rd
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValueOnce({ ok: true })

    const client = new OpenCodeClient({ startupDelayMs: 10, stopTimeoutMs: 10 })

    await expect(client.startServer()).resolves.toBeUndefined()
    expect(spawnMock).toHaveBeenCalledTimes(3)

    // Verify different ports were used
    const ports = spawnMock.mock.calls.map(call => Number(call[1]![2]))
    const uniquePorts = new Set(ports)
    expect(uniquePorts.size).toBe(3)
  })

  // ── checkHealth ───────────────────────────────────────────────────

  describe('checkHealth', () => {
    it('should return true when server responds with ok', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
      const client = new OpenCodeClient({ port: 12345 })

      const result = await client.checkHealth()

      expect(result).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:12345/global/health')
    })

    it('should return false when server responds with error status', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
      const client = new OpenCodeClient({ port: 12345 })

      const result = await client.checkHealth()

      expect(result).toBe(false)
    })

    it('should return false when fetch throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      const client = new OpenCodeClient({ port: 12345 })

      const result = await client.checkHealth()

      expect(result).toBe(false)
    })
  })

  // ── createSession ─────────────────────────────────────────────────

  describe('createSession', () => {
    it('should create session and return OpenCodeSession', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '{"id": "session-abc"}',
      })
      const client = new OpenCodeClient({ port: 12345 })

      const session = await client.createSession()

      expect(session.id).toBe('session-abc')
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:12345/session',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: undefined }),
        }),
      )
    })

    it('should send title when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '{"id": "session-xyz"}',
      })
      const client = new OpenCodeClient({ port: 12345 })

      await client.createSession({ title: 'My Session' })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ title: 'My Session' }),
        }),
      )
    })

    it('should throw when server returns error status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'error',
      })
      const client = new OpenCodeClient({ port: 12345 })

      await expect(client.createSession()).rejects.toThrow('Failed to create session: 500 Internal Server Error')
    })

    it('should throw when server returns non-JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'not json',
      })
      const client = new OpenCodeClient({ port: 12345 })

      await expect(client.createSession()).rejects.toThrow('Server returned non-JSON response')
    })
  })

  // ── getSession ────────────────────────────────────────────────────

  describe('getSession', () => {
    it('should return OpenCodeSession with given ID', () => {
      const client = new OpenCodeClient({ port: 12345 })
      const session = client.getSession('existing-session')

      expect(session.id).toBe('existing-session')
    })
  })

  // ── writeConfig / removeConfig ────────────────────────────────────

  describe('writeConfig', () => {
    it('should write opencode.json to working directory', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })

      await client.writeConfig(tmpDir)

      const configPath = join(tmpDir, 'opencode.json')
      expect(existsSync(configPath)).toBe(true)

      const content = readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      expect(config.$schema).toBe('https://opencode.ai/config.json')
      expect(config.permission).toBe('allow')

      rmSync(tmpDir, { recursive: true })
    })

    it('should include plugin references in opencode.json', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })
      const dcpRoot = await resolveDcpPackageRoot()
      vi.spyOn(client as any, 'resolveDcpPath').mockResolvedValue(dcpRoot)

      await client.writeConfig(tmpDir)

      const configPath = join(tmpDir, 'opencode.json')
      const content = readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      expect(config.plugin).toContain('aso-agent-opencode-hooks')
      expect(config.plugin).toContain('@tarquinen/opencode-dcp')

      rmSync(tmpDir, { recursive: true })
    })

    it('should write aso-agent-opencode-hooks plugin to .opencode/plugins/', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })

      await client.writeConfig(tmpDir)

      const pluginPath = join(tmpDir, '.opencode', 'plugins', 'aso-agent-opencode-hooks.ts')
      expect(existsSync(pluginPath)).toBe(true)

      const pluginContent = readFileSync(pluginPath, 'utf-8')
      expect(pluginContent).toContain('experimental.session.compacting')
      expect(pluginContent).toContain('CRITICAL WORKFLOW INSTRUCTION')
      expect(pluginContent).toContain('ONE small incremental task')

      rmSync(tmpDir, { recursive: true })
    })

    it('should copy aso-agent skill to .opencode/skills/', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })

      await client.writeConfig(tmpDir)

      const skillPath = join(tmpDir, '.opencode', 'skills', 'aso-agent', 'SKILL.md')
      expect(existsSync(skillPath)).toBe(true)

      const skillContent = readFileSync(skillPath, 'utf-8')
      expect(skillContent).toContain('name: aso-agent')
      expect(skillContent).toContain('aso-agent report-step')
      expect(skillContent).toContain('aso-agent stop-check')
      expect(skillContent).toContain('aso-agent gap-report')

      rmSync(tmpDir, { recursive: true })
    })

    it('should write dcp.jsonc config file to .opencode/', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })

      await client.writeConfig(tmpDir)

      const dcpConfigPath = join(tmpDir, '.opencode', 'dcp.jsonc')
      expect(existsSync(dcpConfigPath)).toBe(true)

      const content = readFileSync(dcpConfigPath, 'utf-8')
      expect(content).toContain('"mode": "range"')
      expect(content).toContain('"nudgeForce": "soft"')
      expect(content).toContain('"nudgeFrequency": 5')
      expect(content).toContain('"maxContextLimit": "80%"')
      expect(content).toContain('"minContextLimit": "60%"')
      expect(content).toContain('"showCompression": true')
      expect(content).toContain('"protectUserMessages": true')
      expect(content).toContain('"turnProtection"')

      rmSync(tmpDir, { recursive: true })
    })

    it('should create DCP symlink in .opencode/node_modules/', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })
      const dcpRoot = await resolveDcpPackageRoot()
      expect(dcpRoot).not.toBeNull()
      vi.spyOn(client as any, 'resolveDcpPath').mockResolvedValue(dcpRoot)

      await client.writeConfig(tmpDir)

      const symlinkPath = join(tmpDir, '.opencode', 'node_modules', '@tarquinen', 'opencode-dcp')
      expect(existsSync(symlinkPath)).toBe(true)

      const stat = lstatSync(symlinkPath)
      expect(stat.isSymbolicLink()).toBe(true)

      const target = readlinkSync(symlinkPath)
      expect(target).toBe(dcpRoot)

      rmSync(tmpDir, { recursive: true })
    })

    it('should write model to opencode.json when OpenCodeConfig has model', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })
      const config: OpenCodeConfig = { model: 'anthropic/claude-sonnet-4-20250514' }

      await client.writeConfig(tmpDir, config)

      const configPath = join(tmpDir, 'opencode.json')
      const content = readFileSync(configPath, 'utf-8')
      const json = JSON.parse(content)
      expect(json.model).toBe('anthropic/claude-sonnet-4-20250514')

      rmSync(tmpDir, { recursive: true })
    })

    it('should write small_model to opencode.json when provided', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })
      const config: OpenCodeConfig = { small_model: 'anthropic/claude-haiku-4-20250514' }

      await client.writeConfig(tmpDir, config)

      const configPath = join(tmpDir, 'opencode.json')
      const content = readFileSync(configPath, 'utf-8')
      const json = JSON.parse(content)
      expect(json.small_model).toBe('anthropic/claude-haiku-4-20250514')

      rmSync(tmpDir, { recursive: true })
    })

    it('should write default_agent to opencode.json when OpenCodeConfig has agent', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })
      const config: OpenCodeConfig = { agent: 'plan' }

      await client.writeConfig(tmpDir, config)

      const configPath = join(tmpDir, 'opencode.json')
      const content = readFileSync(configPath, 'utf-8')
      const json = JSON.parse(content)
      expect(json.default_agent).toBe('plan')
      expect(json.agent).toBeUndefined()

      rmSync(tmpDir, { recursive: true })
    })

    it('should write all opencode config fields when provided', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })
      const config: OpenCodeConfig = {
        model: 'anthropic/claude-sonnet-4-20250514',
        small_model: 'anthropic/claude-haiku-4-20250514',
        agent: 'build',
      }

      await client.writeConfig(tmpDir, config)

      const configPath = join(tmpDir, 'opencode.json')
      const content = readFileSync(configPath, 'utf-8')
      const json = JSON.parse(content)
      expect(json.model).toBe('anthropic/claude-sonnet-4-20250514')
      expect(json.small_model).toBe('anthropic/claude-haiku-4-20250514')
      expect(json.default_agent).toBe('build')

      rmSync(tmpDir, { recursive: true })
    })

    it('should not add model/agent fields when OpenCodeConfig is empty', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })

      await client.writeConfig(tmpDir, {})

      const configPath = join(tmpDir, 'opencode.json')
      const content = readFileSync(configPath, 'utf-8')
      const json = JSON.parse(content)
      expect(json.model).toBeUndefined()
      expect(json.small_model).toBeUndefined()
      expect(json.default_agent).toBeUndefined()

      rmSync(tmpDir, { recursive: true })
    })

    it('should not add model/agent fields when called without OpenCodeConfig', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })

      await client.writeConfig(tmpDir)

      const configPath = join(tmpDir, 'opencode.json')
      const content = readFileSync(configPath, 'utf-8')
      const json = JSON.parse(content)
      expect(json.model).toBeUndefined()
      expect(json.small_model).toBeUndefined()
      expect(json.default_agent).toBeUndefined()

      rmSync(tmpDir, { recursive: true })
    })

    it('should handle DCP not available gracefully (no symlink, no dcp.jsonc)', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })

      // Mock resolveDcpPath to return null (DCP not available)
      vi.spyOn(client as any, 'resolveDcpPath').mockResolvedValue(null)

      await client.writeConfig(tmpDir)

      // opencode.json should NOT include @tarquinen/opencode-dcp
      const configPath = join(tmpDir, 'opencode.json')
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(config.plugin).toEqual(['aso-agent-opencode-hooks'])
      expect(config.plugin).not.toContain('@tarquinen/opencode-dcp')

      // No dcp.jsonc should be written
      const dcpConfigPath = join(tmpDir, '.opencode', 'dcp.jsonc')
      expect(existsSync(dcpConfigPath)).toBe(false)

      // No symlink should be created
      const symlinkPath = join(tmpDir, '.opencode', 'node_modules', '@tarquinen', 'opencode-dcp')
      expect(existsSync(symlinkPath)).toBe(false)

      rmSync(tmpDir, { recursive: true })
    })

    it('should preserve existing fields when OpenCodeConfig is provided', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })
      const config: OpenCodeConfig = { model: 'anthropic/claude-sonnet-4-20250514' }

      await client.writeConfig(tmpDir, config)

      const configPath = join(tmpDir, 'opencode.json')
      const content = readFileSync(configPath, 'utf-8')
      const json = JSON.parse(content)
      expect(json.$schema).toBe('https://opencode.ai/config.json')
      expect(json.permission).toBe('allow')
      expect(json.plugin).toContain('aso-agent-opencode-hooks')
      expect(json.plugin).toContain('@tarquinen/opencode-dcp')
      expect(json.model).toBe('anthropic/claude-sonnet-4-20250514')

      rmSync(tmpDir, { recursive: true })
    })
  })

  describe('removeConfig', () => {
    it('should remove opencode.json if it exists', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const configPath = join(tmpDir, 'opencode.json')
      writeFileSync(configPath, '{}', 'utf-8')

      const client = new OpenCodeClient({ port: 12345 })
      client.removeConfig(tmpDir)

      expect(existsSync(configPath)).toBe(false)

      rmSync(tmpDir, { recursive: true })
    })

    it('should not throw when opencode.json does not exist', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })

      expect(() => client.removeConfig(tmpDir)).not.toThrow()

      rmSync(tmpDir, { recursive: true })
    })

    it('should remove aso-agent-opencode-hooks plugin file', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const pluginDir = join(tmpDir, '.opencode', 'plugins')
      const pluginPath = join(pluginDir, 'aso-agent-opencode-hooks.ts')

      // Setup: write plugin file
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(pluginPath, 'plugin content', 'utf-8')
      expect(existsSync(pluginPath)).toBe(true)

      const client = new OpenCodeClient({ port: 12345 })
      client.removeConfig(tmpDir)

      expect(existsSync(pluginPath)).toBe(false)

      rmSync(tmpDir, { recursive: true })
    })

    it('should clean up empty .opencode/plugins/ directory', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const pluginDir = join(tmpDir, '.opencode', 'plugins')
      const pluginPath = join(pluginDir, 'aso-agent-opencode-hooks.ts')

      // Setup: write plugin file
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(pluginPath, 'plugin content', 'utf-8')

      const client = new OpenCodeClient({ port: 12345 })
      client.removeConfig(tmpDir)

      // Directory should be removed since it was empty after removing plugin
      expect(existsSync(pluginDir)).toBe(false)

      rmSync(tmpDir, { recursive: true, force: true })
    })

    it('should not remove .opencode/plugins/ if it contains other files', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const pluginDir = join(tmpDir, '.opencode', 'plugins')
      const pluginPath = join(pluginDir, 'aso-agent-opencode-hooks.ts')
      const otherFile = join(pluginDir, 'other-plugin.ts')

      // Setup: write plugin file and another file
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(pluginPath, 'plugin content', 'utf-8')
      writeFileSync(otherFile, 'other content', 'utf-8')

      const client = new OpenCodeClient({ port: 12345 })
      client.removeConfig(tmpDir)

      // Plugin should be removed but directory preserved
      expect(existsSync(pluginPath)).toBe(false)
      expect(existsSync(otherFile)).toBe(true)
      expect(existsSync(pluginDir)).toBe(true)

      rmSync(tmpDir, { recursive: true })
    })

    it('should remove dcp.jsonc config file if it exists', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const dcpConfigPath = join(tmpDir, '.opencode', 'dcp.jsonc')

      // Setup
      mkdirSync(join(tmpDir, '.opencode'), { recursive: true })
      writeFileSync(dcpConfigPath, '{}', 'utf-8')
      expect(existsSync(dcpConfigPath)).toBe(true)

      const client = new OpenCodeClient({ port: 12345 })
      client.removeConfig(tmpDir)

      expect(existsSync(dcpConfigPath)).toBe(false)

      rmSync(tmpDir, { recursive: true })
    })

    it('should remove DCP symlink if it exists', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const dcpSymlinkDir = join(tmpDir, '.opencode', 'node_modules', '@tarquinen')
      const dcpSymlinkPath = join(dcpSymlinkDir, 'opencode-dcp')

      // Setup: create a symlink pointing to a non-existent target
      mkdirSync(dcpSymlinkDir, { recursive: true })
      const { symlinkSync } = require('node:fs')
      symlinkSync('/tmp/non-existent-target', dcpSymlinkPath, 'dir')
      // existsSync returns false for broken symlinks; use lstatSync
      expect(lstatSync(dcpSymlinkPath).isSymbolicLink()).toBe(true)

      const client = new OpenCodeClient({ port: 12345 })
      client.removeConfig(tmpDir)

      expect(existsSync(dcpSymlinkPath)).toBe(false)

      rmSync(tmpDir, { recursive: true })
    })
  })

  // ── getMcpStatus ──────────────────────────────────────────────────

  describe('getMcpStatus', () => {
    it('should return MCP server statuses', async () => {
      const mockData = [
        { name: 'browser', status: 'running' },
        { name: 'filesystem', status: 'running' },
      ]
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      })
      const client = new OpenCodeClient({ port: 12345 })

      const result = await client.getMcpStatus()

      expect(result).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:12345/mcp/status')
    })

    it('should throw when MCP status endpoint fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      })
      const client = new OpenCodeClient({ port: 12345 })

      await expect(client.getMcpStatus()).rejects.toThrow('Failed to get MCP status: Not Found')
    })
  })

  // ── abort ───────────────────────────────────────────────────────

  describe('abort', () => {
    it('should POST to /session/:id/abort and return true on success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => true,
      })
      const session = new OpenCodeSession('http://localhost:12345', 'session-test')

      const result = await session.abort()

      expect(result).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:12345/session/session-test/abort',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('should return false when abort request fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })
      const session = new OpenCodeSession('http://localhost:12345', 'session-test')

      const result = await session.abort()

      expect(result).toBe(false)
    })

    it('should return false when fetch throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      const session = new OpenCodeSession('http://localhost:12345', 'session-test')

      const result = await session.abort()

      expect(result).toBe(false)
    })
  })

  // ── promptWithSchema ─────────────────────────────────────────────

  describe('promptWithSchema', () => {
    it('should include YAML template in nudge message when parsing fails', async () => {
      // Mock sleep to avoid 60s poll interval
      vi.spyOn(OpenCodeSession.prototype as any, 'sleep').mockResolvedValue(undefined)

      // Mock fetch with sequential responses
      global.fetch = vi.fn()

      const fetchMock = vi.mocked(global.fetch)

      // Call 1: getMessages pre-prompt → empty
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      // Call 2: POST fire prompt → ok
      fetchMock.mockResolvedValueOnce({ ok: true } as Response)
      // Call 3: getMessages poll 1 → bad YAML
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          info: { id: 'msg-1', role: 'assistant', finish: 'stop' },
          parts: [{ type: 'text', text: 'broken: yaml:' }],
        }],
      } as Response)
      // Call 4: POST nudge 1 → ok
      fetchMock.mockResolvedValueOnce({ ok: true } as Response)
      // Call 5: getMessages poll 2 → bad YAML again
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          info: { id: 'msg-2', role: 'assistant', finish: 'stop' },
          parts: [{ type: 'text', text: 'still: broken:' }],
        }],
      } as Response)
      // Call 6: POST nudge 2 → ok
      fetchMock.mockResolvedValueOnce({ ok: true } as Response)
      // Call 7: getMessages poll 3 → bad YAML (no retries left → throws)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          info: { id: 'msg-3', role: 'assistant', finish: 'stop' },
          parts: [{ type: 'text', text: 'still: broken:' }],
        }],
      } as Response)

      const schema = {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      }

      const session = new OpenCodeSession('http://localhost:12345', 'session-test')

      // Should throw after retries exhausted
      await expect(session.promptWithSchema('test prompt', schema)).rejects.toThrow()

      // Find nudge POSTs (contain "did not contain valid YAML" — not the initial prompt)
      const nudgeBodies = fetchMock.mock.calls
        .filter(call => {
          if (!call[1] || typeof call[1] !== 'object') return false
          const init = call[1] as RequestInit
          if (init.method !== 'POST') return false
          const body = JSON.parse(init.body as string)
          return body.parts?.[0]?.text?.includes('did not contain valid YAML')
        })
        .map(call => JSON.parse((call[1] as RequestInit).body as string))

      expect(nudgeBodies.length).toBe(2)

      for (const body of nudgeBodies) {
        const text: string = body.parts[0].text
        expect(text).toContain('summary: <string>')
        expect(text).toContain('Expected format')
        expect(text).toContain('```yaml')
      }
    })

    it('should abort, send continue message, and resume polling when response times out', async () => {
      vi.useFakeTimers()

      global.fetch = vi.fn()
      const fetchMock = vi.mocked(global.fetch)

      const schema = {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      }

      // 1. baseline GET → empty
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      // 2. POST prompt → ok
      fetchMock.mockResolvedValueOnce({ ok: true } as Response)
      // 3-7. five poll GETs → no assistant
      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      }
      // 8. POST abort → true
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => true } as Response)
      // 9. GET messages after abort → empty
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      // 10. POST continue → ok
      fetchMock.mockResolvedValueOnce({ ok: true } as Response)
      // 11. GET messages after continue → valid YAML
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          info: { id: 'msg-continue', role: 'assistant', finish: 'stop' },
          parts: [{ type: 'text', text: '```yaml\nsummary: completed\n```' }],
        }],
      } as Response)

      const session = new OpenCodeSession('http://localhost:12345', 'session-test')

      const promise = session.promptWithSchema('test prompt', schema, {
        pollIntervalMs: 1000,
        maxWaitMs: 5000,
        interruptWaitMs: 1000,
        maxInterruptCycles: 2,
      })

      // Let initial fire-and-forget POST complete
      await vi.advanceTimersByTimeAsync(0)

      // Advance through first timeout window (5 polls at 1s each)
      await vi.advanceTimersByTimeAsync(6000)

      // Abort, wait, after-abort GET, continue POST, then response poll
      await vi.advanceTimersByTimeAsync(3000)

      const result = await promise

      expect(result).toEqual({ summary: 'completed' })

      // Verify abort was called
      const abortCalls = fetchMock.mock.calls.filter(call =>
        call[0] === 'http://localhost:12345/session/session-test/abort',
      )
      expect(abortCalls.length).toBe(1)

      // Verify continue message was sent
      const continueCalls = fetchMock.mock.calls.filter(call => {
        if (call[0] !== 'http://localhost:12345/session/session-test/message') return false
        if (!call[1] || typeof call[1] !== 'object') return false
        const body = JSON.parse((call[1] as RequestInit).body as string)
        return body.parts?.[0]?.text?.includes('continue')
      })
      expect(continueCalls.length).toBe(1)
      const continueBody = JSON.parse((continueCalls[0]![1] as RequestInit).body as string)
      expect(continueBody.parts[0].text).toContain('continue from where you left off')

      vi.useRealTimers()
    })

    it('should throw after exhausting interrupt cycles', async () => {
      vi.useFakeTimers()

      global.fetch = vi.fn()
      const fetchMock = vi.mocked(global.fetch)

      const schema = {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      }

      // Build the full sequence for 2 interrupts + final timeout:
      // 1. baseline, 2. prompt, 3-7. 5 polls, 8. abort, 9. after-abort, 10. continue
      // 11-15. 5 polls, 16. abort, 17. after-abort, 18. continue
      // 19-23. 5 polls → throw (no interrupts remaining)
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] } as Response) // 1. baseline
      fetchMock.mockResolvedValueOnce({ ok: true } as Response) // 2. prompt
      for (let cycle = 0; cycle < 3; cycle++) {
        for (let i = 0; i < 5; i++) {
          fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] } as Response) // polls
        }
        if (cycle < 2) {
          fetchMock.mockResolvedValueOnce({ ok: true, json: async () => true } as Response) // abort
          fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] } as Response) // after abort
          fetchMock.mockResolvedValueOnce({ ok: true } as Response) // continue
        }
      }

      const session = new OpenCodeSession('http://localhost:12345', 'session-test')

      const promise = session.promptWithSchema('test prompt', schema, {
        pollIntervalMs: 1000,
        maxWaitMs: 5000,
        interruptWaitMs: 1000,
        maxInterruptCycles: 2,
      })
      // Prevent unhandled rejection while timers advance before we await
      promise.catch(() => {})

      await vi.advanceTimersByTimeAsync(0)

      // Advance through two full interrupt cycles (5s timeout + 1s wait each) plus final timeout
      await vi.advanceTimersByTimeAsync(20000)

      await expect(promise).rejects.toThrow(/Prompt timed out after .* minutes of polling and 2 interrupt attempts/)

      // Verify abort was called twice
      const abortCalls = fetchMock.mock.calls.filter(call =>
        call[0] === 'http://localhost:12345/session/session-test/abort',
      )
      expect(abortCalls.length).toBe(2)

      vi.useRealTimers()
    })

    it('should wait for turn completion without parsing YAML', async () => {
      vi.spyOn(OpenCodeSession.prototype as any, 'sleep').mockResolvedValue(undefined)

      global.fetch = vi.fn()
      const fetchMock = vi.mocked(global.fetch)

      // 1. baseline GET → empty
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      // 2. POST prompt → ok
      fetchMock.mockResolvedValueOnce({ ok: true } as Response)
      // 3. poll GET → completed assistant message with tool part
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          info: { id: 'msg-1', role: 'assistant', finish: 'stop' },
          parts: [
            { type: 'tool', tool: 'bash', state: { status: 'completed', output: 'step reported' } },
          ],
        }],
      } as Response)

      const session = new OpenCodeSession('http://localhost:12345', 'session-test')
      await session.prompt('do some work')

      // Should not throw or attempt YAML parsing
      const postCalls = fetchMock.mock.calls.filter(call => call[1] && (call[1] as RequestInit).method === 'POST')
      expect(postCalls.length).toBe(1)
      const body = JSON.parse((postCalls[0]![1] as RequestInit).body as string)
      expect(body.parts[0].text).toBe('do some work')
    })
  })

  // ── executeCommand ────────────────────────────────────────────────

  describe('executeCommand', () => {
    it('should execute command and return stdout, stderr, exitCode', async () => {
      const execMock = vi.mocked(exec)
      execMock.mockImplementation(((_cmd: string, _opts: any, callback: any) => {
        callback(null, 'stdout content', 'stderr content')
      }) as any)

      const session = new OpenCodeSession('http://localhost:12345', 'session-1')
      const result = await session.executeCommand('echo hello')

      expect(result.stdout).toBe('stdout content')
      expect(result.stderr).toBe('stderr content')
      expect(result.exitCode).toBe(0)
    })

    it('should return non-zero exitCode when command fails', async () => {
      const execMock = vi.mocked(exec)
      execMock.mockImplementation(((_cmd: string, _opts: any, callback: any) => {
        const error = new Error('Command failed') as any
        error.code = 1
        callback(error, '', 'error output')
      }) as any)

      const session = new OpenCodeSession('http://localhost:12345', 'session-1')
      const result = await session.executeCommand('false')

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toBe('error output')
    })

    it('should handle exitCode as string by returning 1', async () => {
      const execMock = vi.mocked(exec)
      execMock.mockImplementation(((_cmd: string, _opts: any, callback: any) => {
        const error = new Error('Command failed') as any
        error.code = 'SIGTERM'
        callback(error, '', '')
      }) as any)

      const session = new OpenCodeSession('http://localhost:12345', 'session-1')
      const result = await session.executeCommand('some-command')

      expect(result.exitCode).toBe(1)
    })
  })
})
