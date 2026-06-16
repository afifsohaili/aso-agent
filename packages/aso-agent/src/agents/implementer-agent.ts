import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import { readLastEntry } from '../core/report-commands.js'
import type { AgentContext, AgentResult, ImplementOutput } from '../types/index.js'

export class ImplementerAgent extends BaseAgent {
  readonly name = 'implementer' as const
  private agentLogger = createLogger('agent:implementer')

  protected getPromptVariables(context: AgentContext): Record<string, string> {
    const previousEntries = context.notes.entries
      .map(e => `Step ${e.step}: ${e.summary} (tests: ${e.tests_passed ? 'passed' : 'failed'})`)
      .join('\n') || 'No previous work done yet.'

    return {
      previous_entries: previousEntries,
      objectives: context.notes.session.objectives.join('\n- '),
    }
  }

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('ImplementerAgent starting...')
    this.agentLogger.debug('Current step:', context.currentStep)
    this.agentLogger.debug('Total entries so far:', context.notes.entries.length)

    const prompt = this.buildContextPrompt(context)
    this.agentLogger.debug('Built prompt, length:', prompt.length)

    this.agentLogger.debug('Sending prompt to OpenCode...')
    await this.session.prompt(prompt)

    // The agent is expected to have reported its result by running
    // `aso-agent report-step` via the bash tool.
    const entry = readLastEntry(context.notesFilePath)
    if (!entry) {
      throw new Error('ImplementerAgent: No implementer entry reported. The agent must run `aso-agent report-step`.')
    }

    this.agentLogger.debug('Received response')
    this.agentLogger.debug('Summary:', entry.summary)
    this.agentLogger.debug('Files changed:', entry.files_changed.length)
    this.agentLogger.debug('Tests passed:', entry.tests_passed)

    if (!entry.tests_passed) {
      this.agentLogger.warn('Tests did not pass!')
    }

    const output: ImplementOutput = {
      type: 'implement',
      summary: entry.summary,
      files_changed: entry.files_changed,
      tests_passed: entry.tests_passed,
    }

    this.agentLogger.success('ImplementerAgent complete, tests_passed=', entry.tests_passed)
    return {
      success: entry.tests_passed,
      output,
      summary: entry.summary,
    }
  }
}
