import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { go } from './navigate'

/**
 * A tanulói példány teljes útja: a tanár ment egy fájlt, a diák egy **másik**
 * böngészőben (üres tárolóval) behúzza, és gyakorolhat vele — szerver nélkül.
 * A fájl fejléce olvasható, a tartalma nem.
 */

// A helyes válaszok szöveggel: a gyakorló megkeveri a válaszok sorrendjét,
// tehát az index nem állandó — a szöveg igen.
const QUESTIONS = [
  { stem: 'Melyik gáz kell a növényeknek?', right: 1, answer: 'Oxigén' },
  { stem: 'Melyik gáz keletkezik a fotoszintézisben?', right: 1, answer: 'Oxigén' },
  { stem: 'Mi a klorofill színe?', right: 0, answer: 'Szén-dioxid' },
]

async function seedBank(page: import('@playwright/test').Page): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await go(page, '/about').catch(() => undefined)
    const tag = `${Date.now().toString(36)}-${attempt}`
    try {
      return await page.evaluate(
        async ({ suffix, questions }) => {
          const { createQuestionBankWorkspaceService } = (await import(
            /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
          )) as typeof import('../src/bank/question-bank-workspaces')
          const banks = createQuestionBankWorkspaceService()
          const bank = await banks.create()
          await banks.commit(bank.id, { kind: 'rename', name: 'Gyakorló sejtek' })
          await banks.commit(bank.id, {
            kind: 'create-questions',
            questions: questions.map((item, index) => ({
              id: `sv-${suffix}-${index}`,
              type: 'multiple-choice',
              columns: 2,
              doc: {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: item.stem }] },
                  {
                    type: 'multipleChoice',
                    content: ['Szén-dioxid', 'Oxigén', 'Hélium'].map((text, choice) => ({
                      type: 'multipleChoiceChoice',
                      attrs: { id: `sv-${suffix}-${index}-${choice}`, correct: choice === item.right },
                      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
                    })),
                  },
                ],
              },
            })) as never,
          })
          return bank.id
        },
        { suffix: tag, questions: QUESTIONS },
      )
    } catch {
      await page.waitForTimeout(600)
    }
  }
  throw new Error('a bank vetése nem sikerült')
}

test('a tanulói példány: mentés, import egy üres böngészőben, gyakorlás', async ({ page, browser }) => {
  test.setTimeout(180_000)
  const bankId = await seedBank(page)
  await go(page, `/question-bank?id=${bankId}`)

  // A tanár menti a tanulói példányt.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save a student copy' }).click(),
  ])
  const savedTo = join(test.info().outputDir, 'student-bank.json')
  await download.saveAs(savedTo)
  const raw = await readFile(savedTo, 'utf8')
  const parsed = JSON.parse(raw) as { format: string; notice: string; payload: string; questions: number }

  // A fejléc olvasható, a tartalom nem: a kérdés szövege nincs a nyers fájlban.
  expect(parsed.format).toBe('testparrot/student-bank')
  expect(parsed.notice).toMatch(/Tanulói példány/)
  expect(parsed.questions).toBe(3)
  expect(raw).not.toContain('Melyik gáz kell a növényeknek?')

  // A diák: másik böngésző, üres tároló.
  const context = await browser.newContext()
  // Az új kontextus első látogató: az üdvözlő oldal helyett egyenesen a
  // behozatalra megyünk, mintha a diák már járt volna itt.
  await context.addInitScript(() => {
    localStorage.setItem('test-parrot:welcomed', 'true')
    localStorage.setItem('tesztpapagaj:language', 'en')
  })
  const student = await context.newPage()
  // A behúzás helye a Behozatal oldal (a főoldalon nincs file-mező).
  await student.goto(new URL('/get-started/convert', page.url()).toString())
  await student.locator('input[type=file]').first().setInputFiles(savedTo)

  // Az import a gyakorlóba visz, és a bank tanulóiként jelenik meg.
  await expect(student).toHaveURL(/\/gyakorlas\?bank=/, { timeout: 30_000 })
  await expect(student.locator('.practice-stem')).toContainText('Melyik gáz', { timeout: 20_000 })

  // Végigválaszol: mind a három helyes.
  for (const item of QUESTIONS) {
    await student.locator('.practice-choice').filter({ hasText: item.answer }).click()
    await expect(student.locator('.practice-verdict[data-right="true"]')).toHaveCount(1)
    await student.getByRole('button', { name: /Next question|See the result/ }).click()
  }

  // Az eredmény: 3/3 — 100%.
  await expect(student.locator('.practice-score strong')).toHaveText('3/3')
  await expect(student.locator('.practice-score span')).toHaveText('100%')
  await context.close()
})
