import { spawn, exec } from 'node:child_process'
import { EventEmitter } from 'node:events'
import YAML from 'yaml'
import { createLogger } from '../core/logger.js'

interface OpenCodeServerOptions {
  port?: number
  configPath?: string
  startupDelayMs?: number
  stopTimeoutMs?: number
}

interface SessionOptions {
  title?: string
}

/**
 * Pick a random port in the 5-digit range (10000-65535)
 * to avoid conflicts with common dev ports (3000, 8000, etc.)
 */
function getRandomPort(): number {
  return Math.floor(Math.random() * (65535 - 10000 + 1)) + 10000
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
  private logger = createLogger('opencode')
  private readonly explicitPort: number | undefined
  private readonly startupDelayMs: number
  private readonly stopTimeoutMs: number

  constructor(options: OpenCodeServerOptions = {}) {
    super()
    this.explicitPort = options.port
    this.serverPort = options.port ?? getRandomPort()
    this.baseUrl = `http://localhost:${this.serverPort}`
    this.binaryPath = process.env.OPENCODE_BINARY_PATH || `${process.env.HOME}/.opencode/bin/opencode`
    this.startupDelayMs = options.startupDelayMs ?? 5000
    this.stopTimeoutMs = options.stopTimeoutMs ?? 10000
    this.logger.debug('OpenCodeClient initialized')
    this.logger.debug('Server port:', this.serverPort)
    this.logger.debug('Base URL:', this.baseUrl)
    this.logger.debug('Binary path:', this.binaryPath)
  }

  /**
   * Start the OpenCode server.
   * Retries with a new random port on failure (up to 5 attempts).
   * If an explicit port was provided, only tries once.
   */
  async startServer(): Promise<void> {
    if (this.serverProcess) {
      this.logger.warn('Server already running, skipping start')
      throw new Error('Server already running')
    }

    const maxRetries = this.explicitPort ? 1 : 5
    const errors: Error[] = []

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (attempt > 1) {
        this.serverPort = getRandomPort()
        this.baseUrl = `http://localhost:${this.serverPort}`
      }

      this.logger.start(`Starting OpenCode server (attempt ${attempt}/${maxRetries}) on port ${this.serverPort}...`)

      try {
        await this.tryStartOnce()
        this.logger.success('OpenCode server is healthy and ready')
        return
      }
      catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.logger.warn(`Attempt ${attempt} failed: ${err.message}`)
        errors.push(err)

        if (this.serverProcess) {
          await this.stopServer()
        }
      }
    }

    throw new Error(
      `Failed to start OpenCode server after ${maxRetries} attempt${maxRetries > 1 ? 's' : ''}. ` +
      `Last error: ${errors[errors.length - 1]?.message}`,
    )
  }

  /**
   * Single attempt to start the server and verify health.
   */
  private tryStartOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn(this.binaryPath, ['serve', '--port', String(this.serverPort)], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      let stdout = ''
      let stderr = ''
      let settled = false

      const cleanup = () => {
        settled = true
      }

      this.serverProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString()
        stdout += chunk
        this.logger.debug('[server stdout]', chunk.trim())
        this.emit('stdout', chunk)
      })

      this.serverProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString()
        stderr += chunk
        this.logger.debug('[server stderr]', chunk.trim())
        this.emit('stderr', chunk)
      })

      this.serverProcess.on('error', (error) => {
        if (settled) return
        cleanup()
        this.logger.error('Server process error:', error.message)
        reject(new Error(`Failed to start OpenCode server: ${error.message}`))
      })

      this.serverProcess.on('exit', (code) => {
        this.logger.debug('Server process exited with code:', code)
        if (code !== 0 && code !== null) {
          this.logger.error('Server exited with code', code)
          this.emit('error', new Error(`OpenCode server exited with code ${code}. Stderr: ${stderr}`))
        }
      })

      // Wait a bit for server to be ready
      this.logger.debug(`Waiting ${this.startupDelayMs}ms for server to be ready...`)
      setTimeout(() => {
        if (settled) return

        this.checkHealth()
          .then((healthy) => {
            if (settled) return
            cleanup()
            if (healthy) {
              resolve()
            }
            else {
              reject(new Error('Server health check failed'))
            }
          })
          .catch((error) => {
            if (settled) return
            cleanup()
            reject(error)
          })
      }, this.startupDelayMs)
    })
  }

  /**
   * Stop the OpenCode server.
   */
  async stopServer(): Promise<void> {
    if (!this.serverProcess) {
      this.logger.debug('No server process to stop')
      return
    }

    this.logger.start('Stopping OpenCode server...')

    return new Promise((resolve) => {
      this.serverProcess?.on('exit', () => {
        this.logger.debug('Server process exited')
        this.serverProcess = null
        resolve()
      })

      this.logger.debug('Sending SIGTERM to server process...')
      this.serverProcess?.kill('SIGTERM')

      // Force kill after timeout
      setTimeout(() => {
        if (this.serverProcess) {
          this.logger.warn('Server did not exit gracefully, forcing SIGKILL')
          this.serverProcess?.kill('SIGKILL')
          this.serverProcess = null
        }
        resolve()
      }, this.stopTimeoutMs)
    })
  }

  /**
   * Check if the server is healthy.
   */
  async checkHealth(): Promise<boolean> {
    this.logger.debug('Checking server health at:', `${this.baseUrl}/global/health`)
    try {
      const response = await fetch(`${this.baseUrl}/global/health`)
      this.logger.debug('Health response status:', response.status)
      return response.ok
    }
    catch (error) {
      this.logger.debug('Health check failed:', error)
      return false
    }
  }

  /**
   * Create a new session.
   */
  async createSession(options: SessionOptions = {}): Promise<OpenCodeSession> {
    this.logger.debug('Creating OpenCode session...')

    const url = `${this.baseUrl}/session`
    this.logger.debug('POST', url)

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: options.title }),
    })

    const responseText = await response.text()

    if (!response.ok) {
      this.logger.error('Failed to create session:', response.status, response.statusText)
      this.logger.debug('Response body:', responseText.slice(0, 500))
      throw new Error(`Failed to create session: ${response.status} ${response.statusText}`)
    }

    let data: { id: string }
    try {
      data = JSON.parse(responseText) as { id: string }
    }
    catch {
      this.logger.error('Server returned non-JSON response:', responseText.slice(0, 200))
      throw new Error(`Server returned non-JSON response from ${url}. Is the OpenCode server running on the correct port?`)
    }

    this.logger.debug('Session created with ID:', data.id)
    return new OpenCodeSession(this.baseUrl, data.id)
  }

  /**
   * Reconnect to an existing session by ID.
   */
  getSession(sessionId: string): OpenCodeSession {
    this.logger.debug('Reconnecting to existing session:', sessionId)
    return new OpenCodeSession(this.baseUrl, sessionId)
  }

  /**
   * Get MCP server status.
   */
  async getMcpStatus(): Promise<Array<{ name: string, status: string }>> {
    this.logger.debug('Fetching MCP server status...')
    const response = await fetch(`${this.baseUrl}/mcp/status`)
    if (!response.ok) {
      this.logger.error('Failed to get MCP status:', response.status, response.statusText)
      throw new Error(`Failed to get MCP status: ${response.statusText}`)
    }
    const data = await response.json() as Array<{ name: string, status: string }>
    this.logger.debug('MCP servers:', data.length)
    return data
  }
}

