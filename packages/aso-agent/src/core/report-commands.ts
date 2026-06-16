import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NotesManager } from './notes-manager.js'
import { createLogger } from './logger.js'
import type { Entry, GapAnalyzerOutput, StopCheckOutput } from '../types/index.js'

const logger = createLogger('report')

export interface ReportStepOptions {
  summary: string
  testsPassed: boolean
  filesChanged?: Array<{ path: string, description: string }>
}

export interface ReportStopCheckOptions {
  shouldStop: boolean
  reason: string
}

export interface ReportGapOptions {
  gaps: string[]
  summary: string
}

export interface ReportResult {
  success: boolean
  error?: string
}

/**
 * Resolve the aso-agent state directory for a given working directory.
 */
export function getStateDir(workingDir: string): string {
  return join(workingDir, '.aso-agent', 'state')
}

/**
 * Append an implementer step entry to notes.yaml.
 */
export function reportStep(notesFilePath: string, options: ReportStepOptions): ReportResult {
  logger.debug('Reporting step:', options.summary)

  if (!existsSync(notesFilePath)) {
    const error = `Notes file does not exist: ${notesFilePath}`
    logger.error(error)
    return { success: false, error }
  }

  const notesManager = new NotesManager(notesFilePath)
  const notes = notesManager.read()
  if (!notes) {
    const error = `Failed to read notes file: ${notesFilePath}`
    logger.error(error)
    return { success: false, error }
  }

  const entry: Entry = {
    step: notes.entries.length + 1,
    timestamp: new Date().toISOString(),
    summary: options.summary,
    files_changed: options.filesChanged ?? [],
    tests_passed: options.testsPassed,
  }

  notesManager.appendEntry(entry)
  logger.success('Step reported:', entry.step)
  return { success: true }
}

/**
 * Write stop-check result to the state directory.
 */
export function reportStopCheck(stateDir: string, options: ReportStopCheckOptions): ReportResult {
  logger.debug('Reporting stop-check:', options.shouldStop, options.reason)

  mkdirSync(stateDir, { recursive: true })

  const state: StopCheckOutput = {
    type: 'stop-check',
    should_stop: options.shouldStop,
    reason: options.reason,
  }

  writeFileSync(join(stateDir, 'stop-check.json'), JSON.stringify(state, null, 2), 'utf-8')
  logger.success('Stop-check reported')
  return { success: true }
}

/**
 * Write gap-analysis result to the state directory.
 */
export function reportGap(stateDir: string, options: ReportGapOptions): ReportResult {
  logger.debug('Reporting gap analysis:', options.summary)

  mkdirSync(stateDir, { recursive: true })

  const state: GapAnalyzerOutput = {
    type: 'gap-analyzer',
    gaps: options.gaps,
    summary: options.summary,
  }

  writeFileSync(join(stateDir, 'gap-report.json'), JSON.stringify(state, null, 2), 'utf-8')
  logger.success('Gap analysis reported')
  return { success: true }
}

/**
 * Read the last entry from notes.yaml.
 */
export function readLastEntry(notesFilePath: string): Entry | null {
  if (!existsSync(notesFilePath)) {
    return null
  }

  const notesManager = new NotesManager(notesFilePath)
  return notesManager.getLastEntry()
}

/**
 * Read the last stop-check result from the state directory.
 */
export function readStopCheck(stateDir: string): StopCheckOutput | null {
  const path = join(stateDir, 'stop-check.json')
  if (!existsSync(path)) {
    return null
  }

  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as StopCheckOutput
  }
  catch (error) {
    logger.error('Failed to read stop-check state:', error)
    return null
  }
}

/**
 * Read the last gap-analysis result from the state directory.
 */
export function readGapReport(stateDir: string): GapAnalyzerOutput | null {
  const path = join(stateDir, 'gap-report.json')
  if (!existsSync(path)) {
    return null
  }

  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as GapAnalyzerOutput
  }
  catch (error) {
    logger.error('Failed to read gap-report state:', error)
    return null
  }
}
