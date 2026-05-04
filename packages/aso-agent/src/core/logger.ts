import { createConsola } from 'consola'

let debugEnabled = false

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
 * Create a namespaced logger instance.
 * Debug logs are only shown when debug mode is enabled.
 */
export function createLogger(tag: string) {
  const consola = createConsola({
    level: debugEnabled ? 5 : 3, // 5 = debug, 3 = info
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
