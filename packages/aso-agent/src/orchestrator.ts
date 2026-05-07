import { EventEmitter } from 'node:events'
import type { NotesManager } from './core/notes-manager.js'
import type { GitManager } from './core/git-manager.js'
import type { OpenCodeClient, OpenCodeSession } from './services/opencode-client.js'
import { createLogger } from './core/logger.js'
import { ImplementerAgent, StopCheckAgent } from './agents/index.js'
import type { AgentContext, AgentResult, NotesDocument } from './types/index.js'

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

    try {
      const notes = this.notesManager.read()
      if (!notes) {
        this.logger.error('No notes document found')
        throw new Error('No notes document found. Initialize first.')
      }

      this.logger.debug('Session ID:', notes.session.id)
      this.logger.debug('Objective:', notes.session.objective)
      this.logger.debug('Max iterations:', notes.session.max_iterations)
      this.logger.debug('Total entries:', notes.entries.length)

      // Write opencode.json to enable YOLO mode (auto-approve all permissions)
      this.logger.debug('Writing opencode.json with auto-approve permissions...')
      this.opencodeClient.writeConfig(this.workingDir)
      this.logger.debug('opencode.json written')

      // Session resumability: reuse existing session if available
      if (notes.session.opencode_session_id) {
        this.logger.debug('Resuming existing OpenCode session:', notes.session.opencode_session_id)
        session = this.opencodeClient.getSession(notes.session.opencode_session_id)
      }
      else {
        this.logger.debug('Creating new OpenCode session...')
        try {
          session = await this.opencodeClient.createSession()
          this.logger.debug('OpenCode session created successfully:', session.id)
          this.notesManager.updateSession({ opencode_session_id: session.id })
        }
        catch (error) {
          this.logger.error('Failed to create OpenCode session:', error)
          throw error
        }
      }

      // Main loop
      while (this.running) {
        const currentNotes = this.notesManager.read() || notes
        const currentStep = currentNotes.entries.length + 1
        this.logger.debug(`--- Starting step ${currentStep} ---`)

        // Check max iterations
        if (currentStep > currentNotes.session.max_iterations) {
          this.logger.warn(`Max iterations reached (${currentNotes.session.max_iterations})`)
          this.emit('stopped', { reason: 'max_iterations_reached' })
          break
        }

        this.logger.debug(`Step ${currentStep} within limit (${currentNotes.session.max_iterations})`)
        this.emit('step:started', { step: currentStep })

        try {
          // Run implementer
          this.logger.debug('Running implementer agent...')
          const implementResult = await this.runImplementer(currentNotes, currentStep, session)
          this.logger.debug(`Implementer completed with success=${implementResult.success}`)

          // Append entry to notes
          this.logger.debug('Appending entry to notes...')
          this.notesManager.appendEntry({
            step: currentStep,
            timestamp: new Date().toISOString(),
            summary: implementResult.summary,
            files_changed: implementResult.output.type === 'implement'
              ? implementResult.output.files_changed
              : [],
            tests_passed: implementResult.output.type === 'implement'
              ? implementResult.output.tests_passed
              : false,
          })

          if (!implementResult.success) {
            this.emit('step:failed', {
              step: currentStep,
              summary: implementResult.summary,
            })
          }

          // Run stop check
          this.logger.debug('Running stop-check agent...')
          const stopResult = await this.runStopCheck(currentNotes, currentStep, session)
          this.logger.debug('Stop check result:', stopResult.output)

          if (stopResult.output.type === 'stop-check' && stopResult.output.should_stop) {
            this.logger.info('Stop condition met, ending session')
            this.emit('stopped', { reason: 'stop_condition_met' })
            break
          }

          this.logger.debug(`Step ${currentStep} completed successfully`)
        }
        catch (error) {
          this.logger.error(`Step ${currentStep} error:`, error)
          this.emit('step:failed', {
            step: currentStep,
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

      // Clean up opencode.json
      this.logger.debug('Cleaning up opencode.json...')
      this.opencodeClient.removeConfig(this.workingDir)
      this.logger.debug('opencode.json removed')
    }
  }

  stop(): void {
    this.logger.info('Stop requested')
    this.running = false
    this.emit('stopping')
  }

  private async runImplementer(
    notes: NotesDocument,
    currentStep: number,
    session: OpenCodeSession,
  ): Promise<AgentResult> {
    this.logger.debug(`=== Running implementer agent (step ${currentStep}) ===`)

    const context: AgentContext = {
      notes,
      currentStep,
      workingDir: this.workingDir,
      branch: notes.session.branch,
      notesFilePath: this.notesManager.getFilePath(),
    }

    this.logger.debug('Agent context built')
    this.logger.debug('Current step:', currentStep)
    this.logger.debug('Working directory:', this.workingDir)
    this.logger.debug('Branch:', notes.session.branch)

    const agent = new ImplementerAgent({ session })
    const result = await agent.run(context)

    this.logger.debug(`=== Implementer agent finished ===`)
    return result
  }

  private async runStopCheck(
    notes: NotesDocument,
    currentStep: number,
    session: OpenCodeSession,
  ): Promise<AgentResult> {
    this.logger.debug('=== Running stop-check agent ===')
    this.logger.debug('Stop when:', notes.session.stop_when)

    try {
      // Get git log since session started
      const gitLog = this.gitManager.getLogSinceBranchCreated()

      const context: AgentContext = {
        notes,
        currentStep,
        workingDir: this.workingDir,
        branch: notes.session.branch,
        notesFilePath: this.notesManager.getFilePath(),
        gitLog,
      }

      this.logger.debug('Running StopCheckAgent...')
      const agent = new StopCheckAgent({ session })
      const result = await agent.run(context)
      this.logger.debug('StopCheckAgent result:', JSON.stringify(result.output))

      return result
    }
    finally {
      this.logger.debug('Stop check completed')
    }
  }
}
