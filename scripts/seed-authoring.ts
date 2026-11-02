// Seeding the browser with authoring state.
//
// A fixture is a real Exam workspace: its registry record selects the Exam and
// its normalized state is written through that Exam's production IndexedDB
// backend. Tests therefore reload the same storage boundary the editor uses,
// rather than a retired shared-workspace database.

import type { Page } from '@playwright/test'
import type { AuthoringState } from '../src/exam-store'

/** Puts a snapshot in the active seeded Exam and opens that Exam's editor. */
export async function seedAuthoringState(
  page: Page,
  state: AuthoringState,
): Promise<void> {
  await page.goto('/')
  await page.getByRole('heading', { name: 'Pick up where you left off', exact: true }).waitFor()
  await page.evaluate(async (snapshot: AuthoringState) => {
    const { createExamWorkspaceService } = await import(
      /* @vite-ignore */ '/src/exam-workspaces.ts'
    ) as typeof import('../src/exam-workspaces')
    const workspaces = createExamWorkspaceService()
    let examId = await workspaces.activeId()
    if (!examId || !await workspaces.exists(examId)) {
      examId = (await workspaces.create()).id
    }
    await workspaces.backendFor(examId).write(snapshot)

    // A Question Bank a saját munkaterületén él: a szerkesztő panelje és a
    // bankok lapjai ezt olvassák, nem az Exam beágyazott bankját. A vetés ezért
    // külön létrehozza a bankot ugyanazokkal a kérdés-azonosítókkal, és
    // megnyitja az Examhez — különben a panel üres, és a „kérdés felvétele”
    // gombok sincsenek a lapon.
    if (snapshot.questionBank.questions.length > 0) {
      const { createQuestionBankWorkspaceService } = await import(
        /* @vite-ignore */ '/src/question-bank-workspaces.ts'
      ) as typeof import('../src/question-bank-workspaces')
      const banks = createQuestionBankWorkspaceService()
      const bank = await banks.create()
      await banks.commit(bank.id, {
        kind: 'create-questions',
        questions: snapshot.questionBank.questions,
      })
      await banks.openTab({ examId }, bank.id)
    }
  }, state)
  // The bare editor route deliberately restores the registry's active Exam.
  await page.goto('/editor')
  await page.getByRole('textbox', { name: 'Exam name' }).waitFor()
  // A bank panelje és a store betöltése aszinkron: ha a vetés után azonnal
  // húzunk, a készülő szerkesztő későbbi betöltése felülírhatja a dobást, és
  // a kérdés csendben eltűnik. Megvárjuk, hogy a bank sorai megjelenjenek.
  if (state.questionBank.questions.length > 0) {
    await page
      .getByRole('region', { name: 'Question Bank' })
      .getByRole('listitem')
      .first()
      .waitFor()
  }
}
