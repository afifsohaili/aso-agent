/**
 * Core types for the aso-agent autonomous AI agent.
 */

export type AgentType = 'implementer' | 'stop-check' | 'gap-analyzer'

export interface SessionConfig {
  id: string
  started: string
  objectives: string[]
  stop_when: string
  branch: string
  max_iterations: number
  max_time_per_iteration: number
  opencode_session_id?: string
}

export interface FileChange {
  path: string
  description: string
}

export interface Entry {
  step: number
  timestamp: string
  summary: string
  files_changed: FileChange[]
  tests_passed: boolean
}

export interface NotesDocument {
  session: SessionConfig
  entries: Entry[]
}

export interface AgentContext {
  notes: NotesDocument
  currentStep: number
  workingDir: string
  branch: string
  notesFilePath: string
  gitLog?: string
}

export interface AgentResult {
  success: boolean
  output: AgentOutput
  summary: string
}

export type AgentOutput = ImplementOutput | StopCheckOutput | GapAnalyzerOutput

export interface ImplementOutput {
  type: 'implement'
  summary: string
  files_changed: FileChange[]
  tests_passed: boolean
}

export interface StopCheckOutput {
  type: 'stop-check'
  should_stop: boolean
  reason: string
}

export interface GapAnalyzerOutput {
  type: 'gap-analyzer'
  gaps: string[]
  summary: string
}

export interface Agent {
  readonly name: AgentType
  run(context: AgentContext): Promise<AgentResult>
}

/**
 * OpenCode-specific configuration that gets written into opencode.json.
 */
export interface OpenCodeConfig {
  /** Main model ID in format provider/model-id (e.g. "anthropic/claude-sonnet-4-20250514") */
  model?: string
  /** Small model for lightweight tasks (title generation, etc.) */
  small_model?: string
  /** Agent name/type to use (e.g. "build", "plan", or a custom agent name) */
  agent?: string
}

/**
 * Schema for the aso-agent.yaml configuration file.
 * Placed in the project root to configure aso-agent defaults.
 */
export interface AsoAgentYamlConfig {
  /** Session defaults (CLI arguments override these) */
  session?: {
    max_iterations?: number
    max_time_per_iteration?: number
  }
  /** OpenCode model/agent configuration */
  opencode?: OpenCodeConfig
}
