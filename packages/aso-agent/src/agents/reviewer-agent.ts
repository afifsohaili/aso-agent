import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, ReviewOutput } from '../types/index.js'

export class ReviewerAgent extends BaseAgent {
  readonly name = 'reviewer' as const
  private agentLogger = createLogger('agent:reviewer')

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('ReviewerAgent starting...')

    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')
    const lastImplement = context.notes.cycles
      .filter(c => c.phase === 'implement')
      .pop()

    this.agentLogger.debug('Current phase:', currentPhase?.title || 'Unknown')
    this.agentLogger.debug('Last implement cycle:', lastImplement?.cycle || 'none')
    this.agentLogger.debug('Test results:', lastImplement?.test_results
      ? `passed=${lastImplement.test_results.passed}`
      : 'none')

    const prompt = this.buildContextPrompt(context, `
You are the Reviewer Agent. Your job is to review the implementation and act as a CI system.

Current Phase: ${currentPhase?.title || 'Unknown'}

Implementation Summary:
${lastImplement?.summary || 'No implementation summary'}

Files Changed:
${lastImplement?.output && 'files_changed' in lastImplement.output ? (lastImplement.output as any).files_changed.map((f: any) => `- ${f.path}: ${f.description}`).join('\n') : 'No files changed'}

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

    this.agentLogger.debug('Built prompt, length:', prompt.length)

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

    this.agentLogger.debug('Sending prompt to OpenCode...')
    const output = await this.session.promptWithSchema<ReviewOutput>(prompt, schema)
    this.agentLogger.debug('Received response')
    this.agentLogger.debug('Review passed:', output.review_passed)
    this.agentLogger.debug('Findings:', output.findings.length)

    if (!output.review_passed) {
      this.agentLogger.warn('Review FAILED!')
      this.agentLogger.debug('Findings:', output.findings.join('; '))
    }

    this.agentLogger.success('ReviewerAgent complete, review_passed=', output.review_passed)
    return {
      success: output.review_passed,
      output,
      summary: output.review_passed
        ? 'Review passed'
        : `Review failed: ${output.findings.join(', ')}`,
    }
  }
}
