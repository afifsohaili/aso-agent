import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, StopCheckOutput } from '../types/index.js'

export class StopCheckAgent extends BaseAgent {
  readonly name = 'stop-check' as const
  private agentLogger = createLogger('agent:stop-check')

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('StopCheckAgent starting...')
    this.agentLogger.debug('Cycle:', context.currentCycle)
    this.agentLogger.debug('Stop when:', context.notes.session.stop_when)
    this.agentLogger.debug('Total cycles:', context.notes.cycles.length)

    const prompt = this.buildContextPrompt(context, `
You are the Stop Condition Evaluator. Your job is to determine if the stop condition has been met.

Stop Condition: ${context.notes.session.stop_when}

Review the entire session history and current state:
- What was the original objective?
- What has been accomplished so far?
- What remains to be done?
- Does the current state satisfy the stop condition?

Be conservative: only return should_stop=true if the condition is clearly met.
If in doubt, return should_stop=false and explain why.
`)

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
