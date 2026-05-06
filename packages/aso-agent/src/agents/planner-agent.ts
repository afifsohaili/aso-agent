import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, PlanOutput } from '../types/index.js'

export class PlannerAgent extends BaseAgent {
  readonly name = 'planner' as const
  private agentLogger = createLogger('agent:planner')

  protected getPromptVariables(context: AgentContext): Record<string, string> {
    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')
    return {
      phase_title: currentPhase?.title || 'Unknown',
      phase_description: currentPhase?.description || 'No description',
    }
  }

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('PlannerAgent starting...')

    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')
    this.agentLogger.debug('Current roadmap phase:', currentPhase?.title || 'Unknown')
    this.agentLogger.debug('Phase description:', currentPhase?.description || 'No description')

    const prompt = this.buildContextPrompt(context)
    this.agentLogger.debug('Built prompt, length:', prompt.length)

    const schema = {
      type: 'object',
      properties: {
        type: { const: 'plan' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              description: { type: 'string' },
              status: { const: 'not_started' },
            },
            required: ['id', 'description', 'status'],
          },
        },
        approach: { type: 'string' },
      },
      required: ['type', 'tasks', 'approach'],
    }

    this.agentLogger.debug('Sending prompt to OpenCode...')
    const output = await this.session.promptWithSchema<PlanOutput>(prompt, schema)

    // Defensive: validate output structure
    if (!output.tasks || !Array.isArray(output.tasks)) {
      throw new Error(`PlannerAgent: AI response missing 'tasks' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.approach) {
      throw new Error(`PlannerAgent: AI response missing 'approach'. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }

    this.agentLogger.debug('Received response, tasks:', output.tasks.length)
    this.agentLogger.debug('Tasks:', output.tasks.map(t => t.description).join(', '))

    this.agentLogger.success('PlannerAgent complete,', output.tasks.length, 'tasks planned')
    return {
      success: true,
      output,
      summary: `Planned ${output.tasks.length} tasks: ${output.tasks.map(t => t.description).join(', ')}`,
    }
  }
}
