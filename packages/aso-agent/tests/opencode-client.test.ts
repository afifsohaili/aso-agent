import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OpenCodeClient, OpenCodeSession } from '../src/services/opencode-client.js'

// Mock child_process spawn and exec
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}))

import { spawn, exec } from 'node:child_process'

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
    it('should write opencode.json to working directory', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })

      client.writeConfig(tmpDir)

      const configPath = join(tmpDir, 'opencode.json')
      expect(existsSync(configPath)).toBe(true)

      const content = readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      expect(config.$schema).toBe('https://opencode.ai/config.json')
      expect(config.permission).toBe('allow')

      rmSync(tmpDir, { recursive: true })
    })

    it('should include plugin reference in opencode.json', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })

      client.writeConfig(tmpDir)

      const configPath = join(tmpDir, 'opencode.json')
      const content = readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      expect(config.plugin).toEqual(['aso-agent-opencode-hooks'])

      rmSync(tmpDir, { recursive: true })
    })

    it('should write aso-agent-opencode-hooks plugin to .opencode/plugins/', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'opencode-config-test-'))
      const client = new OpenCodeClient({ port: 12345 })

      client.writeConfig(tmpDir)

      const pluginPath = join(tmpDir, '.opencode', 'plugins', 'aso-agent-opencode-hooks.ts')
      expect(existsSync(pluginPath)).toBe(true)

      const pluginContent = readFileSync(pluginPath, 'utf-8')
      expect(pluginContent).toContain('experimental.session.compacting')
      expect(pluginContent).toContain('CRITICAL WORKFLOW INSTRUCTION')
      expect(pluginContent).toContain('ONE small incremental task')

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
