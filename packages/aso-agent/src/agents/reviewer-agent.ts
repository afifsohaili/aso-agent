import { BaseAgent } from './base-agent.js'
import type { AgentContext, AgentResult, ReviewOutput } from '../types/index.js'

export class ReviewerAgent extends BaseAgent {
  readonly name = 'reviewer' as const

  async run(context: AgentContext): Promise<AgentResult> {
    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')
    const lastImplement = context.notes.cycles
      .filter(c => c.phase === 'implement')
      .pop()

    const prompt = this.buildContextPrompt(context, `
You are the Reviewer Agent. Your job is to review the implementation and act as a CI system.

Current Phase: ${currentPhase?.title || 'Unknown'}

Implementation Summary:
${lastImplement?.summary || 'No implementation summary'}

Files Changed:
${lastImplement?.output && 'files_changed' in lastImplement.output ? lastImplement.output.files_changed.map(f => `- ${f.path}: ${f.description}`).join('\n') : 'No files changed'}

Test Results:
${lastImplement?.test_results ? `Passed: ${lastImplement.test_results.passed}\nOutput: ${lastImplement.test_results.output}` : 'No test results'}

Review Criteria:
1. All tests must pass (including pre-existing tests)
2. Code follows project style and conventions
3. No security issues introduced
4. Architecture is sound
5. No unnecessary refactoring
6. Implementation satisfies the plan

Be thorough. If tests failed or the implementation is incomplete, list specific issues.
`)

    const schema = {
      type: 'object',
      properties: {
        type: { const: 'review' },
        review_passed: { type: 'boolean' },
        findings: {
          type: 'array',
          items: { type: 'string' },
        },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['type', 'review_passed', 'findings', 'suggestions'],
    }

    const output = await this.session.promptWithSchema<ReviewOutput>(prompt, schema)

    return {
      success: output.review_passed,
      output,
      summary: output.review_passed
        ? 'Review passed'
        : `Review failed: ${output.findings.join(', ')}`,
    }
  }
}
