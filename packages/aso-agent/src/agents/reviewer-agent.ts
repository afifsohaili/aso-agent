import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, ReviewOutput } from '../types/index.js'

export class ReviewerAgent extends BaseAgent {
  readonly name = 'reviewer' as const
  private agentLogger = createLogger('agent:reviewer')

  protected getPromptVariables(context: AgentContext): Record<string, string> {
    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')
    const lastImplement = context.notes.cycles
      .filter(c => c.phase === 'implement')
      .pop()

    const filesChanged = lastImplement?.output && 'files_changed' in lastImplement.output
      ? (lastImplement.output as any).files_changed.map((f: any) => `- ${f.path}: ${f.description}`).join('\n')
      : 'No files changed'

    const testResults = lastImplement?.test_results
      ? `Passed: ${lastImplement.test_results.passed}\nOutput: ${lastImplement.test_results.output}`
      : 'No test results'

    const taskId = lastImplement?.output && 'task_id' in lastImplement.output
      ? String((lastImplement.output as any).task_id)
      : 'unknown'

    const taskDescription = context.notes.tasks.find(t => t.id === Number(taskId))?.description || 'Unknown task'

    return {
      phase_title: currentPhase?.title || 'Unknown',
      task_id: taskId,
      task_description: taskDescription,
      implementation_summary: lastImplement?.summary || 'No implementation summary',
      files_changed: filesChanged,
      test_results: testResults,
    }
  }

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('ReviewerAgent starting...')

    const lastImplement = context.notes.cycles
      .filter(c => c.phase === 'implement')
      .pop()

    this.agentLogger.debug('Last implement cycle:', lastImplement?.cycle || 'none')
    this.agentLogger.debug('Test results:', lastImplement?.test_results
      ? `passed=${lastImplement.test_results.passed}`
      : 'none')

    const prompt = this.buildContextPrompt(context)
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

    // Defensive: validate output structure
    if (typeof output.review_passed !== 'boolean') {
      throw new Error(`ReviewerAgent: AI response missing 'review_passed' boolean. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.findings || !Array.isArray(output.findings)) {
      throw new Error(`ReviewerAgent: AI response missing 'findings' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.suggestions || !Array.isArray(output.suggestions)) {
      throw new Error(`ReviewerAgent: AI response missing 'suggestions' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }

    this.agentLogger.debug('Received response')
    this.agentLogger.debug('Review passed:', output.review_passed)
    this.agentLogger.debug('Findings:', output.findings.length)

    // Defensive: override AI if tests actually failed
    const testsActuallyPassed = lastImplement?.test_results?.passed ?? true
    if (!testsActuallyPassed && output.review_passed) {
      this.agentLogger.warn('AI said review passed but tests failed! Overriding to fail.')
      output.review_passed = false
      if (!output.findings.includes('Tests failed')) {
        output.findings.push('Tests failed - the test suite did not pass')
      }
    }

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
