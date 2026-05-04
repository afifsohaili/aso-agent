import type { Agent, AgentContext, AgentResult, AgentType } from '../types/index.js'
import type { OpenCodeSession } from '../services/opencode-client.js'

export interface BaseAgentOptions {
  session: OpenCodeSession
}

export abstract class BaseAgent implements Agent {
  abstract readonly name: AgentType

  protected session: OpenCodeSession

  constructor(options: BaseAgentOptions) {
    this.session = options.session
  }

  abstract run(context: AgentContext, prompt: string): Promise<AgentResult>

  /**
   * Build a prompt that includes context from notes.yaml.
   */
  protected buildContextPrompt(context: AgentContext, taskPrompt: string): string {
    const { notes, currentCycle } = context

    let prompt = `# Task\n${taskPrompt}\n\n`

    // Add session info
    prompt += `# Session Info\n`
    prompt += `- Objective: ${notes.session.objective}\n`
    prompt += `- Stop When: ${notes.session.stop_when}\n`
    prompt += `- Current Cycle: ${currentCycle}\n`
    prompt += `- Branch: ${notes.session.branch}\n\n`

    // Add current roadmap
    if (notes.roadmap.length > 0) {
      prompt += `# Current Roadmap\n`
      for (const phase of notes.roadmap) {
        const status = phase.status === 'in_progress' ? ' [CURRENT]' : ''
        prompt += `- [${phase.status}] ${phase.title}${status}\n`
      }
      prompt += '\n'
    }

    // Add recent cycle history (last 3 cycles)
    const recentCycles = notes.cycles.slice(-3)
    if (recentCycles.length > 0) {
      prompt += `# Recent Activity\n`
      for (const cycle of recentCycles) {
        prompt += `## Cycle ${cycle.cycle} (${cycle.phase})\n`
        prompt += `- Status: ${cycle.status}\n`
        prompt += `- Summary: ${cycle.summary}\n`

        if (cycle.test_results) {
          prompt += `- Tests: ${cycle.test_results.passed ? 'PASSED' : 'FAILED'}\n`
        }

        if (cycle.output && 'findings' in cycle.output && Array.isArray(cycle.output.findings)) {
          prompt += `- Findings: ${cycle.output.findings.join(', ')}\n`
        }

        prompt += '\n'
      }
    }

    return prompt
  }
}
