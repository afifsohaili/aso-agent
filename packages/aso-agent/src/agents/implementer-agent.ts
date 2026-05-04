import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, ImplementOutput } from '../types/index.js'

export class ImplementerAgent extends BaseAgent {
  readonly name = 'implementer' as const
  private agentLogger = createLogger('agent:implementer')

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

    const prompt = this.buildContextPrompt(context, `
You are the Implementer Agent. Your job is to execute the implementation plan for the current phase.

Current Phase: ${currentPhase?.title || 'Unknown'}
Phase Description: ${currentPhase?.description || 'No description'}

Implementation Plan:
${lastPlan?.output && 'tasks' in lastPlan.output ? (lastPlan.output as any).tasks.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n') : 'No plan available'}

IMPORTANT - Test-Driven Development (TDD) is MANDATORY:
1. First, write tests for the feature you're implementing
2. Run the tests to confirm they fail (red)
3. Implement the feature code
4. Run the tests again to confirm they pass (green)
5. Run ALL tests (not just the new ones) to ensure you haven't broken existing functionality

Use Chrome DevTools MCP if needed to verify web/UI changes.
Use the test command: ${context.notes.session.test_command}

After implementation, report:
- Whether all tests passed
- Files that were changed
- Summary of what was implemented
`)

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
