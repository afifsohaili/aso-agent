import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import type { NotesDocument, CycleEntry, RoadmapPhase, SessionConfig } from '../types/index.js'

export class NotesManager {
  private filePath: string

  constructor(filePath: string = './notes.yaml') {
    this.filePath = filePath
  }

  /**
   * Read the notes.yaml file and parse it.
   * Returns null if the file doesn't exist.
   */
  read(): NotesDocument | null {
    if (!existsSync(this.filePath)) {
      return null
    }

    const content = readFileSync(this.filePath, 'utf-8')
    return parse(content) as NotesDocument
  }

  /**
   * Create a new notes.yaml with initial session config and roadmap.
   */
  initialize(config: SessionConfig, roadmap: RoadmapPhase[]): NotesDocument {
    const doc: NotesDocument = {
      session: config,
      roadmap,
      cycles: [],
    }
    this.write(doc)
    return doc
  }

  /**
   * Append a new cycle entry to the notes.
   */
  appendCycle(cycle: CycleEntry): NotesDocument {
    const doc = this.read()
    if (!doc) {
      throw new Error('Cannot append cycle: notes.yaml does not exist. Call initialize() first.')
    }

    // Mark any previous running cycles as failed if they exist
    const lastCycle = doc.cycles[doc.cycles.length - 1]
    if (lastCycle && lastCycle.status === 'running') {
      lastCycle.status = 'failed'
      lastCycle.completed_at = new Date().toISOString()
    }

    doc.cycles.push(cycle)
    this.write(doc)
    return doc
  }

  /**
   * Update the last cycle entry (e.g., mark as completed or failed).
   */
  updateLastCycle(updates: Partial<CycleEntry>): NotesDocument {
    const doc = this.read()
    if (!doc || doc.cycles.length === 0) {
      throw new Error('Cannot update cycle: no cycles exist.')
    }

    const lastCycle = doc.cycles[doc.cycles.length - 1]
    Object.assign(lastCycle, updates)
    this.write(doc)
    return doc
  }

  /**
   * Update the roadmap (typically after discovery phase).
   */
  updateRoadmap(roadmap: RoadmapPhase[]): NotesDocument {
    const doc = this.read()
    if (!doc) {
      throw new Error('Cannot update roadmap: notes.yaml does not exist.')
    }

    doc.roadmap = roadmap
    this.write(doc)
    return doc
  }

  /**
   * Get the current cycle (last cycle with status 'running').
   * Returns null if no running cycle exists.
   */
  getCurrentCycle(): CycleEntry | null {
    const doc = this.read()
    if (!doc || doc.cycles.length === 0) {
      return null
    }

    const lastCycle = doc.cycles[doc.cycles.length - 1]
    return lastCycle.status === 'running' ? lastCycle : null
  }

  /**
   * Get the last completed cycle.
   */
  getLastCompletedCycle(): CycleEntry | null {
    const doc = this.read()
    if (!doc || doc.cycles.length === 0) {
      return null
    }

    for (let i = doc.cycles.length - 1; i >= 0; i--) {
      if (doc.cycles[i].status === 'completed') {
        return doc.cycles[i]
      }
    }

    return null
  }

  /**
   * Get the current phase from the roadmap.
   */
  getCurrentPhase(): RoadmapPhase | null {
    const doc = this.read()
    if (!doc) {
      return null
    }

    return doc.roadmap.find(p => p.status === 'in_progress') || null
  }

  private write(doc: NotesDocument): void {
    const yaml = stringify(doc, {
      indent: 2,
      sortMapEntries: false,
    })
    writeFileSync(this.filePath, yaml, 'utf-8')
  }
}
