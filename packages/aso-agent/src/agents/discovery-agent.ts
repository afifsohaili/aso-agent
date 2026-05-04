import { BaseAgent } from './base-agent.js'
import type { AgentContext, AgentResult, DiscoveryOutput } from '../types/index.js'

export class DiscoveryAgent extends BaseAgent {
  readonly name = 'discovery' as const

  async run(context: AgentContext): Promise<AgentResult> {
    const prompt = this.buildContextPrompt(context, `
You are the Discovery Agent. Your job is to analyze the objective and stop condition, then create a roadmap of phases to achieve the goal.

Analyze the current state of the project by exploring the codebase. Look at:
- The project structure and tech stack
- Existing files and their purposes
- Test setup and configuration
- Any documentation (README, AGENTS.md, etc.)

Then create a detailed roadmap with phases. Each phase should be small and achievable. Consider:
- Dependencies between phases
- Testing requirements for each phase
- Potential risks or blockers

Output a structured roadmap with phases. If this is a re-evaluation, review the current roadmap and adjust based on what was learned during implementation.
`)

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

    const output = await this.session.promptWithSchema<DiscoveryOutput>(prompt, schema)

    return {
      success: true,
      output,
      summary: output.rationale,
    }
  }
}
