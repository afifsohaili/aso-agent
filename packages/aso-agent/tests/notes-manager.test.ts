import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NotesManager } from '../src/core/notes-manager.js'
import type { SessionConfig, RoadmapPhase } from '../src/types/index.js'

describe('NotesManager', () => {
  let tmpDir: string
  let notesPath: string
  let manager: NotesManager

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aso-agent-test-'))
    notesPath = join(tmpDir, 'notes.yaml')
    manager = new NotesManager(notesPath)
  })

  afterEach(() => {
    // Clean up tmp dir
    import('node:fs').then(({ rmSync }) => {
      rmSync(tmpDir, { recursive: true })
    })
  })

  it('should return null when file does not exist', () => {
    expect(manager.read()).toBeNull()
  })

  it('should initialize a new notes document', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    const roadmap: RoadmapPhase[] = [
      { id: 1, title: 'Phase 1', description: 'First phase', status: 'pending' },
    ]

    const doc = manager.initialize(config, roadmap)

    expect(doc.session).toEqual(config)
    expect(doc.roadmap).toEqual(roadmap)
    expect(doc.cycles).toEqual([])
    expect(existsSync(notesPath)).toBe(true)
  })

  it('should append a cycle entry', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    manager.initialize(config, [])

    const cycle = {
      cycle: 1,
      phase: 'discovery' as const,
      agent: 'discovery' as const,
      status: 'running' as const,
      started_at: '2024-01-01T00:00:00Z',
      summary: 'Test cycle',
      output: {
        type: 'discovery' as const,
        roadmap: [],
        rationale: 'Test rationale',
      },
    }

    const doc = manager.appendCycle(cycle)

    expect(doc.cycles).toHaveLength(1)
    expect(doc.cycles[0]).toMatchObject(cycle)
  })

  it('should mark previous running cycle as failed when appending new cycle', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    manager.initialize(config, [])

    const cycle1 = {
      cycle: 1,
      phase: 'discovery' as const,
      agent: 'discovery' as const,
      status: 'running' as const,
      started_at: '2024-01-01T00:00:00Z',
      summary: 'First cycle',
      output: {
        type: 'discovery' as const,
        roadmap: [],
        rationale: 'Test',
      },
    }

    manager.appendCycle(cycle1)

    const cycle2 = {
      cycle: 2,
      phase: 'plan' as const,
      agent: 'planner' as const,
      status: 'running' as const,
      started_at: '2024-01-01T00:01:00Z',
      summary: 'Second cycle',
      output: {
        type: 'plan' as const,
        tasks: [],
        approach: 'Test',
      },
    }

    const doc = manager.appendCycle(cycle2)

    expect(doc.cycles[0].status).toBe('failed')
    expect(doc.cycles[1].status).toBe('running')
  })

  it('should update the last cycle', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    manager.initialize(config, [])

    const cycle = {
      cycle: 1,
      phase: 'discovery' as const,
      agent: 'discovery' as const,
      status: 'running' as const,
      started_at: '2024-01-01T00:00:00Z',
      summary: 'Test',
      output: {
        type: 'discovery' as const,
        roadmap: [],
        rationale: 'Test',
      },
    }

    manager.appendCycle(cycle)

    const doc = manager.updateLastCycle({
      status: 'completed',
      completed_at: '2024-01-01T00:05:00Z',
    })

    expect(doc.cycles[0].status).toBe('completed')
    expect(doc.cycles[0].completed_at).toBe('2024-01-01T00:05:00Z')
  })

  it('should update the roadmap', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    manager.initialize(config, [])

    const newRoadmap: RoadmapPhase[] = [
      { id: 1, title: 'Phase 1', description: 'First', status: 'completed' },
      { id: 2, title: 'Phase 2', description: 'Second', status: 'in_progress' },
    ]

    const doc = manager.updateRoadmap(newRoadmap)

    expect(doc.roadmap).toEqual(newRoadmap)
  })

  it('should get the current running cycle', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    manager.initialize(config, [])

    expect(manager.getCurrentCycle()).toBeNull()

    const cycle = {
      cycle: 1,
      phase: 'discovery' as const,
      agent: 'discovery' as const,
      status: 'running' as const,
      started_at: '2024-01-01T00:00:00Z',
      summary: 'Test',
      output: {
        type: 'discovery' as const,
        roadmap: [],
        rationale: 'Test',
      },
    }

    manager.appendCycle(cycle)

    const current = manager.getCurrentCycle()
    expect(current).not.toBeNull()
    expect(current?.cycle).toBe(1)
  })

  it('should return null for current cycle when last cycle is completed', () => {
    const config: SessionConfig = {
      id: 'test-session',
      started: '2024-01-01T00:00:00Z',
      objective: 'Test objective',
      stop_when: 'Tests pass',
      branch: 'aso-agent/test',
      max_iterations: 50,
      max_time_per_iteration: 1800,
    }

    manager.initialize(config, [])

    const cycle = {
      cycle: 1,
      phase: 'discovery' as const,
      agent: 'discovery' as const,
      status: 'completed' as const,
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:05:00Z',
      summary: 'Test',
      output: {
        type: 'discovery' as const,
        roadmap: [],
        rationale: 'Test',
      },
    }

    manager.appendCycle(cycle)

    expect(manager.getCurrentCycle()).toBeNull()
  })
})
