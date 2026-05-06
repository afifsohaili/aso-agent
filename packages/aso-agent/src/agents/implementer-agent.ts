import { BaseAgent } from './base-agent.js'
import { createLogger } from '../core/logger.js'
import type { AgentContext, AgentResult, ImplementOutput } from '../types/index.js'

export class ImplementerAgent extends BaseAgent {
  readonly name = 'implementer' as const
  private agentLogger = createLogger('agent:implementer')

  protected getPromptVariables(context: AgentContext): Record<string, string> {
    const currentPhase = context.notes.roadmap.find(p => p.status === 'in_progress')

    // Find the first not_started task
    const nextTask = context.notes.tasks.find(t => t.status === 'not_started')
    const allTasks = context.notes.tasks

    return {
      phase_title: currentPhase?.title || 'Unknown',
      phase_description: currentPhase?.description || 'No description',
      next_task_id: nextTask ? String(nextTask.id) : 'none',
      next_task_description: nextTask?.description || 'No remaining tasks',
      all_tasks: allTasks.map(t => `${t.id}. [${t.status}] ${t.description}`).join('\n'),
      test_command: context.notes.session.test_command,
    }
  }

  async run(context: AgentContext): Promise<AgentResult> {
    this.agentLogger.start('ImplementerAgent starting...')

    const nextTask = context.notes.tasks.find(t => t.status === 'not_started')
    this.agentLogger.debug('Next task ID:', nextTask?.id ?? 'none')
    this.agentLogger.debug('Next task:', nextTask?.description ?? 'No remaining tasks')
    this.agentLogger.debug('Total tasks:', context.notes.tasks.length)
    this.agentLogger.debug('Completed:', context.notes.tasks.filter(t => t.status === 'completed').length)

    if (!nextTask) {
      this.agentLogger.warn('No remaining tasks to implement!')
      return {
        success: true,
        output: {
          type: 'implement',
          task_id: -1,
          tests_passed: true,
          files_changed: [],
          summary: 'All tasks already completed',
        },
        summary: 'All tasks already completed',
      }
    }

    const prompt = this.buildContextPrompt(context)
    this.agentLogger.debug('Built prompt, length:', prompt.length)

    const schema = {
      type: 'object',
      properties: {
        type: { const: 'implement' },
        task_id: { type: 'number' },
        tests_passed: { type: 'boolean' },
        files_changed: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['path', 'description'],
          },
        },
        summary: { type: 'string' },
      },
      required: ['type', 'task_id', 'tests_passed', 'files_changed', 'summary'],
    }

    this.agentLogger.debug('Sending prompt to OpenCode...')
    const output = await this.session.promptWithSchema<ImplementOutput>(prompt, schema)

    // Defensive: validate output structure
    if (typeof output.task_id !== 'number') {
      throw new Error(`ImplementerAgent: AI response missing 'task_id' number. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (typeof output.tests_passed !== 'boolean') {
      throw new Error(`ImplementerAgent: AI response missing 'tests_passed' boolean. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.files_changed || !Array.isArray(output.files_changed)) {
      throw new Error(`ImplementerAgent: AI response missing 'files_changed' array. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }
    if (!output.summary) {
      throw new Error(`ImplementerAgent: AI response missing 'summary'. Got: ${JSON.stringify(output).slice(0, 200)}`)
    }

    this.agentLogger.debug('Received response')
    this.agentLogger.debug('Task ID:', output.task_id)
    this.agentLogger.debug('Tests passed:', output.tests_passed)
    this.agentLogger.debug('Files changed:', output.files_changed.length)

    if (!output.tests_passed) {
      this.agentLogger.warn('Tests did not pass!')
    }

    this.agentLogger.success('ImplementerAgent complete, task_id=', output.task_id, 'tests_passed=', output.tests_passed)
    return {
      success: output.tests_passed,
      output,
      summary: output.summary,
    }
  }
}
