import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, StopCheckOutput } from '../types/index.js'

export class StopCheckAgent extends BaseAgent {
  readonly name = 'stop-check' as const
  private agentLogger = createLogger('agent:stop-check')

  protected getPromptVariables(context: AgentContext): Record<string, string> {
    return {
      stop_when: context.notes.session.stop_when,
    }
  }

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('StopCheckAgent starting...')
    this.agentLogger.debug('Cycle:', context.currentCycle)
    this.agentLogger.debug('Stop when:', context.notes.session.stop_when)
    this.agentLogger.debug('Total cycles:', context.notes.cycles.length)

    const prompt = this.buildContextPrompt(context)
    this.agentLogger.debug('Built prompt, length:', prompt.length)

    const schema = {
      type: 'object',
      properties: {
        type: { const: 'stop-check' },
        should_stop: { type: 'boolean' },
        reason: { type: 'string' },
      },
      required: ['type', 'should_stop', 'reason'],
    }

    this.agentLogger.debug('Sending prompt to OpenCode...')
    const output = await this.session.promptWithSchema<StopCheckOutput>(prompt, schema)

    // Defensive: validate output structure
    if (typeof output.should_stop !== 'boolean') {
      throw new Error(`StopCheckAgent: AI response missing 'should_stop' boolean. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.reason) {
      throw new Error(`StopCheckAgent: AI response missing 'reason'. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }

    this.agentLogger.debug('Received response')
    this.agentLogger.debug('Should stop:', output.should_stop)
    this.agentLogger.debug('Reason:', output.reason)

    if (output.should_stop) {
      this.agentLogger.ready('STOP condition met:', output.reason)
    }
    else {
      this.agentLogger.info('CONTINUE:', output.reason)
    }

    return {
      success: !output.should_stop,
      output,
      summary: output.should_stop
        ? `STOP: ${output.reason}`
        : `CONTINUE: ${output.reason}`,
    }
  }
}
