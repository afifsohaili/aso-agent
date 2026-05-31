import type { Agent, AgentContext, AgentResult, AgentType } from '../types/index.js'
import type { OpenCodeSession } from '../services/opencode-client.js'
import { createLogger } from '../core/logger.js'
import { PromptLoader } from '../core/prompt-loader.js'

export interface BaseAgentOptions {
  session: OpenCodeSession
}

export abstract class BaseAgent implements Agent {
  abstract readonly name: AgentType

  protected session: OpenCodeSession
  protected logger = createLogger('agent')

  constructor(options: BaseAgentOptions) {
    this.session = options.session
    this.logger.debug('Agent initialized')
  }

  abstract run(context: AgentContext): Promise<AgentResult>

  /**
   * Each agent provides the variables to substitute into its prompt template.
   */
  protected abstract getPromptVariables(context: AgentContext): Record<string, string>

  /**
   * Build a full prompt by loading the agent's template, substituting variables,
   * and appending session context from notes.yaml.
   */
  protected buildContextPrompt(context: AgentContext): string {
    this.logger.debug('Building context prompt...')
    this.logger.debug('Current step:', context.currentStep)
    this.logger.debug('Agent:', this.name)

    const loader = new PromptLoader(context.workingDir)
    const variables = this.getPromptVariables(context)
    const result = loader.load(this.name, variables)

    this.logger.debug(`Prompt loaded from ${result.source}: ${result.path}`)

    const { notes, currentStep, notesFilePath } = context

    let prompt = `# Task\n${result.content}\n\n`

    // Add session info
    prompt += `# Session Info\n`
    for (const obj of notes.session.objectives) {
      prompt += `- Objective: ${obj}\n`
    }
    prompt += `- Stop When: ${notes.session.stop_when}\n`
    prompt += `- Current Step: ${currentStep}\n`
    prompt += `- Branch: ${notes.session.branch}\n\n`

    this.logger.debug('Session info added to prompt')

    // Reference the notes file instead of inlining content
    prompt += `# Session History\n`
    prompt += `Read the full session history and previous work from:\n`
    prompt += `@${notesFilePath}\n\n`
    prompt += `This file contains the complete state of the session including:\n`
    prompt += `- All completed work entries with summaries\n`
    prompt += `- Files changed in each step\n`
    prompt += `- Test results from previous steps\n\n`

    this.logger.debug('Notes file referenced:', notesFilePath)
    this.logger.debug('Context prompt built, length:', prompt.length, 'characters')
    return prompt
  }
}
