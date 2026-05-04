#!/usr/bin/env node
import { Command } from 'commander'
import { NotesManager } from './core/notes-manager.js'
import { GitManager } from './core/git-manager.js'
import { OpenCodeClient } from './services/opencode-client.js'
import { Orchestrator } from './orchestrator.js'
import type { NotesDocument, RoadmapPhase, SessionConfig } from './types/index.js'

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
  .action(async (objective: string | undefined, options) => {
    const notesManager = new NotesManager(options.notesFile)
    const gitManager = new GitManager()
    let opencodeClient: OpenCodeClient | null = null

    try {
      // Validate git repo
      if (!gitManager.isGitRepo()) {
        console.error('Error: Not a git repository')
        process.exit(1)
      }

      let notes: NotesDocument

      if (options.resume) {
        // Resume mode
        const existingNotes = notesManager.read()
        if (!existingNotes) {
          console.error(`Error: No notes file found at ${options.notesFile}`)
          process.exit(1)
        }

        notes = existingNotes
        console.log(`Resuming session: ${notes.session.id}`)
        console.log(`Objective: ${notes.session.objective}`)
        console.log(`Current cycle: ${notes.cycles.length + 1}`)

        // Checkout the branch
        const currentBranch = gitManager.getCurrentBranch()
        if (currentBranch !== notes.session.branch) {
          console.log(`Switching to branch: ${notes.session.branch}`)
          // Note: createBranch will fail if branch exists, so we use checkout
          try {
            const { execFileSync } = await import('node:child_process')
            execFileSync('git', ['checkout', notes.session.branch], { stdio: 'inherit' })
          }
          catch {
            console.error(`Error: Could not checkout branch ${notes.session.branch}`)
            process.exit(1)
          }
        }
      }
      else {
        // New session
        if (!objective) {
          console.error('Error: Objective required for new sessions')
          process.exit(1)
        }

        if (!options.stopWhen) {
          console.error('Error: --stop-when required for new sessions')
          process.exit(1)
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const sessionId = `aso-agent-${timestamp}`
        const branchName = `aso-agent/${timestamp}`

        // Create branch
        gitManager.createBranch(branchName)

        // Detect test command
        const testCommand = await detectTestCommand()

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

        // Initialize notes with empty roadmap (Discovery will populate it)
        notes = notesManager.initialize(config, [])
        console.log(`Created new session: ${sessionId}`)
        console.log(`Branch: ${branchName}`)
        console.log(`Objective: ${objective}`)
        console.log(`Stop when: ${options.stopWhen}`)
      }

      // Start OpenCode server
      console.log('\nStarting OpenCode server...')
      opencodeClient = new OpenCodeClient()
      await opencodeClient.startServer()
      console.log('OpenCode server started')

      // Create orchestrator
      const orchestrator = new Orchestrator({
        notesManager,
        gitManager,
        opencodeClient,
        workingDir: process.cwd(),
      })

      // Set up event listeners
      orchestrator.on('cycle:started', ({ cycle, phase }) => {
        console.log(`\n[Cycle ${cycle}] Starting ${phase}...`)
      })

      orchestrator.on('cycle:completed', ({ cycle, phase, success }) => {
        const status = success ? '✓' : '✗'
        console.log(`[Cycle ${cycle}] ${phase} ${status}`)
      })

      orchestrator.on('cycle:committed', ({ cycle, phase, hash }) => {
        console.log(`[Cycle ${cycle}] Committed: ${hash?.slice(0, 7)}`)
      })

      orchestrator.on('cycle:failed', ({ cycle, phase, error }) => {
        console.error(`[Cycle ${cycle}] ${phase} FAILED: ${error}`)
      })

      orchestrator.on('stopped', ({ reason }) => {
        console.log(`\nStopped: ${reason}`)
      })

      // Handle interrupts
      let interruptCount = 0
      process.on('SIGINT', () => {
        interruptCount++
        if (interruptCount === 1) {
          console.log('\nGraceful stop requested. Finishing current cycle...')
          orchestrator.stop()
        }
        else {
          console.log('\nForce stopping...')
          process.exit(1)
        }
      })

      // Run the orchestrator
      console.log('\nStarting autonomous agent...')
      await orchestrator.run()

      // Final commit
      const finalCommit = gitManager.commit('aso-agent: session complete')
      if (finalCommit.success) {
        console.log(`\nFinal commit: ${finalCommit.hash?.slice(0, 7)}`)
      }

      // Show summary
      const stats = gitManager.getDiffStats()
      console.log(`\nSession Summary:`)
      console.log(`- Branch: ${notes.session.branch}`)
      console.log(`- Cycles: ${notes.cycles.length}`)
      console.log(`- Files changed: ${stats.files}`)
      console.log(`- Insertions: ${stats.insertions}`)
      console.log(`- Deletions: ${stats.deletions}`)
      console.log(`- Notes: ${options.notesFile}`)
    }
    catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
    finally {
      // Stop OpenCode server
      if (opencodeClient) {
        console.log('\nStopping OpenCode server...')
        await opencodeClient.stopServer()
      }
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
