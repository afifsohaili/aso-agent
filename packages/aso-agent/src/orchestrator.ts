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

    let session: OpenCodeSession | null = null
    const iterationResults: Array<{ phase: AgentPhase, success: boolean, summary: string }> = []

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

      // Create a fresh OpenCode session for this run
      // Note: We always create a new session because the OpenCode server
      // is started fresh each time. Old sessions don't persist across server restarts.
      // All context is preserved in notes.yaml anyway.
      if (initialNotes.session.opencode_session_id) {
        this.logger.debug('Previous session ID:', initialNotes.session.opencode_session_id)
        this.logger.debug('Creating fresh OpenCode session (server restarted)...')
      }
      else {
        this.logger.debug('Creating new OpenCode session...')
      }

      try {
        session = await this.opencodeClient.createSession()
        this.logger.debug('OpenCode session created successfully:', session.id)
        this.notesManager.updateSession({ opencode_session_id: session.id })
      }
      catch (error) {
        this.logger.error('Failed to create OpenCode session:', error)
        throw error
      }

      // Main loop
      while (this.running) {
        // Re-read notes from disk each cycle to get accurate cycle count
        const notes = this.notesManager.read() || initialNotes
        const currentCycle = notes.cycles.length + 1
        this.logger.debug(`--- Starting cycle ${currentCycle} ---`)

        // Check max iterations
        if (currentCycle > notes.session.max_iterations) {
          this.logger.warn(`Max iterations reached (${notes.session.max_iterations})`)
          this.commitIteration(iterationResults, currentCycle)
          this.emit('stopped', { reason: 'max_iterations_reached' })
          break
        }

        this.logger.debug(`Cycle ${currentCycle} within limit (${notes.session.max_iterations})`)

        // Determine next phase
        this.logger.debug('Determining next phase...')
        const phase = this.determineNextPhase(notes)
        this.logger.info(`Next phase: ${phase}`)

        this.emit('cycle:started', { cycle: currentCycle, phase })

        try {
          this.logger.debug(`Running ${phase} agent...`)
          const result = await this.runAgent(phase, notes, currentCycle, session)
          this.logger.debug(`Agent ${phase} completed with success=${result.success}`)

          // Accumulate result for end-of-iteration commit
          iterationResults.push({ phase, success: result.success, summary: result.summary })

          if (!result.success) {
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
          let shouldStop = false
          if (phase === 'research' || phase === 'gap') {
            this.logger.debug('Checking stop condition...')
            shouldStop = await this.checkStopCondition(notes, currentCycle, session)
            this.logger.debug('Stop condition result:', shouldStop)
            if (shouldStop) {
              this.logger.info('Stop condition met, ending session')
              this.commitIteration(iterationResults, currentCycle)
              this.emit('stopped', { reason: 'stop_condition_met' })
              break
            }
          }

          // Determine if this completes a full iteration cycle
          const updatedNotes = this.notesManager.read() || notes
          const nextPhase = this.determineNextPhase(updatedNotes)
          const isEndOfIteration = nextPhase === 'discovery' && iterationResults.length > 0

          if (isEndOfIteration) {
            this.logger.debug('End of iteration reached, committing accumulated work...')
            this.commitIteration(iterationResults, currentCycle)
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

  private commitIteration(
    results: Array<{ phase: AgentPhase, success: boolean, summary: string }>,
    cycle: number,
  ): void {
    if (results.length === 0) return

    const phaseSummaries = results.map((r) => {
      const status = r.success ? '✓' : '✗'
      return `  ${status} ${r.phase}: ${r.summary}`
    }).join('\n')

    const allPassed = results.every(r => r.success)
    const statusLabel = allPassed ? 'complete' : 'partial'
    const commitMessage = `aso-agent: iteration ${cycle} ${statusLabel}\n\n${phaseSummaries}`

    this.logger.debug('Committing iteration...')
    this.logger.debug('Commit message preview:')
    this.logger.debug(commitMessage)

    const commitResult = this.gitManager.commit(commitMessage)

    if (commitResult.success) {
      this.logger.debug('Commit successful:', commitResult.hash?.slice(0, 7))
      this.emit('cycle:committed', {
        cycle,
        phases: results.map(r => r.phase),
        hash: commitResult.hash,
      })
    }
    else {
      this.logger.warn('Commit failed:', commitResult.error)
      this.emit('cycle:warning', {
        cycle,
        message: `Commit failed: ${commitResult.error}`,
      })
    }

    // Clear accumulated results
    results.length = 0
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
        // No gaps, mark current phase as completed and move to next
        this.logger.debug('No gaps found, marking current phase as completed')
        const currentPhase = notes.roadmap.find(p => p.status === 'in_progress')
        if (currentPhase) {
          currentPhase.status = 'completed'
          this.notesManager.updateRoadmap(notes.roadmap)
          this.logger.debug(`Marked phase '${currentPhase.title}' as completed`)
        }
        const nextPending = notes.roadmap.find(p => p.status === 'pending')
        if (nextPending) {
          nextPending.status = 'in_progress'
          this.notesManager.updateRoadmap(notes.roadmap)
          this.logger.debug(`Marked phase '${nextPending.title}' as in_progress`)
          this.logger.debug('After gap (next phase exists) -> plan')
          return 'plan'
        }
        this.logger.debug('No more pending phases, returning to discovery')
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
      notesFilePath: this.notesManager.getFilePath(),
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

  private async checkStopCondition(notes: NotesDocument, currentCycle: number, session: OpenCodeSession): Promise<boolean> {
    this.logger.debug('=== Checking stop condition ===')
    this.logger.debug('Stop when:', notes.session.stop_when)

    try {
      const context: AgentContext = {
        notes,
        currentCycle,
        workingDir: this.workingDir,
        branch: notes.session.branch,
        notesFilePath: this.notesManager.getFilePath(),
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
      this.logger.debug('Stop check completed')
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
