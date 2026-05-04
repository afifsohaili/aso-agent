import { execFileSync, execSync } from 'node:child_process'

export interface GitCommitResult {
  success: boolean
  hash?: string
  error?: string
}

export class GitManager {
  private cwd: string

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd
  }

  /**
   * Check if we're in a git repository.
   */
  isGitRepo(): boolean {
    try {
      execFileSync('git', ['rev-parse', '--git-dir'], { cwd: this.cwd, stdio: 'pipe' })
      return true
    }
    catch {
      return false
    }
  }

  /**
   * Get the current branch name.
   */
  getCurrentBranch(): string {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: this.cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim()
  }

  /**
   * Create and checkout a new branch.
   */
  createBranch(branchName: string): void {
    execFileSync('git', ['checkout', '-b', branchName], { cwd: this.cwd, stdio: 'inherit' })
  }

  /**
   * Check if a branch exists.
   */
  branchExists(branchName: string): boolean {
    try {
      execFileSync('git', ['show-ref', '--verify', `refs/heads/${branchName}`], {
        cwd: this.cwd,
        stdio: 'pipe',
      })
      return true
    }
    catch {
      return false
    }
  }

  /**
   * Stage all changes and commit.
   */
  commit(message: string): GitCommitResult {
    try {
      // Stage all changes
      execFileSync('git', ['add', '-A'], { cwd: this.cwd, stdio: 'pipe' })

      // Try to commit
      execFileSync('git', ['commit', '-m', message, '--no-verify'], {
        cwd: this.cwd,
        stdio: 'pipe',
      })

      // Get the commit hash
      const hash = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: this.cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim()

      return { success: true, hash }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Reset to the last commit (hard reset).
   */
  resetHard(): void {
    execFileSync('git', ['reset', '--hard', 'HEAD'], { cwd: this.cwd, stdio: 'pipe' })
  }

  /**
   * Get the initial commit hash of the current branch.
   * Useful for resetting to before the agent started.
   */
  getBranchBaseCommit(): string {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: this.cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim()
  }

  /**
   * Get diff stats for the current branch vs main/master.
   */
  getDiffStats(): { files: number, insertions: number, deletions: number } {
    try {
      const baseBranch = this.getBaseBranch()
      const output = execFileSync('git', ['diff', '--stat', `${baseBranch}...HEAD`], {
        cwd: this.cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      })

      // Parse the last line which has totals
      const lines = output.trim().split('\n')
      const lastLine = lines[lines.length - 1]

      // Format: "N files changed, M insertions(+), K deletions(-)"
      const match = lastLine.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/)

      if (match) {
        return {
          files: parseInt(match[1] || '0', 10),
          insertions: parseInt(match[2] || '0', 10),
          deletions: parseInt(match[3] || '0', 10),
        }
      }
    }
    catch {
      // Fallback
    }

    return { files: 0, insertions: 0, deletions: 0 }
  }

  /**
   * Detect the base branch (main or master).
   */
  private getBaseBranch(): string {
    try {
      execFileSync('git', ['show-ref', '--verify', 'refs/heads/main'], {
        cwd: this.cwd,
        stdio: 'pipe',
      })
      return 'main'
    }
    catch {
      return 'master'
    }
  }

  /**
   * Check if there are uncommitted changes.
   */
  hasUncommittedChanges(): boolean {
    try {
      const status = execFileSync('git', ['status', '--porcelain'], {
        cwd: this.cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      })
      return status.trim().length > 0
    }
    catch {
      return false
    }
  }
}
