import { createConsola, type ConsolaReporter, type LogObject } from 'consola'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let debugEnabled = false
let logFilePath: string | null = null

/**
 * Enable or disable debug logging globally.
 */
export function setDebug(enabled: boolean): void {
  debugEnabled = enabled
}

/**
 * Check if debug mode is enabled.
 */
export function isDebugEnabled(): boolean {
  return debugEnabled
}

/**
 * Get the current log file path.
 */
export function getLogFile(): string | null {
  return logFilePath
}

/**
 * Set the log file path for persistent logging.
 */
export function setLogFile(filePath: string): void {
  logFilePath = filePath
  try {
    mkdirSync(dirname(filePath), { recursive: true })
  }
  catch {
    // Directory might already exist
  }
}

/**
 * Custom file reporter that writes logs to a file.
 */
class FileReporter implements ConsolaReporter {
  private filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  log(logObj: LogObject) {
    const timestamp = new Date().toISOString()
    const args = logObj.args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg),
    ).join(' ')
    const line = `[${timestamp}] [${logObj.type.toUpperCase()}] ${logObj.tag ? `[${logObj.tag}] ` : ''}${args}\n`

    try {
      appendFileSync(this.filePath, line)
    }
    catch (error) {
      console.error(`Failed to write to log file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/**
 * Create a namespaced logger instance.
 * Debug logs are only shown when debug mode is enabled.
 */
export function createLogger(tag: string) {
  const reporters: ConsolaReporter[] = []

  // Always add console reporter
  reporters.push({
    log(logObj: LogObject) {
      if (logObj.level > (debugEnabled ? 5 : 3)) return
      const method = logObj.level < 2 ? 'error' : logObj.level < 3 ? 'warn' : 'log'
      const args = logObj.args
      if (logObj.tag) {
        console[method](`[${logObj.tag}]`, ...args)
      }
      else {
        console[method](...args)
      }
    },
  })

  // Add file reporter if log file is set
  if (logFilePath) {
    reporters.push(new FileReporter(logFilePath))
  }

  const consola = createConsola({
    level: debugEnabled ? 5 : 3, // 5 = debug, 3 = info
    reporters,
    formatOptions: {
      date: true,
      colors: true,
    },
  }).withTag(tag)

  return {
    debug: (message: string, ...args: unknown[]) => {
      if (debugEnabled) {
        consola.debug(message, ...args)
      }
    },
    info: (message: string, ...args: unknown[]) => {
      consola.info(message, ...args)
    },
    success: (message: string, ...args: unknown[]) => {
      consola.success(message, ...args)
    },
    warn: (message: string, ...args: unknown[]) => {
      consola.warn(message, ...args)
    },
    error: (message: string, ...args: unknown[]) => {
      consola.error(message, ...args)
    },
    start: (message: string, ...args: unknown[]) => {
      consola.start(message, ...args)
    },
    ready: (message: string, ...args: unknown[]) => {
      consola.ready(message, ...args)
    },
    box: (title: string, message: string) => {
      consola.box({ title, message })
    },
  }
}

/**
 * Global logger for the CLI entry point.
 */
export const logger = createLogger('aso-agent')
