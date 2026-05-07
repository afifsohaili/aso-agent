import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
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
      test_command: context.notes.session.test_command || 'npm test',
    }
  }

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('ImplementerAgent starting...')
    this.agentLogger.debug('Current step:', context.currentStep)
    this.agentLogger.debug('Total entries so far:', context.notes.entries.length)

    const prompt = this.buildContextPrompt(context)
    this.agentLogger.debug('Built prompt, length:', prompt.length)

    const schema = {
      type: 'object',
      properties: {
        type: { const: 'implement' },
        summary: { type: 'string' },
        files_changed: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['path', 'description'],
          },
        },
        tests_passed: { type: 'boolean' },
      },
      required: ['type', 'summary', 'files_changed', 'tests_passed'],
    }

    this.agentLogger.debug('Sending prompt to OpenCode...')
    const output = await this.session.promptWithSchema<ImplementOutput>(prompt, schema)

    // Defensive: validate output structure
    if (!output.summary) {
      throw new Error(`ImplementerAgent: AI response missing 'summary'. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.files_changed || !Array.isArray(output.files_changed)) {
      throw new Error(`ImplementerAgent: AI response missing 'files_changed' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (typeof output.tests_passed !== 'boolean') {
      throw new Error(`ImplementerAgent: AI response missing 'tests_passed' boolean. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }

    this.agentLogger.debug('Received response')
    this.agentLogger.debug('Summary:', output.summary)
    this.agentLogger.debug('Files changed:', output.files_changed.length)
    this.agentLogger.debug('Tests passed:', output.tests_passed)

    if (!output.tests_passed) {
      this.agentLogger.warn('Tests did not pass!')
    }

    this.agentLogger.success('ImplementerAgent complete, tests_passed=', output.tests_passed)
    return {
      success: output.tests_passed,
      output,
      summary: output.summary,
    }
  }
}
