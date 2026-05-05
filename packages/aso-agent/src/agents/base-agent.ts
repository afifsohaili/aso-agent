import type { Agent, AgentContext, AgentResult, AgentType } from '../types/index.js'
import type { OpenCodeSession } from '../services/opencode-client.js'
import { createLogger } from '../core/logger.js'

export interface BaseAgentOptions {
  session: OpenCodeSession
}

export abstract class BaseAgent implements Agent {
  abstract readonly name: AgentType

  protected session: OpenCodeSession
  protected logger = createLogger('agent')

  constructor(options: BaseAgentOptions) {
    this.session = options.session
    this.logger.debug('Agent initialized:', this.name)
  }

  abstract run(context: AgentContext, prompt: string): Promise<AgentResult>

  /**
   * Build a prompt that includes context from notes.yaml.
   */
  protected buildContextPrompt(context: AgentContext, taskPrompt: string): string {
    this.logger.debug('Building context prompt...')
    this.logger.debug('Current cycle:', context.currentCycle)
    this.logger.debug('Agent:', this.name)

    const { notes, currentCycle, notesFilePath } = context

    let prompt = `# Task\n${taskPrompt}\n\n`

    // Add session info
    prompt += `# Session Info\n`
    prompt += `- Objective: ${notes.session.objective}\n`
    prompt += `- Stop When: ${notes.session.stop_when}\n`
    prompt += `- Current Cycle: ${currentCycle}\n`
    prompt += `- Branch: ${notes.session.branch}\n\n`

    this.logger.debug('Session info added to prompt')

    // Reference the notes file instead of inlining content
    prompt += `# Session History\n`
    prompt += `Read the full session history, roadmap, and recent activity from:\n`
    prompt += `@${notesFilePath}\n\n`
    prompt += `This file contains the complete state of the session including:\n`
    prompt += `- Current roadmap phases and their status\n`
    prompt += `- All completed cycles with their outputs\n`
    prompt += `- Test results and findings from previous agents\n\n`

    this.logger.debug('Notes file referenced:', notesFilePath)

    this.logger.debug('Context prompt built, length:', prompt.length, 'characters')
    return prompt
  }
}
