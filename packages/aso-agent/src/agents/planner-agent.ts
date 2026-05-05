import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, PlannerOutput } from '../types/index.js'

export class PlannerAgent extends BaseAgent {
  readonly name = 'planner' as const
  private agentLogger = createLogger('agent:planner')

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('PlannerAgent starting...')

    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')
    this.agentLogger.debug('Current roadmap phase:', currentPhase?.title || 'Unknown')
    this.agentLogger.debug('Phase description:', currentPhase?.description || 'No description')

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

    this.agentLogger.debug('Built prompt, length:', prompt.length)

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

    this.agentLogger.debug('Sending prompt to OpenCode...')
    const output = await this.session.promptWithSchema<PlannerOutput>(prompt, schema)

    // Defensive: validate output structure
    if (!output.tasks || !Array.isArray(output.tasks)) {
      throw new Error(`PlannerAgent: AI response missing 'tasks' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.approach) {
      throw new Error(`PlannerAgent: AI response missing 'approach'. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }

    this.agentLogger.debug('Received response, tasks:', output.tasks.length)
    this.agentLogger.debug('Tasks:', output.tasks.join(', '))

    this.agentLogger.success('PlannerAgent complete,', output.tasks.length, 'tasks planned')
    return {
      success: true,
      output,
      summary: `Planned ${output.tasks.length} tasks: ${output.tasks.join(', ')}`,
    }
  }
}
