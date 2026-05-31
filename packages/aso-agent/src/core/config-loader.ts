import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import { createLogger } from './logger.js'
import type { AsoAgentYamlConfig } from '../types/index.js'

const VALID_TOP_LEVEL_KEYS = new Set(['session', 'opencode'])
const VALID_SESSION_KEYS = new Set(['max_iterations', 'max_time_per_iteration'])
const VALID_OPENCODE_KEYS = new Set(['model', 'small_model', 'agent'])

/**
 * Format a raw JS value for display in error messages.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') return 'object'
  return String(value)
}

/**
 * Build a structured validation error with path, expectation and actual value.
 */
class ConfigValidationError extends Error {
  constructor(path: string, expected: string, actual: unknown) {
    super(`Invalid aso-agent.yaml: '${path}' must be ${expected}, got ${formatValue(actual)}`)
    this.name = 'ConfigValidationError'
  }
}

class ConfigUnknownKeyError extends Error {
  constructor(path: string, key: string, validKeys: string[]) {
    super(`Invalid aso-agent.yaml: Unknown key '${key}' in '${path}'. Valid keys: ${validKeys.join(', ')}`)
    this.name = 'ConfigUnknownKeyError'
  }
}

class ConfigTopLevelTypeError extends Error {
  constructor(actual: unknown) {
    super(`Invalid aso-agent.yaml: Top-level value must be an object, got ${formatValue(actual)}`)
    this.name = 'ConfigTopLevelTypeError'
  }
}

/**
 * Validate a parsed config object and return a clean AsoAgentYamlConfig.
 * Throws on any structural issue with a clear message.
 */
function validateConfig(raw: unknown): AsoAgentYamlConfig {
  // Top level must be a non-null object
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigTopLevelTypeError(raw)
  }

  const root = raw as Record<string, unknown>
  const result: AsoAgentYamlConfig = {}

  // Check for unknown top-level keys
  for (const key of Object.keys(root)) {
    if (!VALID_TOP_LEVEL_KEYS.has(key)) {
      throw new ConfigUnknownKeyError('<root>', key, [...VALID_TOP_LEVEL_KEYS])
    }
  }

  // Validate session section
  if ('session' in root) {
    const session = root.session
    if (session === null || session === undefined || typeof session !== 'object' || Array.isArray(session)) {
      throw new ConfigValidationError('session', 'an object', session)
    }

    const sessionObj = session as Record<string, unknown>
    result.session = {}

    // Check unknown keys in session
    for (const key of Object.keys(sessionObj)) {
      if (!VALID_SESSION_KEYS.has(key)) {
        throw new ConfigUnknownKeyError('session', key, [...VALID_SESSION_KEYS])
      }
    }

    // Validate max_iterations
    if ('max_iterations' in sessionObj) {
      const val = sessionObj.max_iterations
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 1) {
        throw new ConfigValidationError('session.max_iterations', 'a positive integer', val)
      }
      result.session.max_iterations = val
    }

    // Validate max_time_per_iteration
    if ('max_time_per_iteration' in sessionObj) {
      const val = sessionObj.max_time_per_iteration
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 1) {
        throw new ConfigValidationError('session.max_time_per_iteration', 'a positive integer', val)
      }
      result.session.max_time_per_iteration = val
    }
  }

  // Validate opencode section
  if ('opencode' in root) {
    const opencode = root.opencode
    if (opencode === null || opencode === undefined || typeof opencode !== 'object' || Array.isArray(opencode)) {
      throw new ConfigValidationError('opencode', 'an object', opencode)
    }

    const opencodeObj = opencode as Record<string, unknown>
    result.opencode = {}

    // Check unknown keys in opencode
    for (const key of Object.keys(opencodeObj)) {
      if (!VALID_OPENCODE_KEYS.has(key)) {
        throw new ConfigUnknownKeyError('opencode', key, [...VALID_OPENCODE_KEYS])
      }
    }

    // Validate model
    if ('model' in opencodeObj) {
      const val = opencodeObj.model
      if (typeof val !== 'string' || val.length === 0) {
        throw new ConfigValidationError('opencode.model', 'a non-empty string', val)
      }
      result.opencode.model = val
    }

    // Validate small_model
    if ('small_model' in opencodeObj) {
      const val = opencodeObj.small_model
      if (typeof val !== 'string' || val.length === 0) {
        throw new ConfigValidationError('opencode.small_model', 'a non-empty string', val)
      }
      result.opencode.small_model = val
    }

    // Validate agent
    if ('agent' in opencodeObj) {
      const val = opencodeObj.agent
      if (typeof val !== 'string' || val.length === 0) {
        throw new ConfigValidationError('opencode.agent', 'a non-empty string', val)
      }
      result.opencode.agent = val
    }
  }

  return result
}

