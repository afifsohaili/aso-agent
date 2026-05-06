import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, ImplementOutput } from '../types/index.js'

export class ImplementerAgent extends BaseAgent {
  readonly name = 'implementer' as const
  private agentLogger = createLogger('agent:implementer')

  protected getPromptVariables(context: AgentContext): Record<string, string> {
    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')
    const lastPlan = context.notes.cycles
      .filter(c => c.phase === 'plan')
      .pop()

    return {
      phase_title: currentPhase?.title || 'Unknown',
      phase_description: currentPhase?.description || 'No description',
      plan_tasks: lastPlan?.output && 'tasks' in lastPlan.output
        ? (lastPlan.output as any).tasks.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')
        : 'No plan available',
      test_command: context.notes.session.test_command,
    }
  }

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('ImplementerAgent starting...')

    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')
    const lastPlan = context.notes.cycles
      .filter(c => c.phase === 'plan')
      .pop()

    this.agentLogger.debug('Current phase:', currentPhase?.title || 'Unknown')
    this.agentLogger.debug('Last plan cycle:', lastPlan?.cycle || 'none')
    this.agentLogger.debug('Plan tasks:', lastPlan?.output && 'tasks' in lastPlan.output
      ? (lastPlan.output as any).tasks.length
      : 0)

    const prompt = this.buildContextPrompt(context)
    this.agentLogger.debug('Built prompt, length:', prompt.length)

    const schema = {
      type: 'object',
      properties: {
        type: { const: 'implement' },
        tests_passed: { type: 'boolean' },
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
        summary: { type: 'string' },
      },
      required: ['type', 'tests_passed', 'files_changed', 'summary'],
    }

    this.agentLogger.debug('Sending prompt to OpenCode...')
    const output = await this.session.promptWithSchema<ImplementOutput>(prompt, schema)

    // Defensive: validate output structure
    if (typeof output.tests_passed !== 'boolean') {
      throw new Error(`ImplementerAgent: AI response missing 'tests_passed' boolean. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.files_changed || !Array.isArray(output.files_changed)) {
      throw new Error(`ImplementerAgent: AI response missing 'files_changed' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.summary) {
      throw new Error(`ImplementerAgent: AI response missing 'summary'. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }

    this.agentLogger.debug('Received response')
    this.agentLogger.debug('Tests passed:', output.tests_passed)
    this.agentLogger.debug('Files changed:', output.files_changed.length)

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
