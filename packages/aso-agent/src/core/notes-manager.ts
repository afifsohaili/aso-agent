import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import { createLogger } from './logger.js'
import type { NotesDocument, Entry, SessionConfig } from '../types/index.js'

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
