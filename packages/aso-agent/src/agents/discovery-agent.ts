import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, DiscoveryOutput } from '../types/index.js'

export class DiscoveryAgent extends BaseAgent {
  readonly name = 'discovery' as const
  private agentLogger = createLogger('agent:discovery')

  protected getPromptVariables(_context: AgentContext): Record<string, string> {
    // Discovery has no dynamic variables
    return {}
  }

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('DiscoveryAgent starting...')
    this.agentLogger.debug('Cycle:', context.currentCycle)
    this.agentLogger.debug('Roadmap phases:', context.notes.roadmap.length)

    const prompt = this.buildContextPrompt(context)
    this.agentLogger.debug('Built prompt, length:', prompt.length)

    const schema = {
      type: 'object',
      properties: {
        type: { const: 'discovery' },
        roadmap: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              title: { type: 'string' },
              description: { type: 'string' },
              status: { enum: ['pending', 'in_progress', 'completed', 'skipped'] },
            },
            required: ['id', 'title', 'description', 'status'],
          },
        },
        rationale: { type: 'string' },
      },
      required: ['type', 'roadmap', 'rationale'],
    }

    this.agentLogger.debug('Sending prompt to OpenCode with schema...')
    const output = await this.session.promptWithSchema<DiscoveryOutput>(prompt, schema)
    this.agentLogger.debug('Received response from OpenCode')

    // Defensive: validate output structure
    if (!output.roadmap || !Array.isArray(output.roadmap)) {
      throw new Error(`DiscoveryAgent: AI response missing 'roadmap' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.rationale) {
      throw new Error(`DiscoveryAgent: AI response missing 'rationale'. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }

    this.agentLogger.debug('Roadmap phases:', output.roadmap.length)
    this.agentLogger.debug('Rationale length:', output.rationale.length)

    this.agentLogger.success('DiscoveryAgent complete,', output.roadmap.length, 'phases planned')
    return {
      success: true,
      output,
      summary: output.rationale,
    }
  }
}
