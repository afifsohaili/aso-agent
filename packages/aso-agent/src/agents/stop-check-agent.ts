import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import { readStopCheck } from '../core/report-commands.js'
import type { AgentContext, AgentResult, StopCheckOutput } from '../types/index.js'

export class StopCheckAgent extends BaseAgent {
  readonly name = 'stop-check' as const
  private agentLogger = createLogger('agent:stop-check')

  protected getPromptVariables(context: AgentContext): Record<string, string> {
    const previousEntries = context.notes.entries
      .map(e => `Step ${e.step}: ${e.summary} (tests: ${e.tests_passed ? 'passed' : 'failed'})`)
      .join('\n') || 'No work done yet.'

    return {
      stop_when: context.notes.session.stop_when,
      previous_entries: previousEntries,
      objectives: context.notes.session.objectives.join('\n- '),
      git_log: context.gitLog || 'No git log available.',
    }
  }

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('StopCheckAgent starting...')
    this.agentLogger.debug('Step:', context.currentStep)
    this.agentLogger.debug('Stop when:', context.notes.session.stop_when)
    this.agentLogger.debug('Total entries:', context.notes.entries.length)

    const prompt = this.buildContextPrompt(context)
    this.agentLogger.debug('Built prompt, length:', prompt.length)

    this.agentLogger.debug('Sending prompt to OpenCode...')
    await this.session.prompt(prompt)

    // The agent is expected to have reported its result by running
    // `aso-agent stop-check` via the bash tool.
    const output = readStopCheck(context.stateDir)
    if (!output) {
      throw new Error('StopCheckAgent: No stop-check result reported. The agent must run `aso-agent stop-check`.')
    }

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
