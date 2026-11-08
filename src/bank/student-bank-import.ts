import { StudentBankError, decodeStudentBank, isStudentBankFile } from './student-bank'
import { createQuestionBankWorkspaceService } from './question-bank-workspaces'
import { importedQuestionsFromRecord } from '../import/question-bank-import'
import type { QuestionBankRecord } from '../export/question-bank-export'

/**
 * Tanulói példány importja fájlból: kicsomagolja, a kérdéseket a helyi alakra
 * hozza, a képeket a média-tárolóba teszi, és a bankot `student: true`
 * jelzéssel hozza létre. Ez a bank nem szerkeszthető — csak gyakorlásra való.
 */
export async function importStudentBankFile(file: File): Promise<{ bankId: string; name: string; questions: number }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new StudentBankError('A fájl nem olvasható JSON.')
  }
  if (!isStudentBankFile(parsed)) throw new StudentBankError('Ez nem tanulói példány.')
  const { record, files, name, bankKey } = await decodeStudentBank(parsed)

  const questions = importedQuestionsFromRecord(record)
  const media = record.media.map((asset: QuestionBankRecord['media'][number]) => {
    const bytes = files.get(asset.file)
    if (!bytes) throw new StudentBankError(`Hiányzó kép: ${asset.file}`)
    return {
      hash: asset.id.replace(/^sha256:/, ''),
      mimeType: asset.mimeType,
      // A másolat saját puffere: a tároló nem hivatkozhat a kicsomagolt nézetre.
      bytes: bytes.slice().buffer,
      width: asset.width,
      height: asset.height,
    }
  })

  const bank = await createQuestionBankWorkspaceService().importStudentBank({
    name,
    questions,
    media,
    ...(bankKey ? { studentKey: bankKey } : {}),
  })
  return { bankId: bank.id, name: bank.name, questions: questions.length }
}
