import { execFileSync, execSync } from 'node:child_process'
import { createLogger } from './logger.js'

export interface GitCommitResult {
  success: boolean
  hash?: string
  error?: string
}

export class GitManager {
  private cwd: string
  private logger = createLogger('git')

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd
    this.logger.debug('GitManager initialized, cwd:', cwd)
  }

  /**
   * Check if we're in a git repository.
   */
  isGitRepo(): boolean {
    this.logger.debug('Checking if current directory is a git repo...')
    try {
      execFileSync('git', ['rev-parse', '--git-dir'], { cwd: this.cwd, stdio: 'pipe' })
      this.logger.debug('Is git repo: true')
      return true
    }
    catch {
      this.logger.debug('Is git repo: false')
      return false
    }
  }

  /**
   * Get the current branch name.
   */
  getCurrentBranch(): string {
    this.logger.debug('Getting current branch...')
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: this.cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim()
    this.logger.debug('Current branch:', branch)
    return branch
  }

  /**
   * Create and checkout a new branch.
   */
  createBranch(branchName: string): void {
    this.logger.debug('Creating branch:', branchName)
    try {
      execFileSync('git', ['checkout', '-b', branchName], { cwd: this.cwd, stdio: 'pipe' })
      this.logger.success('Created and checked out branch:', branchName)
    }
    catch (error) {
      this.logger.error('Failed to create branch:', error)
      throw error
    }
  }

  /**
   * Checkout an existing branch.
   */
  checkoutBranch(branchName: string): void {
    this.logger.debug('Checking out branch:', branchName)
    try {
      execFileSync('git', ['checkout', branchName], { cwd: this.cwd, stdio: 'pipe' })
      this.logger.success('Checked out branch:', branchName)
    }
    catch (error) {
      this.logger.error('Failed to checkout branch:', error)
      throw error
    }
  }

  /**
   * Check if a branch exists.
   */
  branchExists(branchName: string): boolean {
    this.logger.debug('Checking if branch exists:', branchName)
    try {
      execFileSync('git', ['show-ref', '--verify', `refs/heads/${branchName}`], {
        cwd: this.cwd,
        stdio: 'pipe',
      })
      this.logger.debug('Branch exists: true')
      return true
    }
    catch {
      this.logger.debug('Branch exists: false')
      return false
    }
  }

  /**
   * Stage all changes and commit.
   */
  commit(message: string): GitCommitResult {
    this.logger.debug('Committing changes...')
    this.logger.debug('Commit message:', message)

    try {
      // Check for uncommitted changes first
      this.logger.debug('Checking for changes to commit...')
      const hasChanges = this.hasUncommittedChanges()
      if (!hasChanges) {
        this.logger.debug('No changes to commit')
        return { success: true, error: 'No changes to commit' }
      }

      // Stage all changes
      this.logger.debug('Staging all changes...')
      execFileSync('git', ['add', '-A'], { cwd: this.cwd, stdio: 'pipe' })
      this.logger.debug('Changes staged')

      // Unstage notes files - these are temporary orchestration state, not work artifacts
      this.logger.debug('Unstaging notes files...')
      try {
        execFileSync('git', ['reset', 'HEAD', '--', 'notes-*.yaml'], { cwd: this.cwd, stdio: 'pipe' })
        this.logger.debug('Notes files unstaged')
      }
      catch {
        // No notes files to unstage, ignore
      }

      // Check if there are still staged changes after excluding notes files
      const stagedStatus = execFileSync('git', ['diff', '--cached', '--name-only'], {
        cwd: this.cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      })
      if (!stagedStatus.trim()) {
        this.logger.debug('No non-notes changes to commit')
        // Notes file stays in working tree - do NOT discard it with checkout
        return { success: true, error: 'No changes to commit (only notes file updates)' }
      }

      // Try to commit
      this.logger.debug('Creating commit...')
      execFileSync('git', ['commit', '-m', message, '--no-verify'], {
        cwd: this.cwd,
        stdio: 'pipe',
      })
      this.logger.debug('Commit created')

      // Get the commit hash
      const hash = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: this.cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim()

      this.logger.success('Committed:', hash.slice(0, 7))
      return { success: true, hash }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Commit failed:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Reset to the last commit (hard reset).
   */
  resetHard(): void {
    this.logger.warn('Performing hard reset...')
    try {
      execFileSync('git', ['reset', '--hard', 'HEAD'], { cwd: this.cwd, stdio: 'pipe' })
      this.logger.success('Hard reset complete')
    }
    catch (error) {
      this.logger.error('Hard reset failed:', error)
      throw error
    }
  }

  /**
   * Get the initial commit hash of the current branch.
   * Useful for resetting to before the agent started.
   */
  getBranchBaseCommit(): string {
    this.logger.debug('Getting branch base commit...')
    const hash = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: this.cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim()
    this.logger.debug('Base commit:', hash.slice(0, 7))
    return hash
  }

  /**
   * Get git log since the branch was created (from base branch to HEAD).
   */
  getLogSinceBranchCreated(): string {
    this.logger.debug('Getting git log since branch created...')
    try {
      const baseBranch = this.getBaseBranch()
      this.logger.debug('Base branch:', baseBranch)

      const output = execFileSync('git', ['log', '--oneline', `${baseBranch}..HEAD`], {
        cwd: this.cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      })

      const log = output.trim()
      this.logger.debug('Git log lines:', log.split('\n').length)
      return log || 'No commits yet.'
    }
    catch (error) {
      this.logger.debug('Failed to get git log:', error)
      return 'Unable to retrieve git log.'
    }
  }

  /**
   * Get diff stats for the current branch vs main/master.
   */
  getDiffStats(): { files: number, insertions: number, deletions: number } {
    this.logger.debug('Getting diff stats...')
    try {
      const baseBranch = this.getBaseBranch()
      this.logger.debug('Base branch:', baseBranch)

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
        const stats = {
          files: parseInt(match[1] || '0', 10),
          insertions: parseInt(match[2] || '0', 10),
          deletions: parseInt(match[3] || '0', 10),
        }
        this.logger.debug('Diff stats:', JSON.stringify(stats))
        return stats
      }
    }
    catch (error) {
      this.logger.debug('Failed to get diff stats:', error)
    }

    return { files: 0, insertions: 0, deletions: 0 }
  }

  /**
   * Detect the base branch (main or master).
   */
  private getBaseBranch(): string {
    this.logger.debug('Detecting base branch...')
    try {
      execFileSync('git', ['show-ref', '--verify', 'refs/heads/main'], {
        cwd: this.cwd,
        stdio: 'pipe',
      })
      this.logger.debug('Base branch: main')
      return 'main'
    }
    catch {
      this.logger.debug('Base branch: master')
      return 'master'
    }
  }

  /**
   * List all local branch names.
   */
  listBranches(): string[] {
    this.logger.debug('Listing branches...')
    try {
      const output = execFileSync('git', ['branch', '--format=%(refname:short)'], {
        cwd: this.cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      })
      const branches = output.trim().split('\n').filter(b => b.length > 0)
      this.logger.debug('Found branches:', branches.length)
      return branches
    }
    catch (error) {
      this.logger.debug('Failed to list branches:', error)
      return []
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
      const hasChanges = status.trim().length > 0
      this.logger.debug('Has uncommitted changes:', hasChanges)
      return hasChanges
    }
    catch {
      this.logger.debug('Has uncommitted changes: false (error)')
      return false
    }
  }
}
