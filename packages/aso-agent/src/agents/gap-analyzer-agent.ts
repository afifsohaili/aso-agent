import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import { readGapReport } from '../core/report-commands.js'
import type { AgentContext, AgentResult, GapAnalyzerOutput } from '../types/index.js'

export class GapAnalyzerAgent extends BaseAgent {
  readonly name = 'gap-analyzer' as const
  private agentLogger = createLogger('agent:gap-analyzer')

  protected getPromptVariables(context: AgentContext): Record<string, string> {
    const previousEntries = context.notes.entries
      .map(e => `Step ${e.step}: ${e.summary} (tests: ${e.tests_passed ? 'passed' : 'failed'})`)
      .join('\n') || 'No work done yet.'

    return {
      previous_entries: previousEntries,
      original_objectives: context.notes.session.objectives.join('\n- '),
      git_log: context.gitLog || 'No git log available.',
    }
  }

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('GapAnalyzerAgent starting...')
    this.agentLogger.debug('Step:', context.currentStep)
    this.agentLogger.debug('Total entries:', context.notes.entries.length)

    const prompt = this.buildContextPrompt(context)
    this.agentLogger.debug('Built prompt, length:', prompt.length)

    this.agentLogger.debug('Sending prompt to OpenCode...')
    await this.session.prompt(prompt)

    // The agent is expected to have reported its result by running
    // `aso-agent gap-report` via the bash tool.
    const output = readGapReport(context.stateDir)
    if (!output) {
      throw new Error('GapAnalyzerAgent: No gap analysis reported. The agent must run `aso-agent gap-report`.')
    }

    // Defensive: validate output structure
    if (!Array.isArray(output.gaps)) {
      throw new Error(`GapAnalyzerAgent: AI response missing 'gaps' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.summary) {
      throw new Error(`GapAnalyzerAgent: AI response missing 'summary'. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }

    this.agentLogger.debug('Received response')
    this.agentLogger.debug('Gaps found:', output.gaps.length)
    this.agentLogger.debug('Summary:', output.summary)

    if (output.gaps.length > 0) {
      this.agentLogger.info(`Found ${output.gaps.length} gap(s):`)
      for (const gap of output.gaps) {
        this.agentLogger.info(`  - ${gap}`)
      }
    }
    else {
      this.agentLogger.ready('No gaps found — project looks complete')
    }

    return {
      success: output.gaps.length === 0,
      output,
      summary: output.gaps.length > 0
        ? `Gaps found (${output.gaps.length}): ${output.summary}`
        : `No gaps found: ${output.summary}`,
    }
  }
}
