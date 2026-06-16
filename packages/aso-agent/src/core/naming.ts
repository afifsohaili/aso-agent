/**
 * Naming utilities for generating human-friendly branch and notes file names.
 */

/**
 * Convert a branch name to its corresponding notes file name.
 * Example: aso/260507-add-user-auth → notes-aso-260507-add-user-auth.yaml
 */
export function notesFileFromBranch(branch: string): string {
  const sanitized = branch.replace(/\//g, '-')
  return `notes-${sanitized}.yaml`
}

/**
 * Generate a branch name from a date and summary.
 * Example: 2026-05-07, 'add-user-auth' → aso/260507-add-user-auth
 */
export function generateBranchName(date: Date, summary: string): string {
  const yymmdd = formatDateYYMMDD(date)
  const sanitized = sanitizeSummary(summary)
  return `aso/${yymmdd}-${sanitized}`
}

/**
 * Generate a session ID from a date and summary.
 * Example: 2026-05-07, 'add-user-auth' → aso-260507-add-user-auth
 */
export function generateSessionId(date: Date, summary: string): string {
  const yymmdd = formatDateYYMMDD(date)
  const sanitized = sanitizeSummary(summary)
  return `aso-${yymmdd}-${sanitized}`
}

/**
 * Sanitize a summary string for use in branch/file names.
 * - Lowercase
 * - Replace non-alphanumeric with hyphens
 * - Collapse multiple hyphens
 * - Remove leading/trailing hyphens
 * - Truncate to 40 chars
 */
export function sanitizeSummary(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Check if a branch name collides with existing branches.
 * If so, append a counter (e.g., -2, -3, etc.).
 */
export function checkBranchCollision(branchName: string, existingBranches: string[]): string {
  if (!existingBranches.includes(branchName)) {
    return branchName
  }

  // Find the highest existing counter
  let maxCounter = 1
  const baseName = branchName

  for (const existing of existingBranches) {
    if (existing === baseName) {
      maxCounter = Math.max(maxCounter, 1)
    }
    else if (existing.startsWith(`${baseName}-`)) {
      const suffix = existing.slice(baseName.length + 1)
      const counter = parseInt(suffix, 10)
      if (!isNaN(counter)) {
        maxCounter = Math.max(maxCounter, counter)
      }
    }
  }

  return `${baseName}-${maxCounter + 1}`
}

/**
 * Format a date as yymmdd.
 */
function formatDateYYMMDD(date: Date): string {
  const year = date.getFullYear().toString().slice(2)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}${month}${day}`
}
