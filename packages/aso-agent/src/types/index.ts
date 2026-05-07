/**
 * Core types for the aso-agent autonomous AI agent.
 */

export type AgentType = 'implementer' | 'stop-check'

export interface SessionConfig {
  id: string
  started: string
  objective: string
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

export type AgentOutput = ImplementOutput | StopCheckOutput

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

export interface Agent {
  readonly name: AgentType
  run(context: AgentContext): Promise<AgentResult>
}
