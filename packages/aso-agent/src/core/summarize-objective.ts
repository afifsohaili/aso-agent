import { createLogger } from './logger.js'
import { sanitizeSummary } from './naming.js'
import type { OpenCodeClient } from '../services/opencode-client.js'

const logger = createLogger('summarize')

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'to', 'of', 'in', 'with', 'from', 'on', 'at', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'it', 'its',
])

interface SummaryResponse {
  summary: string
}

/**
 * Summarize an objective using LLM (via OpenCode), with fallback to local summarization.
 */
export async function summarizeObjective(objective: string, client: OpenCodeClient | null): Promise<string> {
  // Try LLM first
  if (client) {
    try {
      logger.debug('Attempting LLM summarization...')
      const llmSummary = await llmSummarize(objective, client)
      if (llmSummary) {
        logger.debug('LLM summary:', llmSummary)
        return llmSummary
      }
    }
    catch (error) {
      logger.warn('LLM summarization failed, falling back to local:', error instanceof Error ? error.message : String(error))
    }
  }

  // Fallback to local
  logger.debug('Using local summarization fallback')
  return localSummarize(objective)
}

/**
 * Use OpenCode LLM to generate a concise summary.
 */
async function llmSummarize(objective: string, client: OpenCodeClient): Promise<string | null> {
  const session = await client.createSession({ title: 'Summarize objective' })

  const prompt = `Given this objective, create a concise identifier (max 40 characters, lowercase, only letters/numbers/hyphens, 3-6 words, no articles or prepositions):

Objective: "${objective}"

Respond with ONLY a hyphenated identifier. Examples:
- "Add user authentication with OAuth2" → "add-user-auth"
- "Fix the login bug on the admin page" → "fix-login-admin"
- "Implement a payment gateway with Stripe" → "payment-gateway-stripe"
- "Refactor the database connection logic" → "refactor-db-connection"

Your response (hyphenated identifier only, no quotes, no markdown):`

  try {
    const response = await session.promptWithSchema<SummaryResponse>(prompt, {
      type: 'object',
      properties: {
        summary: { type: 'string' },
      },
      required: ['summary'],
    })

    if (response.summary) {
      const sanitized = sanitizeSummary(response.summary)
      if (sanitized.length > 0) {
        return sanitized
      }
    }
  }
  catch (error) {
    logger.debug('LLM prompt failed:', error instanceof Error ? error.message : String(error))
  }

  return null
}

/**
 * Local fallback summarization: remove stop words, take first 5-6 meaningful words, hyphenate.
 */
export function localSummarize(objective: string): string {
  if (!objective || objective.trim().length === 0) {
    return ''
  }

  const words = objective
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ') // Remove punctuation except hyphens
    .split(/[\s-]+/) // Split on whitespace and hyphens
    .filter(word => word.length > 0 && !STOP_WORDS.has(word))

  // Take up to 6 words, then join and sanitize
  const meaningful = words.slice(0, 6)
  return sanitizeSummary(meaningful.join('-'))
}


