import { BaseAgent } from './base-agent.js'
import type { AgentContext, AgentResult, ResearchOutput } from '../types/index.js'

export class ResearcherAgent extends BaseAgent {
  readonly name = 'researcher' as const

  async run(context: AgentContext): Promise<AgentResult> {
    const lastGap = context.notes.cycles
      .filter(c => c.phase === 'gap')
      .pop()

    const prompt = this.buildContextPrompt(context, `
You are the Researcher Agent. Your job is to find information needed to address gaps.

Gaps to Research:
${lastGap?.output && 'gaps' in lastGap.output ? lastGap.output.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n') : 'No gaps to research'}

Use available MCP tools (web search, browser) to:
1. Search for relevant documentation
2. Look up best practices
3. Find examples or tutorials
4. Verify API usage

For each finding, note the source URL or reference.
If no research is needed (gaps are clear and actionable), state that.
`)

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

    const output = await this.session.promptWithSchema<ResearchOutput>(prompt, schema)

    return {
      success: true,
      output,
      summary: `Found ${output.findings.length} findings from ${output.sources.length} sources`,
    }
  }
}
