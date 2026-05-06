import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from './logger.js'

export interface PromptLoadResult {
  content: string
  source: 'built-in' | 'overridden'
  path: string
}

export class PromptLoader {
  private logger = createLogger('prompt-loader')
  private builtinPromptsDir: string
  private overrideDir: string

  constructor(workingDir: string) {
    // Resolve built-in prompts relative to this module.
    // In dev (tsx):  src/core/prompt-loader.ts -> ../prompts -> src/prompts/
    // In prod (dist): dist/cli.js              -> prompts     -> dist/prompts/
    const currentFile = fileURLToPath(import.meta.url)
    const currentDir = dirname(currentFile)

    const candidates = [
      join(currentDir, 'prompts'),      // prod: dist/prompts
      join(currentDir, '..', 'prompts'), // dev: src/prompts
    ]

    let resolvedDir = candidates[0]
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        resolvedDir = candidate
        break
      }
    }

    this.builtinPromptsDir = resolvedDir

    // Override prompts live in the target repo
    this.overrideDir = join(workingDir, '.aso-agent', 'prompts')

    this.logger.debug('Built-in prompts dir:', this.builtinPromptsDir)
    this.logger.debug('Override prompts dir:', this.overrideDir)
  }

  /**
   * Load a prompt template, substituting {{variables}}.
   * Prefers .aso-agent/prompts/{name}.md if it exists.
   */
  load(agentName: string, variables: Record<string, string>): PromptLoadResult {
    const overridePath = join(this.overrideDir, `${agentName}.md`)
    const builtinPath = join(this.builtinPromptsDir, `${agentName}.md`)

    let content: string
    let source: 'built-in' | 'overridden'
    let path: string

    if (existsSync(overridePath)) {
      this.logger.info(`Using OVERRIDDEN prompt for ${agentName}: ${overridePath}`)
      content = readFileSync(overridePath, 'utf-8')
      source = 'overridden'
      path = overridePath
    }
    else {
      if (!existsSync(builtinPath)) {
        throw new Error(
          `Prompt not found for agent '${agentName}'. ` +
          `Expected built-in at: ${builtinPath} ` +
          `or override at: ${overridePath}`,
        )
      }
      this.logger.debug(`Using built-in prompt for ${agentName}: ${builtinPath}`)
      content = readFileSync(builtinPath, 'utf-8')
      source = 'built-in'
      path = builtinPath
    }

    const substituted = this.substitute(content, variables)

    return {
      content: substituted,
      source,
      path,
    }
  }

  /**
   * List all built-in prompt names (without .md extension).
   */
  listBuiltins(): string[] {
    if (!existsSync(this.builtinPromptsDir)) {
      return []
    }
    return readdirSync(this.builtinPromptsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.slice(0, -3))
  }

  /**
   * Export all built-in prompts to .aso-agent/prompts/ in the given directory.
   */
  exportTo(workingDir: string): { exported: string[], destDir: string } {
    const destDir = join(workingDir, '.aso-agent', 'prompts')
    mkdirSync(destDir, { recursive: true })

    const exported: string[] = []

    for (const name of this.listBuiltins()) {
      const src = join(this.builtinPromptsDir, `${name}.md`)
      const dest = join(destDir, `${name}.md`)
      const content = readFileSync(src, 'utf-8')
      writeFileSync(dest, content)
      exported.push(name)
    }

    return { exported, destDir }
  }

  private substitute(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (key in variables) {
        return variables[key]
      }
      this.logger.warn(`Unknown template variable: {{${key}}} in prompt`)
      return match
    })
  }
}