/**
 * Represents an OpenCode session for sending prompts and receiving responses.
 */
export class OpenCodeSession {
  private baseUrl: string
  private sessionId: string
  private logger = createLogger('opencode:session')

  get id(): string {
    return this.sessionId
  }

  constructor(baseUrl: string, sessionId: string) {
    this.baseUrl = baseUrl
    this.sessionId = sessionId
    this.logger.debug('OpenCodeSession created:', sessionId)
  }

  /**
   * Send a prompt and get a structured YAML response.
   * The schema is converted to a YAML template and appended to the prompt.
   * Times out after 10 minutes to avoid hanging indefinitely.
   */
  async promptWithSchema<T>(
    prompt: string,
    schema: Record<string, unknown>,
  ): Promise<T> {
    this.logger.debug('Sending structured prompt...')
    this.logger.debug('Prompt length:', prompt.length, 'characters')

    // Build YAML template from schema and append to prompt
    const yamlTemplate = this.schemaToYamlTemplate(schema)
    const fullPrompt = `${prompt}\n\n---\n\nRESPOND WITH ONLY VALID YAML matching this structure:\n\n\`\`\`yaml\n${yamlTemplate}\n\`\`\`\n\nDo not include markdown formatting, explanations, or any other text outside the YAML.`

    this.logger.debug('Full prompt length:', fullPrompt.length, 'characters')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 600_000) // 10 minutes

