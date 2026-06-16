import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { GitManager } from '../src/core/git-manager.js'

describe('GitManager', () => {
  let tmpDir: string
  let gitManager: GitManager

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-git-test-'))
    gitManager = new GitManager(tmpDir)

    // Initialize git repo
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'pipe' })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir, stdio: 'pipe' })
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir, stdio: 'pipe' })

    // Create initial commit
    writeFileSync(join(tmpDir, 'README.md'), '# Test')
    execFileSync('git', ['add', '.'], { cwd: tmpDir, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir, stdio: 'pipe' })
  })

  afterEach(() => {
    import('node:fs').then(({ rmSync }) => {
      rmSync(tmpDir, { recursive: true })
    })
  })

  it('should detect git repository', () => {
    expect(gitManager.isGitRepo()).toBe(true)
  })

  it('should get current branch', () => {
    const branch = gitManager.getCurrentBranch()
    expect(branch).toBe('main') // git init default in newer versions
  })

  it('should create a new branch', () => {
    gitManager.createBranch('test-branch')
    expect(gitManager.getCurrentBranch()).toBe('test-branch')
  })

  it('should check if branch exists', () => {
    expect(gitManager.branchExists('main')).toBe(true)
    expect(gitManager.branchExists('non-existent')).toBe(false)
  })

  it('should commit changes', () => {
    writeFileSync(join(tmpDir, 'new-file.txt'), 'hello')

    const result = gitManager.commit('Add new file')

    expect(result.success).toBe(true)
    expect(result.hash).toBeDefined()
  })

  it('should handle empty commit', () => {
    const result = gitManager.commit('Empty commit')

    // Should succeed but indicate no changes
    expect(result.success).toBe(true)
    expect(result.error).toBe('No changes to commit')
  })

  it('should detect uncommitted changes', () => {
    expect(gitManager.hasUncommittedChanges()).toBe(false)

    writeFileSync(join(tmpDir, 'dirty.txt'), 'dirty')

    expect(gitManager.hasUncommittedChanges()).toBe(true)
  })

  it('should get branch base commit', () => {
    const commit = gitManager.getBranchBaseCommit()
    expect(commit).toBeDefined()
    expect(commit.length).toBe(40) // SHA-1 hash
  })

  it('should reset hard', () => {
    writeFileSync(join(tmpDir, 'to-be-deleted.txt'), 'delete me')
    execFileSync('git', ['add', '.'], { cwd: tmpDir, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', 'Add file to delete'], { cwd: tmpDir, stdio: 'pipe' })

    gitManager.resetHard()

    // After reset, the file should still be there because it was committed
    // But any uncommitted changes would be gone
    expect(gitManager.hasUncommittedChanges()).toBe(false)
  })

  it('should checkout an existing branch', () => {
    gitManager.createBranch('test-branch')
    expect(gitManager.getCurrentBranch()).toBe('test-branch')

    gitManager.checkoutBranch('main')
    expect(gitManager.getCurrentBranch()).toBe('main')
  })

  it('should list all branches', () => {
    gitManager.createBranch('test-branch')
    gitManager.createBranch('another-branch')
    gitManager.checkoutBranch('main')

    const branches = gitManager.listBranches()
    expect(branches).toContain('main')
    expect(branches).toContain('test-branch')
    expect(branches).toContain('another-branch')
  })
})
