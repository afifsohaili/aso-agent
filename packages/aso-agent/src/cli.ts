#!/usr/bin/env node
import { readFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { NotesManager } from './core/notes-manager.js'
import { GitManager } from './core/git-manager.js'
import { OpenCodeClient } from './services/opencode-client.js'
import { Orchestrator } from './orchestrator.js'
import { PromptLoader } from './core/prompt-loader.js'
import { loadConfig, exportDefaultConfig } from './core/config-loader.js'
import { reportStep, reportStopCheck, reportGap, getStateDir } from './core/report-commands.js'
import { createLogger, setDebug, setLogFile, getLogFile, logger } from './core/logger.js'
import { notesFileFromBranch, generateBranchName, generateSessionId, checkBranchCollision } from './core/naming.js'
import { summarizeObjective } from './core/summarize-objective.js'
import type { NotesDocument, SessionConfig, OpenCodeConfig } from './types/index.js'

const program = new Command()

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
Subcommand details:
  prompts export    Export built-in prompts to .aso-agent/prompts/ for customization
  prompts list      List available built-in prompt names
  config export     Export default aso-agent.yaml template to project root
  config export -f  Overwrite existing aso-agent.yaml

Session examples:
  $ aso-agent "Add user authentication" -s "Auth works end-to-end"
  $ aso-agent
  $ aso-agent --resume

Configuration example:
  $ aso-agent config export --force

Run any command with --help for full details:
  $ aso-agent prompts --help
  $ aso-agent config --help
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

      // Load aso-agent.yaml config if it exists
      cliLogger.debug('Loading aso-agent.yaml config...')
      const yamlConfig = loadConfig(process.cwd())
      const openCodeConfig: OpenCodeConfig | undefined = yamlConfig.opencode
      if (openCodeConfig) {
        cliLogger.info('OpenCode config loaded from aso-agent.yaml')
        if (openCodeConfig.model) cliLogger.info('  Model:', openCodeConfig.model)
        if (openCodeConfig.agent) cliLogger.info('  Agent:', openCodeConfig.agent)
      }
      else {
        cliLogger.debug('No opencode config in aso-agent.yaml')
      }

      let notes: NotesDocument
      let notesFile: string
      let sessionId: string
      let branchName: string

      // Get current branch and derive notes file
      cliLogger.debug('Getting current branch...')
      const currentBranch = gitManager.getCurrentBranch()
      cliLogger.debug('Current branch:', currentBranch)

      const derivedNotesFile = notesFileFromBranch(currentBranch)
      cliLogger.debug('Derived notes file:', derivedNotesFile)

      // Determine if we should resume (honor explicit --notes-file for auto-resume)
      const notesFileToCheck = options.notesFile || derivedNotesFile
      const notesFileExists = existsSync(notesFileToCheck)
      const shouldResume = options.resume || (!objective && notesFileExists)

      if (shouldResume) {
        // Resume mode
        if (options.resume) {
          cliLogger.info('Resuming from existing session (--resume)...')
        }
        else {
          cliLogger.info('No objective provided. Auto-resuming from existing session...')
        }

        notesFile = options.notesFile || derivedNotesFile
        cliLogger.info(`Using notes file: ${notesFile}`)

        cliLogger.debug('Reading notes file:', notesFile)
        notesManager = new NotesManager(notesFile)

        const existingNotes = notesManager.read()
        if (!existingNotes) {
          logger.error(`No notes file found at ${notesFile}`)
          process.exit(1)
        }

        notes = existingNotes
        branchName = notes.session.branch
        sessionId = notes.session.id

        cliLogger.debug('Session ID:', sessionId)
        cliLogger.debug('Session branch:', branchName)
        cliLogger.debug('Current branch:', currentBranch)
        cliLogger.debug('Total entries so far:', notes.entries.length)

        logger.info(`Resuming session: ${sessionId}`)
        logger.info(`Objective: ${notes.session.objectives[0]}`)
        logger.info(`Current step: ${notes.entries.length + 1}`)
        logger.info(`Total entries: ${notes.entries.length}`)

        // Verify branch consistency
        if (currentBranch !== branchName) {
          logger.info(`Switching to branch: ${branchName}`)
          try {
            gitManager.checkoutBranch(branchName)
            cliLogger.success('Switched to branch:', branchName)
          }
          catch {
            logger.error(`Could not checkout branch ${branchName}`)
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

        // Warn if notes file already exists for current branch
        if (notesFileExists) {
          cliLogger.warn(`Existing notes file detected for current branch: ${derivedNotesFile}`)
          cliLogger.warn('Starting a new session will create a separate branch. Use --resume to continue the existing work.')
        }

        // Start OpenCode server early for LLM summarization
        logger.start('Starting OpenCode server for session setup...')
        cliLogger.debug('Initializing OpenCode client...')
        opencodeClient = new OpenCodeClient()
        cliLogger.debug('Writing .opencode config (including aso-agent skill) before server starts...')
        await opencodeClient.writeConfig(process.cwd(), openCodeConfig)
        await opencodeClient.startServer()
        cliLogger.success('OpenCode server started')
        cliLogger.debug('Server health check passed')

        // LLM summarization of objective
        cliLogger.debug('Summarizing objective...')
        const summary = await summarizeObjective(objective, opencodeClient)
        cliLogger.debug('Generated summary:', summary)
        cliLogger.info('Session summary:', summary)

        // Generate names
        const now = new Date()
        const baseBranchName = generateBranchName(now, summary)
        const baseSessionId = generateSessionId(now, summary)

        cliLogger.debug('Generated base branch name:', baseBranchName)
        cliLogger.debug('Generated base session ID:', baseSessionId)

        // Check for branch collisions
        const existingBranches = gitManager.listBranches()
        branchName = checkBranchCollision(baseBranchName, existingBranches)
        sessionId = baseSessionId

        if (branchName !== baseBranchName) {
          cliLogger.info(`Branch collision detected, using: ${branchName}`)
          // Update session ID to match the collision-resolved branch
          sessionId = branchName.replace(/\//g, '-')
        }

        cliLogger.debug('Final branch name:', branchName)
        cliLogger.debug('Final session ID:', sessionId)

        // Create branch
        cliLogger.debug('Creating git branch:', branchName)
        gitManager.createBranch(branchName)
        cliLogger.success('Created branch:', branchName)

        notesFile = options.notesFile || notesFileFromBranch(branchName)
        notesManager = new NotesManager(notesFile)
        cliLogger.debug('Using notes file:', notesFile)

        const config: SessionConfig = {
          id: sessionId,
          started: now.toISOString(),
          objectives: [objective],
          stop_when: options.stopWhen,
          branch: branchName,
          max_iterations: parseInt(options.maxIterations, 10),
          max_time_per_iteration: parseInt(options.maxTimePerIteration, 10),
        }

        cliLogger.debug('Session config:', JSON.stringify(config))

        // Initialize notes with empty entries
        notes = notesManager.initialize(config)
        cliLogger.success('Created new session:', sessionId)
        cliLogger.info('Branch:', branchName)
        cliLogger.info('Objective:', objective)
        cliLogger.info('Stop when:', options.stopWhen)
      }

      // Start OpenCode server (if not already started for new session)
      if (!opencodeClient) {
        logger.start('Starting OpenCode server...')
        cliLogger.debug('Initializing OpenCode client...')
        opencodeClient = new OpenCodeClient()
        cliLogger.debug('Writing .opencode config (including aso-agent skill) before server starts...')
        await opencodeClient.writeConfig(process.cwd(), openCodeConfig)
        await opencodeClient.startServer()
        cliLogger.success('OpenCode server started')
        cliLogger.debug('Server health check passed')
      }

      // Create orchestrator
      cliLogger.debug('Creating orchestrator...')
      const orchestrator = new Orchestrator({
        notesManager,
        gitManager,
        opencodeClient,
        workingDir: process.cwd(),
        openCodeConfig,
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
Entries: ${notes.entries.length}
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

// ── Config subcommand ────────────────────────────────────────────────

const configCmd = program
  .command('config')
  .description('Manage aso-agent configuration')

configCmd
  .command('export')
  .description('Export default aso-agent.yaml template to the project root')
  .option('-o, --output <dir>', 'Output directory', '.')
  .option('-f, --force', 'Overwrite existing aso-agent.yaml')
  .action((options) => {
    const cliLogger = createLogger('cli')
    try {
      const filePath = exportDefaultConfig(options.output, options.force || false)
      cliLogger.success(`Config template written to ${filePath}`)
      cliLogger.info('')
      cliLogger.info('Edit this file to customize aso-agent defaults for your project.')
      cliLogger.info('CLI arguments override values set in this file.')
    }
    catch (error) {
      cliLogger.error('Failed to export config:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

// ── Report subcommands ──────────────────────────────────────────────

program
  .command('report-step')
  .description('Report an implementer step result to notes.yaml')
  .requiredOption('--summary <summary>', 'One-line summary of the step')
  .requiredOption('--tests-passed <bool>', 'Whether all tests passed (true/false)')
  .option('--files-changed <json>', 'JSON array of changed files', '[]')
  .option('-n, --notes-file <path>', 'Path to notes.yaml (auto-derived from branch if omitted)')
  .action((options) => {
    const cliLogger = createLogger('cli')
    try {
      let notesFile: string = options.notesFile
      if (!notesFile) {
        const gitManager = new GitManager()
        const branch = gitManager.getCurrentBranch()
        notesFile = notesFileFromBranch(branch)
        cliLogger.debug('Auto-derived notes file from branch:', notesFile)
      }
      const testsPassed = options.testsPassed === 'true'
      const filesChanged = JSON.parse(options.filesChanged)
      const result = reportStep(notesFile, {
        summary: options.summary,
        testsPassed,
        filesChanged,
      })

      if (!result.success) {
        cliLogger.error('Failed to report step:', result.error)
        process.exit(1)
      }

      cliLogger.success('Step reported successfully')
    }
    catch (error) {
      cliLogger.error('Failed to report step:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

program
  .command('stop-check')
  .description('Report a stop-check evaluation')
  .requiredOption('--should-stop <bool>', 'Whether the stop condition is met (true/false)')
  .requiredOption('--reason <reason>', 'Explanation for the decision')
  .option('-d, --working-dir <dir>', 'Working directory', '.')
  .action((options) => {
    const cliLogger = createLogger('cli')
    try {
      const shouldStop = options.shouldStop === 'true'
      const stateDir = getStateDir(options.workingDir)
      const result = reportStopCheck(stateDir, {
        shouldStop,
        reason: options.reason,
      })

      if (!result.success) {
        cliLogger.error('Failed to report stop-check:', result.error)
        process.exit(1)
      }

      cliLogger.success('Stop-check reported successfully')
    }
    catch (error) {
      cliLogger.error('Failed to report stop-check:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

program
  .command('gap-report')
  .description('Report a gap-analysis result')
  .requiredOption('--gaps <json>', 'JSON array of gap descriptions')
  .requiredOption('--summary <summary>', 'Brief summary of the analysis')
  .option('-d, --working-dir <dir>', 'Working directory', '.')
  .action((options) => {
    const cliLogger = createLogger('cli')
    try {
      const gaps = JSON.parse(options.gaps)
      const stateDir = getStateDir(options.workingDir)
      const result = reportGap(stateDir, {
        gaps,
        summary: options.summary,
      })

      if (!result.success) {
        cliLogger.error('Failed to report gap analysis:', result.error)
        process.exit(1)
      }

      cliLogger.success('Gap analysis reported successfully')
    }
    catch (error) {
      cliLogger.error('Failed to report gap analysis:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

program.parse()
