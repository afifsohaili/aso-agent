import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import { createLogger } from './logger.js'
import type { NotesDocument, Entry, SessionConfig } from '../types/index.js'

/** Maximum allowed size for notes.yaml in characters */
export const MAX_NOTES_SIZE = 50000

/** Target size after compaction in characters */
export const TARGET_NOTES_SIZE = 25000

export class NotesManager {
  private filePath: string
  private logger = createLogger('notes')

  constructor(filePath: string = './notes.yaml') {
    this.filePath = filePath
    this.logger.debug('NotesManager initialized, file:', filePath)
  }

  /**
   * Get the file path of the notes document.
   */
  getFilePath(): string {
    return this.filePath
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
      this.logger.debug('Total entries:', doc.entries.length)
      return doc
    }
    catch (error) {
      this.logger.error('Failed to parse notes.yaml:', error)
      throw error
    }
  }

  /**
   * Create a new notes.yaml with initial session config.
   */
  initialize(config: SessionConfig): NotesDocument {
    this.logger.debug('Initializing new notes document...')
    this.logger.debug('Session ID:', config.id)
    this.logger.debug('Objective:', config.objective)

    const doc: NotesDocument = {
      session: config,
      entries: [],
    }
    this.write(doc)
    this.logger.success('Notes document initialized')
    return doc
  }

  /**
   * Append a new entry to the notes.
   */
  appendEntry(entry: Entry): NotesDocument {
    this.logger.debug('Appending entry...')
    this.logger.debug('Step:', entry.step)
    this.logger.debug('Summary:', entry.summary)

    const doc = this.read()
    if (!doc) {
      this.logger.error('Cannot append entry: notes.yaml does not exist')
      throw new Error('Cannot append entry: notes.yaml does not exist. Call initialize() first.')
    }

    doc.entries.push(entry)
    this.logger.debug('Total entries now:', doc.entries.length)
    this.write(doc)
    this.logger.debug('Entry appended successfully')
    return doc
  }

  /**
   * Update session config fields.
   */
  updateSession(updates: Partial<SessionConfig>): NotesDocument {
    this.logger.debug('Updating session config...')
    this.logger.debug('Updates:', JSON.stringify(updates))

    const doc = this.read()
    if (!doc) {
      this.logger.error('Cannot update session: notes.yaml does not exist')
      throw new Error('Cannot update session: notes.yaml does not exist.')
    }

    Object.assign(doc.session, updates)
    this.write(doc)
    this.logger.debug('Session config updated successfully')
    return doc
  }

  /**
   * Get the last entry.
   */
  getLastEntry(): Entry | null {
    this.logger.debug('Getting last entry...')
    const doc = this.read()
    if (!doc || doc.entries.length === 0) {
      this.logger.debug('No entries found')
      return null
    }

    const last = doc.entries[doc.entries.length - 1]
    this.logger.debug('Last entry step:', last.step)
    return last
  }

  /**
   * Get the size of the notes file in characters.
   * Returns 0 if the file does not exist.
   */
  getFileSize(): number {
    this.logger.debug('Getting file size...')
    if (!existsSync(this.filePath)) {
      this.logger.debug('File does not exist, size=0')
      return 0
    }

    const content = readFileSync(this.filePath, 'utf-8')
    this.logger.debug('File size:', content.length, 'characters')
    return content.length
  }

  /**
   * Check if the notes file needs compaction.
   * Returns true if the file exceeds MAX_NOTES_SIZE characters.
   */
  needsCompaction(): boolean {
    this.logger.debug('Checking if compaction is needed...')
    const size = this.getFileSize()
    const needsCompaction = size > MAX_NOTES_SIZE
    this.logger.debug('File size:', size, 'Max:', MAX_NOTES_SIZE, 'Needs compaction:', needsCompaction)
    return needsCompaction
  }

  /**
   * Compact the notes document to reduce file size.
   * Preserves the session section exactly.
   * Sacrifices minor details from older entries first.
   * Returns the compacted document, or null if file does not exist.
   */
  compact(): NotesDocument | null {
    this.logger.debug('Starting compaction...')

    const doc = this.read()
    if (!doc) {
      this.logger.debug('No file to compact')
      return null
    }

    // Check current size
    const currentSize = this.getFileSize()
    this.logger.debug('Current file size:', currentSize)

    if (currentSize <= TARGET_NOTES_SIZE) {
      this.logger.debug('File already under target size, no compaction needed')
      return doc
    }

    this.logger.debug('File exceeds target, starting compaction...')

    // Create a working copy of entries
    let compactedEntries = doc.entries.map(e => ({ ...e, files_changed: [...e.files_changed] }))

    // Phase 1: Remove files_changed from oldest entries first
    for (let i = 0; i < compactedEntries.length && this.calculateSize(doc.session, compactedEntries) > TARGET_NOTES_SIZE; i++) {
      // Skip the last 3 most recent entries - keep them detailed
      if (i >= compactedEntries.length - 3)
        continue

      const entry = compactedEntries[i]
      if (entry.files_changed.length > 0) {
        this.logger.debug(`Removing files_changed from step ${entry.step}`)
        entry.files_changed = []
      }
    }

    // Phase 2: Truncate summaries from oldest entries first
    for (let i = 0; i < compactedEntries.length && this.calculateSize(doc.session, compactedEntries) > TARGET_NOTES_SIZE; i++) {
      // Skip the last 2 most recent entries - keep their summaries intact
      if (i >= compactedEntries.length - 2)
        continue

      const entry = compactedEntries[i]
      const maxSummaryLength = 120
      if (entry.summary.length > maxSummaryLength) {
        this.logger.debug(`Truncating summary for step ${entry.step}`)
        entry.summary = entry.summary.slice(0, maxSummaryLength) + '...'
      }
    }

    // Phase 3: Remove oldest entries entirely if still over target
    while (compactedEntries.length > 3 && this.calculateSize(doc.session, compactedEntries) > TARGET_NOTES_SIZE) {
      this.logger.debug(`Removing oldest entry step ${compactedEntries[0].step}`)
      compactedEntries.shift()
    }

    const compactedDoc: NotesDocument = {
      session: { ...doc.session },
      entries: compactedEntries,
    }

    this.write(compactedDoc)
    const newSize = this.getFileSize()
    this.logger.success('Compaction complete. Size:', currentSize, '->', newSize)

    return compactedDoc
  }

  /**
   * Calculate the serialized size of a notes document.
   */
  private calculateSize(session: NotesDocument['session'], entries: NotesDocument['entries']): number {
    const yaml = stringify({ session, entries }, {
      indent: 2,
      sortMapEntries: false,
    })
    return yaml.length
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
