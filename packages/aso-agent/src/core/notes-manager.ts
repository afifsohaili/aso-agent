import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import { createLogger } from './logger.js'
import type { NotesDocument, CycleEntry, RoadmapPhase, SessionConfig } from '../types/index.js'

export class NotesManager {
  private filePath: string
  private logger = createLogger('notes')

  constructor(filePath: string = './notes.yaml') {
    this.filePath = filePath
    this.logger.debug('NotesManager initialized, file:', filePath)
  }

  /**
   * Read the notes.yaml file and parse it.
   * Returns null if the file doesn't exist.
   */
  read(): NotesDocument | null {
    this.logger.debug('Reading notes file:', this.filePath)
    if (!existsSync(this.filePath)) {
      this.logger.debug('Notes file does not exist')
      return null
    }

    const content = readFileSync(this.filePath, 'utf-8')
    this.logger.debug('Read', content.length, 'bytes from notes file')

    try {
      const doc = parse(content) as NotesDocument
      this.logger.debug('Parsed notes document')
      this.logger.debug('Session ID:', doc.session.id)
      this.logger.debug('Roadmap phases:', doc.roadmap.length)
      this.logger.debug('Total cycles:', doc.cycles.length)
      return doc
    }
    catch (error) {
      this.logger.error('Failed to parse notes.yaml:', error)
      throw error
    }
  }

  /**
   * Create a new notes.yaml with initial session config and roadmap.
   */
  initialize(config: SessionConfig, roadmap: RoadmapPhase[]): NotesDocument {
    this.logger.debug('Initializing new notes document...')
    this.logger.debug('Session ID:', config.id)
    this.logger.debug('Objective:', config.objective)
    this.logger.debug('Initial roadmap phases:', roadmap.length)

    const doc: NotesDocument = {
      session: config,
      roadmap,
      cycles: [],
    }
    this.write(doc)
    this.logger.success('Notes document initialized')
    return doc
  }

  /**
   * Append a new cycle entry to the notes.
   */
  appendCycle(cycle: CycleEntry): NotesDocument {
    this.logger.debug('Appending cycle entry...')
    this.logger.debug('Cycle:', cycle.cycle)
    this.logger.debug('Phase:', cycle.phase)
    this.logger.debug('Agent:', cycle.agent)

    const doc = this.read()
    if (!doc) {
      this.logger.error('Cannot append cycle: notes.yaml does not exist')
      throw new Error('Cannot append cycle: notes.yaml does not exist. Call initialize() first.')
    }

    // Mark any previous running cycles as failed if they exist
    const lastCycle = doc.cycles[doc.cycles.length - 1]
    if (lastCycle && lastCycle.status === 'running') {
      this.logger.warn('Previous cycle was still running, marking as failed:', lastCycle.cycle)
      lastCycle.status = 'failed'
      lastCycle.completed_at = new Date().toISOString()
    }

    doc.cycles.push(cycle)
    this.logger.debug('Total cycles now:', doc.cycles.length)
    this.write(doc)
    this.logger.debug('Cycle entry appended successfully')
    return doc
  }

  /**
   * Update the last cycle entry (e.g., mark as completed or failed).
   */
  updateLastCycle(updates: Partial<CycleEntry>): NotesDocument {
    this.logger.debug('Updating last cycle entry...')
    this.logger.debug('Updates:', JSON.stringify(updates))

    const doc = this.read()
    if (!doc || doc.cycles.length === 0) {
      this.logger.error('Cannot update cycle: no cycles exist')
      throw new Error('Cannot update cycle: no cycles exist.')
    }

    const lastCycle = doc.cycles[doc.cycles.length - 1]
    this.logger.debug('Updating cycle:', lastCycle.cycle, '(', lastCycle.phase, ')')
    this.logger.debug('Current status:', lastCycle.status)

    Object.assign(lastCycle, updates)
    this.logger.debug('New status:', lastCycle.status)

    this.write(doc)
    this.logger.debug('Last cycle updated successfully')
    return doc
  }

  /**
   * Update the roadmap (typically after discovery phase).
   */
  updateRoadmap(roadmap: RoadmapPhase[]): NotesDocument {
    this.logger.debug('Updating roadmap...')
    this.logger.debug('New roadmap has', roadmap.length, 'phases')

    const doc = this.read()
    if (!doc) {
      this.logger.error('Cannot update roadmap: notes.yaml does not exist')
      throw new Error('Cannot update roadmap: notes.yaml does not exist.')
    }

    doc.roadmap = roadmap
    this.write(doc)
    this.logger.success('Roadmap updated with', roadmap.length, 'phases')
    return doc
  }

  /**
   * Get the current cycle (last cycle with status 'running').
   * Returns null if no running cycle exists.
   */
  getCurrentCycle(): CycleEntry | null {
    this.logger.debug('Getting current cycle...')
    const doc = this.read()
    if (!doc || doc.cycles.length === 0) {
      this.logger.debug('No cycles found')
      return null
    }

    const lastCycle = doc.cycles[doc.cycles.length - 1]
    const isRunning = lastCycle.status === 'running'
    this.logger.debug('Last cycle:', lastCycle.cycle, 'status:', lastCycle.status, 'isRunning:', isRunning)
    return isRunning ? lastCycle : null
  }

  /**
   * Get the last completed cycle.
   */
  getLastCompletedCycle(): CycleEntry | null {
    this.logger.debug('Getting last completed cycle...')
    const doc = this.read()
    if (!doc || doc.cycles.length === 0) {
      this.logger.debug('No cycles found')
      return null
    }

    for (let i = doc.cycles.length - 1; i >= 0; i--) {
      if (doc.cycles[i].status === 'completed') {
        this.logger.debug('Found completed cycle:', doc.cycles[i].cycle)
        return doc.cycles[i]
      }
    }

    this.logger.debug('No completed cycles found')
    return null
  }

  /**
   * Get the current phase from the roadmap.
   */
  getCurrentPhase(): RoadmapPhase | null {
    this.logger.debug('Getting current roadmap phase...')
    const doc = this.read()
    if (!doc) {
      this.logger.debug('No notes document found')
      return null
    }

    const phase = doc.roadmap.find(p => p.status === 'in_progress') || null
    this.logger.debug('Current phase:', phase?.title || 'none')
    return phase
  }

  private write(doc: NotesDocument): void {
    this.logger.debug('Writing notes to disk...')
    const yaml = stringify(doc, {
      indent: 2,
      sortMapEntries: false,
    })
    writeFileSync(this.filePath, yaml, 'utf-8')
    this.logger.debug('Wrote', yaml.length, 'bytes to', this.filePath)
  }
}
