import { EventEmitter } from 'node:events'
import type { NotesManager } from './core/notes-manager.js'
import type { GitManager } from './core/git-manager.js'
import type { OpenCodeClient, OpenCodeSession } from './services/opencode-client.js'
import {
  DiscoveryAgent,
  PlannerAgent,
  ImplementerAgent,
  ReviewerAgent,
  GapAnalyzerAgent,
  ResearcherAgent,
  StopCheckAgent,
} from './agents/index.js'
import type {
  AgentContext,
  AgentPhase,
  AgentResult,
  CycleEntry,
  NotesDocument,
  RoadmapStatus,
} from './types/index.js'

export interface OrchestratorOptions {
  notesManager: NotesManager
  gitManager: GitManager
  opencodeClient: OpenCodeClient
  workingDir: string
}

export class Orchestrator extends EventEmitter {
  private notesManager: NotesManager
  private gitManager: GitManager
  private opencodeClient: OpenCodeClient
  private workingDir: string
  private running = false

  constructor(options: OrchestratorOptions) {
    super()
    this.notesManager = options.notesManager
    this.gitManager = options.gitManager
    this.opencodeClient = options.opencodeClient
    this.workingDir = options.workingDir
  }

  async run(): Promise<void> {
    this.running = true
    this.emit('started')

    try {
      const notes = this.notesManager.read()
      if (!notes) {
        throw new Error('No notes document found. Initialize first.')
      }

      // Main loop
      while (this.running) {
        const currentCycle = notes.cycles.length + 1

        // Check max iterations
        if (currentCycle > notes.session.max_iterations) {
          this.emit('stopped', { reason: 'max_iterations_reached' })
          break
        }

        // Determine next phase
        const phase = this.determineNextPhase(notes)

        this.emit('cycle:started', { cycle: currentCycle, phase })

        // Create a new session for this agent
        const session = await this.opencodeClient.createSession()

        try {
          const result = await this.runAgent(phase, notes, currentCycle, session)

          if (result.success) {
            // Commit the work
            const commitResult = this.gitManager.commit(
              `aso-agent: ${phase} - ${result.summary}`,
            )

            if (commitResult.success) {
              this.emit('cycle:committed', {
                cycle: currentCycle,
                phase,
                hash: commitResult.hash,
              })
            }
            else {
              this.emit('cycle:warning', {
                cycle: currentCycle,
                phase,
                message: `Commit failed: ${commitResult.error}`,
              })
            }
          }
          else {
            // Agent reported failure - still commit the attempt
            this.gitManager.commit(
              `aso-agent: ${phase} - FAILED - ${result.summary}`,
            )

            this.emit('cycle:failed', {
              cycle: currentCycle,
              phase,
              summary: result.summary,
            })

            // If implementer failed (tests didn't pass), go back to implementer
            if (phase === 'review') {
              this.emit('cycle:retry', { cycle: currentCycle, phase: 'implement' })
            }
          }

          // Check stop condition after certain phases
          if (phase === 'research' || phase === 'gap') {
            const shouldStop = await this.checkStopCondition(notes, currentCycle)
            if (shouldStop) {
              this.emit('stopped', { reason: 'stop_condition_met' })
              break
            }
          }
        }
        finally {
          // Clean up session
          // Note: Session cleanup is handled by OpenCode server
        }
      }
    }
    catch (error) {
      this.emit('error', error)
    }
    finally {
      this.running = false
      this.emit('finished')
    }
  }

  stop(): void {
    this.running = false
    this.emit('stopping')
  }

  private determineNextPhase(notes: NotesDocument): AgentPhase {
    // If no roadmap or empty roadmap, start with discovery
    if (notes.roadmap.length === 0) {
      return 'discovery'
    }

    // Check if there's a current phase in progress
    const currentRoadmapPhase = notes.roadmap.find(p => p.status === 'in_progress')
    if (!currentRoadmapPhase) {
      // No phase in progress, need discovery to pick next
      return 'discovery'
    }

    // Find the last completed cycle for this roadmap phase
    const cyclesForPhase = notes.cycles.filter(c => {
      // Map cycle phase to roadmap phase - this is a simplification
      // In reality, we'd track which roadmap phase each cycle belongs to
      return true
    })

    const lastCycle = cyclesForPhase[cyclesForPhase.length - 1]

    if (!lastCycle) {
      // First cycle for this phase - start with plan
      return 'plan'
    }

    // Cycle through phases: discovery -> plan -> implement -> review -> gap -> research -> (stop check) -> discovery
    switch (lastCycle.phase) {
      case 'discovery':
        return 'plan'
      case 'plan':
        return 'implement'
      case 'implement':
        return 'review'
      case 'review':
        // If review failed, go back to implement
        if (!lastCycle.output || !('review_passed' in lastCycle.output) || !lastCycle.output.review_passed) {
          return 'implement'
        }
        return 'gap'
      case 'gap':
        // If gaps found, research them
        if (lastCycle.output && 'gaps' in lastCycle.output && Array.isArray(lastCycle.output.gaps) && lastCycle.output.gaps.length > 0) {
          return 'research'
        }
        // No gaps, complete this roadmap phase and discover next
        return 'discovery'
      case 'research':
        // After research, go back to implement with new findings
        return 'implement'
      default:
        return 'discovery'
    }
  }