/**
 * Load aso-agent.yaml (or aso-agent.yml) from the working directory.
 *
 * Returns an empty object if no config file is found.
 * Throws if the file contains malformed YAML or has structural issues.
 */
export function loadConfig(workingDir: string): AsoAgentYamlConfig {
  const logger = createLogger('config-loader')

  // Prefer .yaml over .yml
  const yamlPath = join(workingDir, 'aso-agent.yaml')
  const ymlPath = join(workingDir, 'aso-agent.yml')

  let configPath: string | null = null

  if (existsSync(yamlPath)) {
    configPath = yamlPath
  }
  else if (existsSync(ymlPath)) {
    configPath = ymlPath
  }

  if (!configPath) {
    logger.debug('No aso-agent.yaml or aso-agent.yml found, using defaults')
    return {}
  }

  logger.info(`Loading config from ${configPath}`)

  const raw = readFileSync(configPath, 'utf-8')

  let parsed: unknown
  try {
    parsed = YAML.parse(raw)
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to parse ${configPath}: ${msg}`)
    throw new Error(`Invalid aso-agent.yaml: ${msg}`)
  }

  // Run schema validation
  const result = validateConfig(parsed)

  logger.debug('Config loaded:', JSON.stringify(result))
  return result
}

const DEFAULT_CONFIG_TEMPLATE = `# aso-agent.yaml
# Configuration file for the aso-agent autonomous AI agent.
#
# Place this file in your project root to set defaults for agent sessions.
# CLI arguments (--max-iterations, --stop-when, etc.) override these values
# when provided at runtime.
#
# All fields are optional. Omitting a field uses aso-agent's built-in default.

# ── Session defaults ────────────────────────────────────────────────────
# These set defaults overridable via CLI flags.
session:
  # Maximum number of implement → stop-check iterations (default: 50)
  max_iterations: 50

  # Maximum time in seconds per iteration (default: 1800 / 30 minutes)
  max_time_per_iteration: 1800

# ── OpenCode model and agent configuration ──────────────────────────────
# These values are written into the temporary opencode.json that aso-agent
# generates. OpenCode's config merging picks them up automatically.
opencode:
  # Primary model for the session in provider/model-id format.
  # Examples: "anthropic/claude-sonnet-4-20250514", "openai/gpt-4o",
  #           "gemini/gemini-2.5-pro", "opencode/gpt-5.1-codex"
  model: "anthropic/claude-sonnet-4-20250514"

  # Small model for lightweight tasks like title generation.
  # Falls back to the primary model if not set.
  small_model: "anthropic/claude-haiku-4-20250514"

  # Agent type to use: "build", "plan", or a custom agent name.
  # Falls back to OpenCode's default agent if not set.
  agent: "build"
`

/**
 * Export the default aso-agent.yaml template to a directory.
 *
 * @param outputDir - Directory to write aso-agent.yaml into
 * @param force - Overwrite existing file if true
 * @returns The path to the written file
 * @throws If the file exists and force is false
 */
export function exportDefaultConfig(outputDir: string, force: boolean): string {
  const filePath = join(outputDir, 'aso-agent.yaml')

  if (existsSync(filePath) && !force) {
    throw new Error(
      `aso-agent.yaml already exists at ${filePath}. Use --force to overwrite.`,
    )
  }

  writeFileSync(filePath, DEFAULT_CONFIG_TEMPLATE, 'utf-8')
  return filePath
}
