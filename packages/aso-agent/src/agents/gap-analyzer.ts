import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, GapOutput } from '../types/index.js'

export class GapAnalyzerAgent extends BaseAgent {
  readonly name = 'gap-analyzer' as const
  private agentLogger = createLogger('agent:gap')

  protected getPromptVariables(context: AgentContext): Record<string, string> {
    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')
    const lastImplement = context.notes.cycles
      .filter(c => c.phase === 'implement')
      .pop()
    const lastReview = context.notes.cycles
      .filter(c => c.phase === 'review')
      .pop()

    const reviewFindings = lastReview?.output && 'findings' in lastReview.output
      ? (lastReview.output as any).findings.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')
      : 'No findings'

    return {
      phase_title: currentPhase?.title || 'Unknown',
      implementation_summary: lastImplement?.summary || 'No implementation summary',
      review_findings: reviewFindings,
    }
  }

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('GapAnalyzerAgent starting...')

    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')
    const lastImplement = context.notes.cycles
      .filter(c => c.phase === 'implement')
      .pop()
    const lastReview = context.notes.cycles
      .filter(c => c.phase === 'review')
      .pop()

    this.agentLogger.debug('Current phase:', currentPhase?.title || 'Unknown')
    this.agentLogger.debug('Last implement cycle:', lastImplement?.cycle || 'none')
    this.agentLogger.debug('Last review cycle:', lastReview?.cycle || 'none')

    const prompt = this.buildContextPrompt(context)
    this.agentLogger.debug('Built prompt, length:', prompt.length)

    const schema = {
      type: 'object',
      properties: {
        type: { const: 'gap' },
        gaps: {
          type: 'array',
          items: { type: 'string' },
        },
        priority: { enum: ['high', 'medium', 'low'] },
      },
      required: ['type', 'gaps', 'priority'],
    }

    this.agentLogger.debug('Sending prompt to OpenCode...')
    const output = await this.session.promptWithSchema<GapOutput>(prompt, schema)

    // Defensive: validate output structure
    if (!output.gaps || !Array.isArray(output.gaps)) {
      throw new Error(`GapAnalyzer: AI response missing 'gaps' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.priority) {
      throw new Error(`GapAnalyzer: AI response missing 'priority'. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }

    this.agentLogger.debug('Received response')
    this.agentLogger.debug('Gaps found:', output.gaps.length)
    this.agentLogger.debug('Priority:', output.priority)

    if (output.gaps.length > 0) {
      this.agentLogger.warn('Found', output.gaps.length, 'gaps (', output.priority, 'priority)')
      output.gaps.forEach((gap, i) => {
        this.agentLogger.debug(`  Gap ${i + 1}:`, gap)
      })
    }
    else {
      this.agentLogger.success('No gaps found')
    }

    return {
      success: output.gaps.length === 0,
      output,
      summary: output.gaps.length === 0
        ? 'No gaps found'
        : `Found ${output.gaps.length} gaps (${output.priority} priority)`,
    }
  }
}
