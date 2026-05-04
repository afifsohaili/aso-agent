import { BaseAgent } from './base-agent.js'
import type { AgentContext, AgentResult, ImplementOutput } from '../types/index.js'

export class ImplementerAgent extends BaseAgent {
  readonly name = 'implementer' as const

  async run(context: AgentContext): Promise<AgentResult> {
    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')
    const lastPlan = context.notes.cycles
      .filter(c => c.phase === 'plan')
      .pop()

    const prompt = this.buildContextPrompt(context, `
You are the Implementer Agent. Your job is to execute the implementation plan for the current phase.

Current Phase: ${currentPhase?.title || 'Unknown'}
Phase Description: ${currentPhase?.description || 'No description'}

Implementation Plan:
${lastPlan?.output && 'tasks' in lastPlan.output ? lastPlan.output.tasks.map((t, i) => `${i + 1}. ${t}`).join('\n') : 'No plan available'}

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

    const output = await this.session.promptWithSchema<ImplementOutput>(prompt, schema)

    return {
      success: output.tests_passed,
      output,
      summary: output.summary,
    }
  }
}
