#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { NotesManager } from './core/notes-manager.js'
import { GitManager } from './core/git-manager.js'
import { OpenCodeClient } from './services/opencode-client.js'
import { Orchestrator } from './orchestrator.js'
import { PromptLoader } from './core/prompt-loader.js'
import { createLogger, setDebug, setLogFile, getLogFile, isDebugEnabled, logger } from './core/logger.js'
import type { NotesDocument, SessionConfig } from './types/index.js'

const program = new Command()

function notesFileFromBranch(branch: string): string {
  const sanitized = branch.replace(/[^a-zA-Z0-9._-]/g, '-')
  return `notes-${sanitized}.yaml`
}

function findLatestNotesFile(): string | null {
  try {
    const files = readdirSync('.')
    const notesFiles = files.filter(f => f.startsWith('notes-') && f.endsWith('.yaml'))
    if (notesFiles.length === 0) return null
    if (notesFiles.length === 1) return notesFiles[0]
    notesFiles.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    return notesFiles[0]
  }
  catch {
    return null
  }
}

program
  .name('aso-agent')
  .description('Autonomous AI agent that runs overnight. Supports resuming from previous sessions.')
  .version('0.0.0')
  .argument('[objective]', 'The vague instruction for the agent. Omit to resume existing session.')
  .option('-s, --stop-when <condition>', 'Stop condition in natural language (required for new sessions)')
  .option('-m, --max-iterations <n>', 'Maximum iterations', '50')
  .option('-t, --max-time-per-iteration <seconds>', 'Max time per iteration in seconds', '1800')
  .option('-n, --notes-file <path>', 'Path to notes.yaml (auto-derived from branch if omitted)')
  .option('-r, --resume', 'Resume from existing notes.yaml (auto-detected if no objective given)')
  .option('-d, --debug', 'Enable verbose debug logging')
  .option('-l, --log-file <path>', 'Write logs to file')
  .addHelpText('after', `
Examples:
  # Start a new session
  $ aso-agent "Add user authentication" -s "Auth works end-to-end"

  # Resume from existing session (auto-detected)
  $ aso-agent

  # Resume from specific notes file
  $ aso-agent --resume --notes-file notes-aso-agent-2026-05-05.yaml
`)
  .action(async (objective: string | undefined, options) => {
    // Set up file logging first (default to temp dir if not provided)
    let logFile = options.logFile
    if (!logFile) {
      const tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-'))
      logFile = join(tmpDir, 'aso-agent.log')
    }
    setLogFile(logFile)

    // Set up debug logging
    setDebug(options.debug || false)
    const cliLogger = createLogger('cli')

    cliLogger.info(`Logging to: ${logFile}`)

    cliLogger.debug('CLI started with options:', JSON.stringify(options))
    cliLogger.debug('Objective:', objective || '(resuming)')

    const gitManager = new GitManager()
    let notesManager: NotesManager
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
      let notesFile: string

      // Auto-detect existing notes files
      const detectedNotesFile = findLatestNotesFile()

      // Determine if we should resume
      const shouldResume = options.resume || (!objective && detectedNotesFile)

      if (shouldResume) {
        // Resume mode
        if (options.resume) {
          cliLogger.info('Resuming from existing session (--resume)...')
        }
        else {
          cliLogger.info('No objective provided. Auto-resuming from existing session...')
        }

        notesFile = options.notesFile || detectedNotesFile!
        cliLogger.info(`Using notes file: ${notesFile}`)

        cliLogger.debug('Reading notes file:', notesFile)
        notesManager = new NotesManager(notesFile)

        const existingNotes = notesManager.read()
        if (!existingNotes) {
          logger.error(`No notes file found at ${notesFile}`)
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

        // Show current phase status
        const currentPhase = notes.roadmap.find(p => p.status === 'in_progress')
        if (currentPhase) {
          logger.info(`Current phase: ${currentPhase.title}`)
        }
        const completedCount = notes.roadmap.filter(p => p.status === 'completed').length
        if (completedCount > 0) {
          logger.info(`Completed phases: ${completedCount}/${notes.roadmap.length}`)
        }

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
          logger.error('Objective required for new sessions. Or use --resume to continue an existing session.')
          process.exit(1)
        }

        if (!options.stopWhen) {
          logger.error('--stop-when required for new sessions')
          process.exit(1)
        }

        // Warn if notes files already exist
        if (detectedNotesFile) {
          cliLogger.warn(`Existing notes file detected: ${detectedNotesFile}`)
          cliLogger.warn('Starting a new session will create a separate branch. Use --resume to continue the existing work.')
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

        notesFile = options.notesFile || notesFileFromBranch(branchName)
        notesManager = new NotesManager(notesFile)
        cliLogger.debug('Using notes file:', notesFile)

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
Notes: ${notesFile}
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

      // Always output log file path at end of session
      cliLogger.info(`Log file: ${logFile}`)
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

// ── Prompts subcommand ──────────────────────────────────────────────

const promptsCmd = program
  .command('prompts')
  .description('Manage agent prompts')

promptsCmd
  .command('export')
  .description('Export built-in prompts to .aso-agent/prompts/ for customization')
  .option('-o, --output <dir>', 'Output directory', '.')
  .action((options) => {
    const cliLogger = createLogger('cli')
    try {
      const loader = new PromptLoader(options.output)
      const { exported, destDir } = loader.exportTo(options.output)
      cliLogger.success(`Exported ${exported.length} prompts to ${destDir}`)
      exported.forEach(name => cliLogger.info(`  - ${name}.md`))
      cliLogger.info('')
      cliLogger.info('Edit these files to customize prompts for this repository.')
      cliLogger.info('The agent will use overridden prompts automatically on the next run.')
    }
    catch (error) {
      cliLogger.error('Failed to export prompts:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

promptsCmd
  .command('list')
  .description('List available built-in prompt names')
  .action(() => {
    const cliLogger = createLogger('cli')
    const loader = new PromptLoader('.')
    const builtins = loader.listBuiltins()
    cliLogger.info('Built-in prompts:')
    builtins.forEach(name => cliLogger.info(`  - ${name}`))
  })

program.parse()
