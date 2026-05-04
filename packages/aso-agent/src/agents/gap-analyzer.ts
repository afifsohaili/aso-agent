import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, GapOutput } from '../types/index.js'

export class GapAnalyzerAgent extends BaseAgent {
  readonly name = 'gap-analyzer' as const
  private agentLogger = createLogger('agent:gap')

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

    const prompt = this.buildContextPrompt(context, `
You are the Gap Analyzer Agent. Your job is to identify missing pieces, incomplete work, or areas that need improvement.

Current Phase: ${currentPhase?.title || 'Unknown'}

Implementation Summary:
${lastImplement?.summary || 'No implementation summary'}

Review Findings:
${lastReview?.output && 'findings' in lastReview.output ? (lastReview.output as any).findings.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n') : 'No findings'}

Look for:
1. Missing tests or insufficient test coverage
2. Incomplete implementations
3. Edge cases not handled
4. Documentation missing
5. Error handling gaps
6. Performance issues
7. Security concerns

If everything is complete and satisfactory, return an empty gaps list.
`)

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
