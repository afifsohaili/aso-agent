import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'

interface OpenCodeServerOptions {
  port?: number
  configPath?: string
}

interface SessionOptions {
  permissions?: Array<{ permission: string, pattern: string, action: 'allow' | 'deny' }>
}

/**
 * Client for managing the OpenCode server and sessions.
 * Handles spawning the server, creating sessions, and sending prompts.
 */
export class OpenCodeClient extends EventEmitter {
  private serverProcess: ReturnType<typeof spawn> | null = null
  private serverPort: number
  private baseUrl: string
  private binaryPath: string

  constructor(options: OpenCodeServerOptions = {}) {
    super()
    this.serverPort = options.port || 3000
    this.baseUrl = `http://localhost:${this.serverPort}`
    this.binaryPath = process.env.OPENCODE_BINARY_PATH || `${process.env.HOME}/.opencode/bin/opencode`
  }

  /**
   * Start the OpenCode server.
   */
  async startServer(): Promise<void> {
    if (this.serverProcess) {
      throw new Error('Server already running')
    }

    return new Promise((resolve, reject) => {
      this.serverProcess = spawn(this.binaryPath, ['serve', '--port', String(this.serverPort)], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      let stdout = ''
      let stderr = ''

      this.serverProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
        this.emit('stdout', data.toString())
      })

      this.serverProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
        this.emit('stderr', data.toString())
      })

      this.serverProcess.on('error', (error) => {
        reject(new Error(`Failed to start OpenCode server: ${error.message}`))
      })

      this.serverProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          this.emit('error', new Error(`OpenCode server exited with code ${code}. Stderr: ${stderr}`))
        }
      })

      // Wait a bit for server to be ready
      setTimeout(() => {
        this.checkHealth()
          .then(() => resolve())
          .catch((error) => {
            this.stopServer()
            reject(error)
          })
      }, 5000)
    })
  }

  /**
   * Stop the OpenCode server.
   */
  async stopServer(): Promise<void> {
    if (!this.serverProcess) {
      return
    }

    return new Promise((resolve) => {
      this.serverProcess?.on('exit', () => {
        this.serverProcess = null
        resolve()
      })

      this.serverProcess?.kill('SIGTERM')

      // Force kill after timeout
      setTimeout(() => {
        this.serverProcess?.kill('SIGKILL')
        this.serverProcess = null
        resolve()
      }, 10000)
    })
  }

  /**
   * Check if the server is healthy.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`)
      return response.ok
    }
    catch {
      return false
    }
  }

  /**
   * Create a new session.
   */
  async createSession(options: SessionOptions = {}): Promise<OpenCodeSession> {
    const permissions = options.permissions || [{ permission: '*', pattern: '*', action: 'allow' as const }]

    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    })

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`)
    }

    const data = await response.json() as { id: string }
    return new OpenCodeSession(this.baseUrl, data.id)
  }

  /**
   * Get MCP server status.
   */
  async getMcpStatus(): Promise<Array<{ name: string, status: string }>> {
    const response = await fetch(`${this.baseUrl}/mcp/status`)
    if (!response.ok) {
      throw new Error(`Failed to get MCP status: ${response.statusText}`)
    }
    return response.json() as Promise<Array<{ name: string, status: string }>>
  }
}

/**
 * Represents an OpenCode session for sending prompts and receiving responses.
 */
export class OpenCodeSession {
  private baseUrl: string
  private sessionId: string

  constructor(baseUrl: string, sessionId: string) {
    this.baseUrl = baseUrl
    this.sessionId = sessionId
  }

  /**
   * Send a prompt and get a structured JSON response.
   */
  async promptWithSchema<T>(
    prompt: string,
    schema: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}/sessions/${this.sessionId}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        output_format: {
          type: 'json_schema',
          schema,
          retry_count: 1,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Prompt failed: ${response.statusText}`)
    }

    const data = await response.json() as { output: T }
    return data.output
  }

  /**
   * Send a prompt and stream the response via SSE.
   */
  async promptStream(
    prompt: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sessions/${this.sessionId}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ prompt }),
    })

    if (!response.ok) {
      throw new Error(`Prompt stream failed: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') return
          onChunk(data)
        }
      }
    }
  }

  /**
   * Execute a shell command in the session.
   */
  async executeCommand(command: string): Promise<{ stdout: string, stderr: string, exitCode: number }> {
    const response = await fetch(`${this.baseUrl}/sessions/${this.sessionId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    })

    if (!response.ok) {
      throw new Error(`Command execution failed: ${response.statusText}`)
    }

    return response.json() as Promise<{ stdout: string, stderr: string, exitCode: number }>
  }
}
