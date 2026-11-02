// The values a Question Bank's filters offer, wherever a bank is filtered:
// the pane beside an Exam, the Question Bank page and the Pop-over.

import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  SECTION_LABELS,
  SECTION_ORDER,
  type QuestionType,
} from './exam'
import type { DifficultyFilter, QuestionBankSort } from './question-bank-view'
import { t } from './i18n'

export type FilterOption<T extends string> = { value: T; label: string }

// The fixed Question Sections, in the order the exam prints them. The labels
// are getters: the options are built once, when this module loads, and the
// language may still be resolved after that — a label read at import time
// would freeze whatever language happened to be set first.
export const TYPE_OPTIONS: FilterOption<QuestionType>[] = SECTION_ORDER.map((type) => ({
  value: type,
  get label() { return SECTION_LABELS[type] },
}))

export const DIFFICULTY_OPTIONS: FilterOption<DifficultyFilter>[] = [
  ...DIFFICULTIES.map((value) => ({ value, get label() { return DIFFICULTY_LABELS[value] } })),
  // Optional classification must never put a question out of reach.
  { value: 'unspecified', get label() { return t('ui.unspecified') } },
]

export const SORT_OPTIONS: readonly FilterOption<QuestionBankSort>[] = [
  { value: 'newest', get label() { return t('bank.filterNewest') } },
  { value: 'oldest', get label() { return t('bank.filterOldest') } },
  { value: 'type', get label() { return t('bank.questionType') } },
  { value: 'difficulty', get label() { return t('bank.filterDifficulty') } },
  { value: 'topic', get label() { return t('ui.topic') } },
]
