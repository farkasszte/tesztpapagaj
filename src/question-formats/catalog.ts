import type { FormatId } from './types'
import { t } from '../i18n/index'

/**
 * What a teacher is told about the question formats Test Parrot reads, kept
 * apart from the parsers so a drop zone can name them without loading them.
 */

/** Each format as a teacher knows it. */
export const FORMAT_LABELS: Record<FormatId, string> = {
  get 'bb-generator'(): string {
    return t('fmt.bbGenerator')
  },
  get 'bb-tsv'(): string {
    return t('fmt.bbTsv')
  },
  get 'bb-package'(): string {
    return t('fmt.bbPackage')
  },
  get 'qti'(): string {
    return t('fmt.qti')
  },
  get 'moodle-xml'(): string {
    return t('fmt.moodleXml')
  },
  get 'gift'(): string {
    return t('fmt.gift')
  },
  get 'aiken'(): string {
    return t('fmt.aiken')
  },
  get 'respondus'(): string {
    return t('fmt.respondus')
  },
  text2qti: 'text2qti',
  'd2l-csv': 'Brightspace (D2L) question CSV',
  get 'respondus-csv'(): string {
    return t('fmt.respondusCsv')
  },
  get 'kahoot'(): string {
    return t('fmt.kahoot')
  },
  get 'spreadsheet'(): string {
    return t('fmt.spreadsheet')
  },
  get 'flashcards'(): string {
    return t('fmt.flashcards')
  },
}

/** The tools whose files a drop zone names, grouped as teachers meet them. */
export const SUPPORTED_SOURCES: readonly string[] = [
  'Blackboard Test Generator',
  'Blackboard',
  'Canvas',
  'Brightspace (D2L)',
  'Moodle (XML, GIFT, Aiken)',
  'QTI',
  'Respondus',
  'text2qti',
  'Kahoot',
  'Quizlet and Anki',
  'CSV and Excel spreadsheets',
]

/** The file names a question file from another tool is saved under. */
export const QUESTION_FILE_EXTENSIONS = [
  '.txt', '.text', '.csv', '.tsv', '.tab', '.xml', '.zip', '.imscc', '.gift', '.qti', '.dat', '.xlsx', '.md', '.aiken',
] as const

export function isQuestionFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return QUESTION_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}
