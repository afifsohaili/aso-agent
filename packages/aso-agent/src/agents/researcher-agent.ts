import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, ResearchOutput } from '../types/index.js'

export class ResearcherAgent extends BaseAgent {
  readonly name = 'researcher' as const
  private agentLogger = createLogger('agent:researcher')

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('ResearcherAgent starting...')

    const lastGap = context.notes.cycles
      .filter(c => c.phase === 'gap')
      .pop()

    this.agentLogger.debug('Last gap cycle:', lastGap?.cycle || 'none')

    if (!lastGap || !lastGap.output || !('gaps' in lastGap.output) || !(lastGap.output as any).gaps.length) {
      this.agentLogger.info('No gaps to research, skipping')
      return {
        success: true,
        output: { type: 'research', findings: [], sources: [] },
        summary: 'No gaps to research',
      }
    }

    const gaps = (lastGap.output as any).gaps as string[]
    this.agentLogger.debug('Gaps to research:', gaps.length)
    gaps.forEach((gap, i) => {
      this.agentLogger.debug(`  Gap ${i + 1}:`, gap)
    })

    const prompt = this.buildContextPrompt(context, `
You are the Researcher Agent. Your job is to find information needed to address gaps.

Gaps to Research:
${gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Use available MCP tools (web search, browser) to:
1. Search for relevant documentation
2. Look up best practices
3. Find examples or tutorials
4. Verify API usage

For each finding, note the source URL or reference.
If no research is needed (gaps are clear and actionable), state that.
`)

    this.agentLogger.debug('Built prompt, length:', prompt.length)

    const schema = {
      type: 'object',
      properties: {
        type: { const: 'research' },
        findings: {
          type: 'array',
          items: { type: 'string' },
        },
        sources: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['type', 'findings', 'sources'],
    }

    this.agentLogger.debug('Sending prompt to OpenCode...')
    const output = await this.session.promptWithSchema<ResearchOutput>(prompt, schema)

    // Defensive: validate output structure
    if (!output.findings || !Array.isArray(output.findings)) {
      throw new Error(`ResearcherAgent: AI response missing 'findings' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.sources || !Array.isArray(output.sources)) {
      throw new Error(`ResearcherAgent: AI response missing 'sources' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }

    this.agentLogger.debug('Received response')
    this.agentLogger.debug('Findings:', output.findings.length)
    this.agentLogger.debug('Sources:', output.sources.length)

    output.findings.forEach((finding, i) => {
      this.agentLogger.debug(`  Finding ${i + 1}:`, finding)
    })

    this.agentLogger.success('ResearcherAgent complete,', output.findings.length, 'findings')
    return {
      success: true,
      output,
      summary: `Found ${output.findings.length} findings from ${output.sources.length} sources`,
    }
  }
}
