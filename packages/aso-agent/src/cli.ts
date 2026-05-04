#!/usr/bin/env node
import { Command } from 'commander'
import { NotesManager } from './core/notes-manager.js'
import { GitManager } from './core/git-manager.js'
import { OpenCodeClient } from './services/opencode-client.js'
import { Orchestrator } from './orchestrator.js'
import { createLogger, setDebug, logger } from './core/logger.js'
import type { NotesDocument, SessionConfig } from './types/index.js'

const program = new Command()

program
  .name('aso-agent')
  .description('Autonomous AI agent that runs overnight')
  .version('0.0.0')
  .argument('[objective]', 'The vague instruction for the agent')
  .option('-s, --stop-when <condition>', 'Stop condition in natural language')
  .option('-m, --max-iterations <n>', 'Maximum iterations', '50')
  .option('-t, --max-time-per-iteration <seconds>', 'Max time per iteration in seconds', '1800')
  .option('-n, --notes-file <path>', 'Path to notes.yaml', './notes.yaml')
  .option('-r, --resume', 'Resume from existing notes.yaml')
  .option('-d, --debug', 'Enable verbose debug logging')
  .action(async (objective: string | undefined, options) => {
    // Set up debug logging
    setDebug(options.debug || false)
    const cliLogger = createLogger('cli')

    cliLogger.debug('CLI started with options:', JSON.stringify(options))
    cliLogger.debug('Objective:', objective || '(resuming)')

    const notesManager = new NotesManager(options.notesFile)
    const gitManager = new GitManager()
    let opencodeClient: OpenCodeClient | null = null

    try {
      // Validate git repo
      cliLogger.debug('Validating git repository...')
      if (!gitManager.isGitRepo()) {
        logger.error('Not a git repository')
        process.exit(1)
      }
      cliLogger.debug('Git repository validated')

      let notes: NotesDocument

      if (options.resume) {
        // Resume mode
        cliLogger.info('Resuming from existing session...')
        cliLogger.debug('Reading notes file:', options.notesFile)

        const existingNotes = notesManager.read()
        if (!existingNotes) {
          logger.error(`No notes file found at ${options.notesFile}`)
          process.exit(1)
        }

        notes = existingNotes
        cliLogger.debug('Session ID:', notes.session.id)
        cliLogger.debug('Current branch:', notes.session.branch)
        cliLogger.debug('Total cycles so far:', notes.cycles.length)
        cliLogger.debug('Roadmap phases:', notes.roadmap.length)

        logger.info(`Resuming session: ${notes.session.id}`)
        logger.info(`Objective: ${notes.session.objective}`)
        logger.info(`Current cycle: ${notes.cycles.length + 1}`)

        // Checkout the branch
        cliLogger.debug('Checking current branch...')
        const currentBranch = gitManager.getCurrentBranch()
        cliLogger.debug('Current git branch:', currentBranch)
        cliLogger.debug('Expected branch:', notes.session.branch)

        if (currentBranch !== notes.session.branch) {
          logger.info(`Switching to branch: ${notes.session.branch}`)
          try {
            const { execFileSync } = await import('node:child_process')
            execFileSync('git', ['checkout', notes.session.branch], { stdio: 'pipe' })
            cliLogger.success('Switched to branch:', notes.session.branch)
          }
          catch {
            logger.error(`Could not checkout branch ${notes.session.branch}`)
            process.exit(1)
          }
        }
        else {
          cliLogger.debug('Already on correct branch')
        }
      }
      else {
        // New session
        cliLogger.info('Starting new session...')

        if (!objective) {
          logger.error('Objective required for new sessions')
          process.exit(1)
        }

        if (!options.stopWhen) {
          logger.error('--stop-when required for new sessions')
          process.exit(1)
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const sessionId = `aso-agent-${timestamp}`
        const branchName = `aso-agent/${timestamp}`

        cliLogger.debug('Generated session ID:', sessionId)
        cliLogger.debug('Generated branch name:', branchName)

        // Create branch
        cliLogger.debug('Creating git branch:', branchName)
        gitManager.createBranch(branchName)
        cliLogger.success('Created branch:', branchName)

        // Detect test command
        cliLogger.debug('Detecting test command...')
        const testCommand = await detectTestCommand()
        cliLogger.debug('Detected test command:', testCommand)

        const config: SessionConfig = {
          id: sessionId,
          started: new Date().toISOString(),
          objective,
          stop_when: options.stopWhen,
          branch: branchName,
          test_command: testCommand,
          max_iterations: parseInt(options.maxIterations, 10),
          max_time_per_iteration: parseInt(options.maxTimePerIteration, 10),
        }

        cliLogger.debug('Session config:', JSON.stringify(config))

        // Initialize notes with empty roadmap (Discovery will populate it)
        notes = notesManager.initialize(config, [])
        cliLogger.success('Created new session:', sessionId)
        cliLogger.info('Branch:', branchName)
        cliLogger.info('Objective:', objective)
        cliLogger.info('Stop when:', options.stopWhen)
      }

      // Start OpenCode server
      logger.start('Starting OpenCode server...')
      cliLogger.debug('Initializing OpenCode client...')
      opencodeClient = new OpenCodeClient()
      await opencodeClient.startServer()
      cliLogger.success('OpenCode server started')
      cliLogger.debug('Server health check passed')

      // Create orchestrator
      cliLogger.debug('Creating orchestrator...')
      const orchestrator = new Orchestrator({
        notesManager,
        gitManager,
        opencodeClient,
        workingDir: process.cwd(),
      })
      cliLogger.debug('Orchestrator created')

      // Set up event listeners
      orchestrator.on('cycle:started', ({ cycle, phase }) => {
        cliLogger.start(`[Cycle ${cycle}] Starting ${phase}...`)
      })

      orchestrator.on('cycle:completed', ({ cycle, phase, success }) => {
        const status = success ? '✓' : '✗'
        cliLogger.info(`[Cycle ${cycle}] ${phase} ${status}`)
      })

      orchestrator.on('cycle:committed', ({ cycle, phase, hash }) => {
        cliLogger.success(`[Cycle ${cycle}] Committed: ${hash?.slice(0, 7)}`)
      })

      orchestrator.on('cycle:failed', ({ cycle, phase, error }) => {
        cliLogger.error(`[Cycle ${cycle}] ${phase} FAILED: ${error}`)
      })

      orchestrator.on('stopped', ({ reason }) => {
        cliLogger.ready(`Stopped: ${reason}`)
      })

      orchestrator.on('error', (error) => {
        cliLogger.error('Orchestrator error:', error)
      })

      // Handle interrupts
      let interruptCount = 0
      process.on('SIGINT', () => {
        interruptCount++
        cliLogger.warn(`SIGINT received (count: ${interruptCount})`)
        if (interruptCount === 1) {
          logger.info('Graceful stop requested. Finishing current cycle...')
          orchestrator.stop()
        }
        else {
          logger.warn('Force stopping...')
          process.exit(1)
        }
      })

      // Run the orchestrator
      logger.start('Starting autonomous agent...')
      cliLogger.debug('Beginning orchestrator run loop')
      await orchestrator.run()
      cliLogger.debug('Orchestrator run loop completed')

      // Final commit
      cliLogger.debug('Creating final commit...')
      const finalCommit = gitManager.commit('aso-agent: session complete')
      if (finalCommit.success) {
        cliLogger.success(`Final commit: ${finalCommit.hash?.slice(0, 7)}`)
      }
      else {
        cliLogger.warn('Final commit failed:', finalCommit.error)
      }

      // Show summary
      cliLogger.debug('Generating session summary...')
      const stats = gitManager.getDiffStats()
      logger.box('Session Summary', `
Branch: ${notes.session.branch}
Cycles: ${notes.cycles.length}
Files changed: ${stats.files}
Insertions: ${stats.insertions}
Deletions: ${stats.deletions}
Notes: ${options.notesFile}
      `.trim())
    }
    catch (error) {
      cliLogger.error('Fatal error:', error instanceof Error ? error.message : String(error))
      cliLogger.debug('Error stack:', error instanceof Error ? error.stack : 'No stack')
      process.exit(1)
    }
    finally {
      // Stop OpenCode server
      if (opencodeClient) {
        cliLogger.debug('Stopping OpenCode server...')
        await opencodeClient.stopServer()
        cliLogger.success('OpenCode server stopped')
      }
      cliLogger.debug('CLI cleanup complete')
    }
  })

async function detectTestCommand(): Promise<string> {
  const { existsSync, readFileSync } = await import('node:fs')

  if (existsSync('package.json')) {
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
      if (pkg.scripts?.test) {
        return `pnpm test`
      }
    }
    catch {
      // Ignore parse errors
    }
  }

  // Check for vitest
  if (existsSync('vitest.config.ts') || existsSync('vitest.config.js')) {
    return 'npx vitest run'
  }

  // Check for jest
  if (existsSync('jest.config.js') || existsSync('jest.config.ts')) {
    return 'npx jest'
  }

  // Default
  return 'npm test'
}

program.parse()
