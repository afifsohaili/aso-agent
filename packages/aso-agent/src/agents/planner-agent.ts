import { BaseAgent } from './base-agent.js'
import type { AgentContext, AgentResult, PlanOutput } from '../types/index.js'

export class PlannerAgent extends BaseAgent {
  readonly name = 'planner' as const

  async run(context: AgentContext): Promise<AgentResult> {
    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')

    const prompt = this.buildContextPrompt(context, `
You are the Planner Agent. Your job is to create a detailed implementation plan for the current phase.

Current Phase: ${currentPhase?.title || 'Unknown'}
Phase Description: ${currentPhase?.description || 'No description'}

Create a step-by-step plan that includes:
1. Specific tasks to implement
2. Files to create or modify
3. Tests to write (following TDD - test first, then implementation)
4. Dependencies or prerequisites

The plan should be detailed enough for an Implementer Agent to execute without ambiguity.
`)

    const schema = {
      type: 'object',
      properties: {
        type: { const: 'plan' },
        tasks: {
          type: 'array',
          items: { type: 'string' },
        },
        approach: { type: 'string' },
      },
      required: ['type', 'tasks', 'approach'],
    }

    const output = await this.session.promptWithSchema<PlanOutput>(prompt, schema)

    return {
      success: true,
      output,
      summary: `Planned ${output.tasks.length} tasks: ${output.tasks.join(', ')}`,
    }
  }
}
