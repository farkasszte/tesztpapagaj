import type {
  ExamWorkspaceService,
  RecentExam,
  QuestionUsage,
} from '../exam/exam-workspaces'
import type {
  QuestionBankSummary,
  QuestionBankWorkspaceService,
} from './question-bank-workspaces'

export const HOME_PREVIEW_LIMIT = 6

export type QuestionBankCollectionItem = QuestionBankSummary & {
  usage: QuestionUsage[]
}

/**
 * A gyűjtemény sorai: minden bankhoz a kérdéseit használó vizsgák.
 *
 * Két körben dolgozik: a kérdés-azonosítókat és a használati térképet egyszer
 * olvassa ki, majd bankonként csak összekapcsol. A bankonkénti teljes
 * újraolvasás száz banknál másodperceket vitt el, ezért van a gyors út; a régi
 * (egyenkénti) út csak akkor fut, ha a szolgáltatás nem tudja a kötegeltet.
 */
export async function questionBankCollection(
  banks: readonly QuestionBankSummary[],
  bankWorkspaces: QuestionBankWorkspaceService,
  workspaces: ExamWorkspaceService,
): Promise<QuestionBankCollectionItem[]> {
  const idsByBank = typeof bankWorkspaces.questionIds === 'function'
    ? await bankWorkspaces.questionIds()
    : null
  const usageIndex = typeof workspaces.usageIndex === 'function'
    ? await workspaces.usageIndex()
    : null

  return Promise.all(
    banks.map(async (bank) => {
      const questionIds = idsByBank
        ? idsByBank.get(bank.id) ?? []
        : (await bankWorkspaces.read(bank.id))?.questions.map(({ id }) => id) ?? []
      if (!usageIndex) {
        return { ...bank, usage: await workspaces.resourceUsage(questionIds) }
      }
      const seen = new Map<string, QuestionUsage>()
      for (const id of questionIds) {
        for (const usage of usageIndex.get(id) ?? []) {
          if (!seen.has(usage.examId)) seen.set(usage.examId, usage)
        }
      }
      return { ...bank, usage: [...seen.values()] }
    }),
  )
}

const normalized = (value: string) => value.trim().toLocaleLowerCase()

export function filterExamCollection(
  exams: readonly RecentExam[],
  query: string,
): RecentExam[] {
  const needle = normalized(query)
  if (!needle) return [...exams]
  return exams.filter((exam) => normalized(exam.title).includes(needle))
}

export function filterQuestionBankCollection(
  banks: readonly QuestionBankCollectionItem[],
  query: string,
): QuestionBankCollectionItem[] {
  const needle = normalized(query)
  if (!needle) return [...banks]
  return banks.filter(
    (bank) =>
      normalized(bank.name).includes(needle) ||
      bank.topics.some((topic) => normalized(topic).includes(needle)),
  )
}

export function homePreview<T>(resources: readonly T[]): T[] {
  return resources.slice(0, HOME_PREVIEW_LIMIT)
}
