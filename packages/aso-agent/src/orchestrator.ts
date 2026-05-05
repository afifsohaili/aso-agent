import { EventEmitter } from 'node:events'
import type { NotesManager } from './core/notes-manager.js'
import type { GitManager } from './core/git-manager.js'
import type { OpenCodeClient, OpenCodeSession } from './services/opencode-client.js'
import { createLogger } from './core/logger.js'
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
  private logger = createLogger('orchestrator')

  constructor(options: OrchestratorOptions) {
    super()
    this.notesManager = options.notesManager
    this.gitManager = options.gitManager
    this.opencodeClient = options.opencodeClient
    this.workingDir = options.workingDir
    this.logger.debug('Orchestrator initialized')
    this.logger.debug('Working directory:', options.workingDir)
  }

  async run(): Promise<void> {
    this.running = true
    this.emit('started')
    this.logger.start('Starting orchestrator run loop')

    try {
      const initialNotes = this.notesManager.read()
      if (!initialNotes) {
        this.logger.error('No notes document found')
        throw new Error('No notes document found. Initialize first.')
      }

      this.logger.debug('Session ID:', initialNotes.session.id)
      this.logger.debug('Objective:', initialNotes.session.objective)
      this.logger.debug('Max iterations:', initialNotes.session.max_iterations)
      this.logger.debug('Current roadmap phases:', initialNotes.roadmap.length)
      this.logger.debug('Completed cycles:', initialNotes.cycles.length)

      // Main loop
      while (this.running) {
        // Re-read notes from disk each cycle to get accurate cycle count
        const notes = this.notesManager.read() || initialNotes
        const currentCycle = notes.cycles.length + 1
        this.logger.debug(`--- Starting cycle ${currentCycle} ---`)

        // Check max iterations
        if (currentCycle > notes.session.max_iterations) {
          this.logger.warn(`Max iterations reached (${notes.session.max_iterations})`)
          this.emit('stopped', { reason: 'max_iterations_reached' })
          break
        }

        this.logger.debug(`Cycle ${currentCycle} within limit (${notes.session.max_iterations})`)

        // Determine next phase
        this.logger.debug('Determining next phase...')
        const phase = this.determineNextPhase(notes)
        this.logger.info(`Next phase: ${phase}`)

        this.emit('cycle:started', { cycle: currentCycle, phase })

        // Create a new session for this agent
        this.logger.debug('Creating OpenCode session for agent...')
        let session: OpenCodeSession
        try {
          session = await this.opencodeClient.createSession()
          this.logger.debug('OpenCode session created successfully')
        }
        catch (error) {
          this.logger.error('Failed to create OpenCode session:', error)
          throw error
        }

        try {
          this.logger.debug(`Running ${phase} agent...`)
          const result = await this.runAgent(phase, notes, currentCycle, session)
          this.logger.debug(`Agent ${phase} completed with success=${result.success}`)

          if (result.success) {
            // Commit the work
            this.logger.debug('Committing agent work...')
            const commitResult = this.gitManager.commit(
              `aso-agent: ${phase} - ${result.summary}`,
            )

            if (commitResult.success) {
              this.logger.debug('Commit successful:', commitResult.hash?.slice(0, 7))
              this.emit('cycle:committed', {
                cycle: currentCycle,
                phase,
                hash: commitResult.hash,
              })
            }
            else {
              this.logger.warn('Commit failed:', commitResult.error)
              this.emit('cycle:warning', {
                cycle: currentCycle,
                phase,
                message: `Commit failed: ${commitResult.error}`,
              })
            }
          }
          else {
            // Agent reported failure - still commit the attempt
            this.logger.warn(`Agent ${phase} reported failure, committing attempt...`)
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
              this.logger.info('Review failed, scheduling retry of implement phase')
              this.emit('cycle:retry', { cycle: currentCycle, phase: 'implement' })
            }
          }

          // Check stop condition after certain phases
          if (phase === 'research' || phase === 'gap') {
            this.logger.debug('Checking stop condition...')
            const shouldStop = await this.checkStopCondition(notes, currentCycle)
            this.logger.debug('Stop condition result:', shouldStop)
            if (shouldStop) {
              this.logger.info('Stop condition met, ending session')
              this.emit('stopped', { reason: 'stop_condition_met' })
              break
            }
          }

          this.logger.debug(`Cycle ${currentCycle} completed successfully`)
        }
        catch (error) {
          this.logger.error(`Cycle ${currentCycle} error:`, error)
          this.emit('cycle:failed', {
            cycle: currentCycle,
            phase,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        finally {
          // Clean up session
          this.logger.debug('Cleaning up OpenCode session...')
          // Note: Session cleanup is handled by OpenCode server
        }
      }

      this.logger.info('Orchestrator run loop ended')
    }
    catch (error) {
      this.logger.error('Orchestrator fatal error:', error)
      this.emit('error', error)
    }
    finally {
      this.running = false
      this.emit('finished')
      this.logger.debug('Orchestrator finished, running=false')
    }
  }

  stop(): void {
    this.logger.info('Stop requested')
    this.running = false
    this.emit('stopping')
  }

  private determineNextPhase(notes: NotesDocument): AgentPhase {
    this.logger.debug('Determining next phase from notes...')
    this.logger.debug('Roadmap phases:', notes.roadmap.length)
    this.logger.debug('Total cycles:', notes.cycles.length)

    // If no roadmap or empty roadmap, start with discovery
    if (notes.roadmap.length === 0) {
      this.logger.debug('No roadmap found, starting with discovery')
      return 'discovery'
    }

    // Check if there's a current phase in progress
    const currentRoadmapPhase = notes.roadmap.find(p => p.status === 'in_progress')
    this.logger.debug('Current roadmap phase in progress:', currentRoadmapPhase?.title || 'none')

    if (!currentRoadmapPhase) {
      // No phase in progress, need discovery to pick next
      this.logger.debug('No phase in progress, returning to discovery')
      return 'discovery'
    }

    // Find the last completed cycle for this roadmap phase
    const cyclesForPhase = notes.cycles.filter(c => {
      // Map cycle phase to roadmap phase - this is a simplification
      // In reality, we'd track which roadmap phase each cycle belongs to
      return true
    })

    const lastCycle = cyclesForPhase[cyclesForPhase.length - 1]
    this.logger.debug('Last cycle:', lastCycle ? `cycle ${lastCycle.cycle} (${lastCycle.phase})` : 'none')

    if (!lastCycle) {
      // First cycle for this phase - start with plan
      this.logger.debug('First cycle for this phase, starting with plan')
      return 'plan'
    }

    // Cycle through phases: discovery -> plan -> implement -> review -> gap -> research -> (stop check) -> discovery
    this.logger.debug(`Last phase was ${lastCycle.phase}, determining next...`)
    switch (lastCycle.phase) {
      case 'discovery':
        this.logger.debug('After discovery -> plan')
        return 'plan'
      case 'plan':
        this.logger.debug('After plan -> implement')
        return 'implement'
      case 'implement':
        this.logger.debug('After implement -> review')
        return 'review'
      case 'review': {
        // If review failed, go back to implement
        const reviewPassed = lastCycle.output
          && 'review_passed' in lastCycle.output
          && lastCycle.output.review_passed
        this.logger.debug('Review passed:', reviewPassed)
        if (!reviewPassed) {
          this.logger.debug('Review failed, returning to implement')
          return 'implement'
        }
        this.logger.debug('After review -> gap')
        return 'gap'
      }
      case 'gap': {
        // If gaps found, research them
        const hasGaps = lastCycle.output
          && 'gaps' in lastCycle.output
          && Array.isArray(lastCycle.output.gaps)
          && lastCycle.output.gaps.length > 0
        this.logger.debug('Has gaps:', hasGaps)
        if (hasGaps) {
          this.logger.debug('Gaps found, going to research')
          return 'research'
        }
        // No gaps, complete this roadmap phase and discover next
        this.logger.debug('No gaps found, returning to discovery')
        return 'discovery'
      }
      case 'research':
        this.logger.debug('After research -> implement')
        // After research, go back to implement with new findings
        return 'implement'
      default:
        this.logger.debug('Unknown last phase, defaulting to discovery')
        return 'discovery'
    }
  }

  private async runAgent(
    phase: AgentPhase,
    notes: NotesDocument,
    currentCycle: number,
    session: OpenCodeSession,
  ): Promise<AgentResult> {
    this.logger.debug(`=== Running ${phase} agent (cycle ${currentCycle}) ===`)

    const context: AgentContext = {
      notes,
      currentCycle,
      workingDir: this.workingDir,
      branch: notes.session.branch,
    }

    this.logger.debug('Agent context built')
    this.logger.debug('Current cycle:', currentCycle)
    this.logger.debug('Working directory:', this.workingDir)
    this.logger.debug('Branch:', notes.session.branch)

    const cycleEntry: CycleEntry = {
      cycle: currentCycle,
      phase,
      agent: this.phaseToAgent(phase),
      status: 'running',
      started_at: new Date().toISOString(),
      summary: 'In progress...',
      output: { type: phase } as any, // Will be updated
    }

    this.logger.debug('Appending cycle entry to notes...')
    this.notesManager.appendCycle(cycleEntry)
    this.logger.debug('Cycle entry appended')

    try {
      let result: AgentResult

      switch (phase) {
        case 'discovery': {
          this.logger.debug('Initializing DiscoveryAgent...')
          const agent = new DiscoveryAgent({ session })
          this.logger.debug('Running DiscoveryAgent...')
          result = await agent.run(context)
          this.logger.debug('DiscoveryAgent completed, success=', result.success)
          if (result.success && result.output.type === 'discovery') {
            this.logger.debug('Updating roadmap with', result.output.roadmap.length, 'phases')
            this.notesManager.updateRoadmap(result.output.roadmap)
            // Mark first phase as in_progress
            const updatedNotes = this.notesManager.read()
            if (updatedNotes && updatedNotes.roadmap.length > 0) {
              updatedNotes.roadmap[0].status = 'in_progress'
              this.notesManager.updateRoadmap(updatedNotes.roadmap)
              this.logger.debug('Marked first phase as in_progress:', updatedNotes.roadmap[0].title)
            }
          }
          break
        }
        case 'plan': {
          this.logger.debug('Initializing PlannerAgent...')
          const agent = new PlannerAgent({ session })
          this.logger.debug('Running PlannerAgent...')
          result = await agent.run(context)
          this.logger.debug('PlannerAgent completed, success=', result.success)
          break
        }
        case 'implement': {
          this.logger.debug('Initializing ImplementerAgent...')
          const agent = new ImplementerAgent({ session })
          this.logger.debug('Running ImplementerAgent...')
          result = await agent.run(context)
          this.logger.debug('ImplementerAgent completed, success=', result.success)
          // Run tests and record results
          this.logger.debug('Running tests with command:', notes.session.test_command)
          try {
            const testOutput = await session.executeCommand(notes.session.test_command)
            cycleEntry.test_results = {
              command: notes.session.test_command,
              passed: testOutput.exitCode === 0,
              output: testOutput.stdout + testOutput.stderr,
            }
            this.logger.debug('Tests completed, exit code:', testOutput.exitCode)
            this.logger.debug('Tests passed:', cycleEntry.test_results.passed)
          }
          catch (error) {
            this.logger.error('Test execution failed:', error)
            cycleEntry.test_results = {
              command: notes.session.test_command,
              passed: false,
              output: 'Failed to run tests',
            }
          }
          break
        }
        case 'review': {
          this.logger.debug('Initializing ReviewerAgent...')
          const agent = new ReviewerAgent({ session })
          this.logger.debug('Running ReviewerAgent...')
          result = await agent.run(context)
          this.logger.debug('ReviewerAgent completed, success=', result.success)
          break
        }
        case 'gap': {
          this.logger.debug('Initializing GapAnalyzerAgent...')
          const agent = new GapAnalyzerAgent({ session })
          this.logger.debug('Running GapAnalyzerAgent...')
          result = await agent.run(context)
          this.logger.debug('GapAnalyzerAgent completed, success=', result.success)
          break
        }
        case 'research': {
          this.logger.debug('Initializing ResearcherAgent...')
          const agent = new ResearcherAgent({ session })
          this.logger.debug('Running ResearcherAgent...')
          result = await agent.run(context)
          this.logger.debug('ResearcherAgent completed, success=', result.success)
          break
        }
        default:
          this.logger.error('Unknown phase:', phase)
          throw new Error(`Unknown phase: ${phase}`)
      }

      // Update cycle entry with results
      this.logger.debug('Updating cycle entry with results...')
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
      this.logger.debug('Cycle entry updated')

      this.emit('cycle:completed', {
        cycle: currentCycle,
        phase,
        success: result.success,
      })

      this.logger.debug(`=== ${phase} agent finished ===`)
      return result
    }
    catch (error) {
      // Mark cycle as failed
      const errorMessage = error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === 'object' && error !== null
          ? JSON.stringify(error)
          : String(error)
      this.logger.error(`Agent ${phase} threw error: ${errorMessage}`)
      cycleEntry.status = 'failed'
      cycleEntry.completed_at = new Date().toISOString()
      cycleEntry.summary = errorMessage

      this.notesManager.updateLastCycle({
        status: 'failed',
        completed_at: cycleEntry.completed_at,
        summary: cycleEntry.summary,
      })
      this.logger.debug('Cycle entry marked as failed')

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
    this.logger.debug('=== Checking stop condition ===')
    this.logger.debug('Stop when:', notes.session.stop_when)

    let session: OpenCodeSession
    try {
      session = await this.opencodeClient.createSession()
      this.logger.debug('Created session for stop-check agent')
    }
    catch (error) {
      this.logger.error('Failed to create session for stop-check:', error)
      return false
    }

    try {
      const context: AgentContext = {
        notes,
        currentCycle,
        workingDir: this.workingDir,
        branch: notes.session.branch,
      }

      this.logger.debug('Running StopCheckAgent...')
      const agent = new StopCheckAgent({ session })
      const result = await agent.run(context)
      this.logger.debug('StopCheckAgent result:', JSON.stringify(result.output))

      if (result.output.type === 'stop-check' && 'should_stop' in result.output) {
        const shouldStop = result.output.should_stop
        this.logger.debug('Stop check evaluated:', shouldStop)
        this.logger.debug('Reason:', result.output.reason || 'No reason provided')
        return shouldStop
      }

      this.logger.warn('Stop check returned unexpected output format')
      return false
    }
    finally {
      this.logger.debug('Stop check session cleanup')
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
