import { prepareQuestionBankExport } from '../export/question-bank-export'
import { encodeStudentBank, studentBankFileName } from './student-bank'
import type { QuestionBankResource } from './question-bank-workspaces'

/**
 * Egy kérdésbankból tanulói példány: a képek a fájlba csomagolva, a tartalom
 * base64-ben, a fejléc olvasható. A böngésző tölti le — szerver nem kell.
 */
export async function exportStudentBank(bank: QuestionBankResource): Promise<string> {
  const prepared = await prepareQuestionBankExport(bank)
  const { json } = await encodeStudentBank({
    record: prepared.record,
    files: prepared.files,
    // A forrás bank azonosítója: ezzel ismeri fel az import a frissítést.
    bankKey: bank.id,
  })
  const name = studentBankFileName(bank.name)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    // A letöltés a link kattintásakor elindul; a hivatkozás felszabadítható.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  return name
}