    try {
      const response = await fetch(`${this.baseUrl}/session/${this.sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: [
            {
              type: 'text',
              text: fullPrompt,
            },
          ],
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        this.logger.error('Prompt failed:', response.status, response.statusText)
        throw new Error(`Prompt failed: ${response.statusText}`)
      }

      const data = await response.json() as { parts: Array<{ type: string, text: string }> }
      this.logger.debug('Received structured response')

      // Extract text from parts
      const textParts = data.parts.filter(p => p.type === 'text')
      const text = textParts.map(p => p.text).join('')
      this.logger.debug('Response text length:', text.length)

      // Extract YAML from markdown code blocks first
      const codeBlockMatch = text.match(/```(?:yaml)?\n?([\s\S]*?)\n?```/)
      const yamlText = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim()

      // Parse YAML
      let parsed: unknown
      try {
        parsed = YAML.parse(yamlText)
      }
      catch (yamlError) {
        this.logger.error('Failed to parse YAML. Text (first 500 chars):', yamlText.slice(0, 500))
        throw new Error(`AI response was not valid YAML. Error: ${yamlError instanceof Error ? yamlError.message : String(yamlError)}. Response started with: ${text.slice(0, 100)}`)
      }

      // Validate required fields from schema
      const validationError = this.validateAgainstSchema(parsed, schema)
      if (validationError) {
        this.logger.error('YAML validation failed:', validationError)
        throw new Error(`AI response missing required fields: ${validationError}`)
      }

      return parsed as T
    }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Prompt timed out after 10 minutes')
      }
      throw error
    }
    finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Convert a JSON schema to a YAML template string.
   */
  private schemaToYamlTemplate(schema: Record<string, unknown>, indent = 0): string {
    const spaces = '  '.repeat(indent)

    if (schema.type === 'object' && schema.properties) {
      const props = schema.properties as Record<string, unknown>
      const required = (schema.required as string[]) || []
      let result = ''

      for (const [key, value] of Object.entries(props)) {
        const isRequired = required.includes(key)
        const optionalMarker = isRequired ? '' : '  # optional'
        const val = value as Record<string, unknown>

        if (val.type === 'object') {
          result += `${spaces}${key}:${optionalMarker}\n${this.schemaToYamlTemplate(val, indent + 1)}`
        }
        else if (val.type === 'array' && val.items) {
          const items = val.items as Record<string, unknown>
          result += `${spaces}${key}:${optionalMarker}\n${spaces}- `
          if (items.type === 'object') {
            const itemProps = items.properties as Record<string, unknown>
            const itemRequired = (items.required as string[]) || []
            const firstProp = Object.entries(itemProps)[0]
            if (firstProp) {
              const [fKey, fVal] = firstProp
              result += `${fKey}: <${this.typeHint(fVal as Record<string, unknown>)}>\n`
              for (const [iKey, iVal] of Object.entries(itemProps).slice(1)) {
                const iReq = itemRequired.includes(iKey) ? '' : '  # optional'
                if ((iVal as Record<string, unknown>).type === 'object') {
                  result += `${spaces}  ${iKey}:${iReq}\n${this.schemaToYamlTemplate(iVal as Record<string, unknown>, indent + 2)}`
                }
                else {
                  result += `${spaces}  ${iKey}: <${this.typeHint(iVal as Record<string, unknown>)}>${iReq}\n`
                }
              }
            }
          }
          else {
            result += `<${this.typeHint(items)}>\n`
          }
        }
        else if (val.const) {
          result += `${spaces}${key}: ${val.const}${optionalMarker}\n`
        }
        else if (val.enum) {
          result += `${spaces}${key}: <${(val.enum as string[]).join(' | ')}>${optionalMarker}\n`
        }
        else {
          result += `${spaces}${key}: <${this.typeHint(val)}>${optionalMarker}\n`
        }
      }
      return result
    }

    return `${spaces}<${this.typeHint(schema)}>\n`
  }

  /**
   * Get a human-readable type hint for a schema value.
   */
  private typeHint(schema: Record<string, unknown>): string {
    if (schema.const) return String(schema.const)
    if (schema.enum) return (schema.enum as string[]).join(' | ')
    if (schema.type === 'array') {
      const items = schema.items as Record<string, unknown>
      return `array of ${items ? this.typeHint(items) : 'any'}`
    }
    return schema.type as string || 'any'
  }

  /**
   * Validate parsed data against a JSON schema's required fields.
   */
  private validateAgainstSchema(data: unknown, schema: Record<string, unknown>, path = ''): string | null {
    if (schema.type === 'object' && schema.properties && typeof data === 'object' && data !== null) {
      const props = schema.properties as Record<string, unknown>
      const required = (schema.required as string[]) || []
      const dataObj = data as Record<string, unknown>

      for (const key of required) {
        if (!(key in dataObj) || dataObj[key] === undefined || dataObj[key] === null) {
          return `${path ? `${path}.` : ''}${key} is required but missing`
        }
        const propSchema = props[key] as Record<string, unknown>
        if (propSchema.type === 'object' || propSchema.type === 'array') {
          const nestedError = this.validateAgainstSchema(dataObj[key], propSchema, `${path ? `${path}.` : ''}${key}`)
          if (nestedError) return nestedError
        }
      }
    }
    return null
  }

  /**
   * Send a prompt and stream the response via SSE.
   * Times out after 10 minutes.
   */
  async promptStream(
    prompt: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    this.logger.debug('Sending streaming prompt...')
    this.logger.debug('Prompt length:', prompt.length, 'characters')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 600_000) // 10 minutes

    try {
      const response = await fetch(`${this.baseUrl}/session/${this.sessionId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          parts: [
            {
              type: 'text',
              text: prompt,
            },
          ],
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        this.logger.error('Prompt stream failed:', response.status, response.statusText)
        throw new Error(`Prompt stream failed: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        this.logger.error('No response body for stream')
        throw new Error('No response body')
      }

      this.logger.debug('Starting to read SSE stream...')
      const decoder = new TextDecoder()
      let buffer = ''
      let chunkCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          this.logger.debug('SSE stream complete, total chunks:', chunkCount)
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              this.logger.debug('Received [DONE] signal')
              return
            }
            chunkCount++
            onChunk(data)
          }
        }
      }
    }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Stream prompt timed out after 10 minutes')
      }
      throw error
    }
    finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Execute a shell command locally (not via OpenCode API).
   * Used for running tests and other commands that need raw stdout/stderr/exitCode.
   */
  async executeCommand(command: string): Promise<{ stdout: string, stderr: string, exitCode: number }> {
    this.logger.debug('Executing command locally:', command)

    return new Promise((resolve, reject) => {
      exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        const exitCode = error?.code ?? 0
        this.logger.debug('Command completed with exit code:', exitCode)
        this.logger.debug('Stdout length:', stdout.length)
        this.logger.debug('Stderr length:', stderr.length)
        resolve({ stdout, stderr, exitCode: typeof exitCode === 'string' ? 1 : exitCode })
      })
    })
  }
}
