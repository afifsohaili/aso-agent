import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenCodeClient } from '../src/services/opencode-client.js'

// Mock child_process spawn and exec
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}))

import { spawn } from 'node:child_process'

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
})