  private async runAgent(
    phase: AgentPhase,
    notes: NotesDocument,
    currentCycle: number,
    session: OpenCodeSession,
  ): Promise<AgentResult> {
    const context: AgentContext = {
      notes,
      currentCycle,
      workingDir: this.workingDir,
      branch: notes.session.branch,
    }

    const cycleEntry: CycleEntry = {
      cycle: currentCycle,
      phase,
      agent: this.phaseToAgent(phase),
      status: 'running',
      started_at: new Date().toISOString(),
      summary: 'In progress...',
      output: { type: phase } as any, // Will be updated
    }

    this.notesManager.appendCycle(cycleEntry)

    try {
      let result: AgentResult

      switch (phase) {
        case 'discovery': {
          const agent = new DiscoveryAgent({ session })
          result = await agent.run(context)
          if (result.success && result.output.type === 'discovery') {
            this.notesManager.updateRoadmap(result.output.roadmap)
            // Mark first phase as in_progress
            const updatedNotes = this.notesManager.read()
            if (updatedNotes && updatedNotes.roadmap.length > 0) {
              updatedNotes.roadmap[0].status = 'in_progress'
              this.notesManager.updateRoadmap(updatedNotes.roadmap)
            }
          }
          break
        }
        case 'plan': {
          const agent = new PlannerAgent({ session })
          result = await agent.run(context)
          break
        }
        case 'implement': {
          const agent = new ImplementerAgent({ session })
          result = await agent.run(context)
          // Run tests and record results
          try {
            const testOutput = await session.executeCommand(notes.session.test_command)
            cycleEntry.test_results = {
              command: notes.session.test_command,
              passed: testOutput.exitCode === 0,
              output: testOutput.stdout + testOutput.stderr,
            }
          }
          catch {
            cycleEntry.test_results = {
              command: notes.session.test_command,
              passed: false,
              output: 'Failed to run tests',
            }
          }
          break
        }
        case 'review': {
          const agent = new ReviewerAgent({ session })
          result = await agent.run(context)
          break
        }
        case 'gap': {
          const agent = new GapAnalyzerAgent({ session })
          result = await agent.run(context)
          break
        }
        case 'research': {
          const agent = new ResearcherAgent({ session })
          result = await agent.run(context)
          break
        }
        default:
          throw new Error(`Unknown phase: ${phase}`)
      }

      // Update cycle entry with results
      cycleEntry.status = result.success ? 'completed' : 'failed'
      cycleEntry.completed_at = new Date().toISOString()
      cycleEntry.summary = result.summary
      cycleEntry.output = result.output

      this.notesManager.updateLastCycle({
        status: cycleEntry.status,
        completed_at: cycleEntry.completed_at,
        summary: cycleEntry.summary,
        output: cycleEntry.output,
        test_results: cycleEntry.test_results,
      })

      this.emit('cycle:completed', {
        cycle: currentCycle,
        phase,
        success: result.success,
      })

      return result
    }
    catch (error) {
      // Mark cycle as failed
      cycleEntry.status = 'failed'
      cycleEntry.completed_at = new Date().toISOString()
      cycleEntry.summary = error instanceof Error ? error.message : String(error)

      this.notesManager.updateLastCycle({
        status: 'failed',
        completed_at: cycleEntry.completed_at,
        summary: cycleEntry.summary,
      })

      this.emit('cycle:failed', {
        cycle: currentCycle,
        phase,
        error: cycleEntry.summary,
      })

      return {
        success: false,
        output: { type: phase } as any,
        summary: cycleEntry.summary,
      }
    }
  }

  private async checkStopCondition(notes: NotesDocument, currentCycle: number): Promise<boolean> {
    const session = await this.opencodeClient.createSession()

    try {
      const context: AgentContext = {
        notes,
        currentCycle,
        workingDir: this.workingDir,
        branch: notes.session.branch,
      }

      const agent = new StopCheckAgent({ session })
      const result = await agent.run(context)

      if (result.output.type === 'stop-check' && 'should_stop' in result.output) {
        return result.output.should_stop
      }

      return false
    }
    finally {
      // Session cleanup handled by server
    }
  }

  private phaseToAgent(phase: AgentPhase): any {
    const mapping: Record<AgentPhase, string> = {
      discovery: 'discovery',
      plan: 'planner',
      implement: 'implementer',
      review: 'reviewer',
      gap: 'gap-analyzer',
      research: 'researcher',
    }
    return mapping[phase]
  }
}
