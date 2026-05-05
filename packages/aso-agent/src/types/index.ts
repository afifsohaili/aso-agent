/**
 * Core types for the aso-agent autonomous AI agent.
 */

export type AgentPhase = 'discovery' | 'plan' | 'implement' | 'review' | 'gap' | 'research'

export type AgentType = 'discovery' | 'planner' | 'implementer' | 'reviewer' | 'gap-analyzer' | 'researcher' | 'stop-check'

export type CycleStatus = 'running' | 'completed' | 'failed'

export type RoadmapStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export interface RoadmapPhase {
  id: number
  title: string
  description: string
  status: RoadmapStatus
}

export interface SessionConfig {
  id: string
  started: string
  objective: string
  stop_when: string
  branch: string
  test_command: string
  max_iterations: number
  max_time_per_iteration: number
  opencode_session_id?: string
}

export interface FileChange {
  path: string
  description: string
}

export interface TestResults {
  command: string
  passed: boolean
  output: string
}

export interface CycleEntry {
  cycle: number
  phase: AgentPhase
  agent: AgentType
  status: CycleStatus
  started_at: string
  completed_at?: string
  summary: string
  output: AgentOutput
  test_results?: TestResults
}

export type AgentOutput =
  | DiscoveryOutput
  | PlanOutput
  | ImplementOutput
  | ReviewOutput
  | GapOutput
  | ResearchOutput
  | StopCheckOutput

export interface DiscoveryOutput {
  type: 'discovery'
  roadmap: RoadmapPhase[]
  rationale: string
}

export interface PlanOutput {
  type: 'plan'
  tasks: string[]
  approach: string
}

export interface ImplementOutput {
  type: 'implement'
  tests_passed: boolean
  files_changed: FileChange[]
  summary: string
}

export interface ReviewOutput {
  type: 'review'
  review_passed: boolean
  findings: string[]
  suggestions: string[]
}

export interface GapOutput {
  type: 'gap'
  gaps: string[]
  priority: 'high' | 'medium' | 'low'
}

export interface ResearchOutput {
  type: 'research'
  findings: string[]
  sources: string[]
}

export interface StopCheckOutput {
  type: 'stop-check'
  should_stop: boolean
  reason: string
}

export interface NotesDocument {
  session: SessionConfig
  roadmap: RoadmapPhase[]
  cycles: CycleEntry[]
}

export interface AgentContext {
  notes: NotesDocument
  currentCycle: number
  workingDir: string
  branch: string
}

export interface AgentResult {
  success: boolean
  output: AgentOutput
  summary: string
}

export interface Agent {
  readonly name: AgentType
  run(context: AgentContext, prompt: string): Promise<AgentResult>
}
