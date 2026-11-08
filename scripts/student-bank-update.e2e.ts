import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { go } from './navigate'

/**
 * Tanulói példány frissítése (tp#56): ugyanaz a bank újra exportálva
 * **frissíti** a diák példányát — nem lesz második bank, a bank azonosítója
 * marad, tehát a mentett gyakorló-eredmény is megmarad.
 */

const HUNGARIAN = { name: 'tesztpapagaj:language', value: 'hu' }

async function seed(page: import('@playwright/test').Page): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await go(page, '/about').catch(() => undefined)
    const tag = `${Date.now().toString(36)}-${attempt}`
    try {
      return await page.evaluate(async ({ suffix }) => {
        const { createQuestionBankWorkspaceService } = (await import(
          /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
        )) as typeof import('../src/bank/question-bank-workspaces')
        const banks = createQuestionBankWorkspaceService()
        const bank = await banks.create()
        await banks.commit(bank.id, { kind: 'rename', name: 'Frissítés próba' })
        await banks.commit(bank.id, {
          kind: 'create-questions',
          questions: [1, 2, 3].map((number) => {
            const id = `fr-${suffix}-${number}`
            return {
              id,
              type: 'multiple-choice',
              columns: 1,
              doc: {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: `Kérdés ${number}` }] },
                  {
                    type: 'multipleChoice',
                    content: ['Oxigén', 'Zöld', 'Hélium'].map((text) => ({
                      type: 'multipleChoiceChoice',
                      attrs: { correct: text === 'Oxigén', id: `${id}-${text}` },
                      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
                    })),
                  },
                ],
              },
            }
          }),
        } as never)
        return bank.id
      }, { suffix: tag })
    } catch {
      await page.waitForTimeout(600)
    }
  }
  throw new Error('a bank vetése nem sikerült')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entry) => {
    window.localStorage.setItem(entry.name, entry.value)
  }, HUNGARIAN)
})

test('ugyanaz a tanulói példány újraimportálva frissít, nem duplikál', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const bankId = await seed(page)
  await go(page, `/question-bank?id=${bankId}`)

  const exportOnce = async (name: string) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Tanulói példány mentése' }).click(),
    ])
    const to = join(test.info().outputDir, name)
    await download.saveAs(to)
    return to
  }

  const first = await exportOnce('student-v1.json')
  const rawFirst = JSON.parse(await readFile(first, 'utf8')) as { version: number; encoding?: string }
  expect(rawFirst.version).toBe(2)
  expect(rawFirst.encoding).toBe('gzip+base64')

  // A diák: üres böngésző, import, gyakorlás (3/3).
  const context = await browser.newContext()
  await context.addInitScript(() => {
    window.localStorage.setItem('test-parrot:welcomed', 'true')
    window.localStorage.setItem('tesztpapagaj:language', 'hu')
  })
  const student = await context.newPage()
  await student.goto(new URL('/get-started/convert', page.url()).toString())
  await student.locator('input[type=file]').first().setInputFiles(first)
  await expect(student).toHaveURL(/\/gyakorlas\?bank=/, { timeout: 30_000 })
  const practiceUrl = student.url()
  const studentBankId = new URL(practiceUrl).searchParams.get('bank')

  for (let round = 0; round < 3; round += 1) {
    await student.locator('.practice-choice').filter({ hasText: 'Oxigén' }).click()
    await student
      .getByRole('button', { name: /Következő kérdés|Eredmény/ })
      .click()
  }
  await expect(student.locator('.practice-score-fraction')).toHaveText('3/3')

  // A tanár közben módosít: még egy kérdés.
  await page.evaluate(async ({ id }) => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
    )) as typeof import('../src/bank/question-bank-workspaces')
    const banks = createQuestionBankWorkspaceService()
    const extra = `fr-extra-${Date.now().toString(36)}`
    await banks.commit(id, {
      kind: 'create-questions',
      questions: [{
        id: extra,
        type: 'multiple-choice',
        columns: 1,
        doc: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Negyedik kérdés' }] },
            {
              type: 'multipleChoice',
              content: ['Oxigén', 'Zöld', 'Hélium'].map((text) => ({
                type: 'multipleChoiceChoice',
                attrs: { correct: text === 'Oxigén', id: `${extra}-${text}` },
                content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
              })),
            },
          ],
        },
      }],
    } as never)
  }, { id: bankId })

  await go(page, `/question-bank?id=${bankId}`)
  const second = await exportOnce('student-v2.json')

  // A diák ugyanabban a böngészőben importálja az újat.
  await student.goto(new URL('/get-started/convert', page.url()).toString())
  await student.locator('input[type=file]').first().setInputFiles(second)
  await expect(student).toHaveURL(/\/gyakorlas\?bank=/, { timeout: 30_000 })

  // Ugyanaz a bank (azonosító), négy kérdéssel — és a korábbi eredmény megvan.
  expect(new URL(student.url()).searchParams.get('bank')).toBe(studentBankId)
  await expect(student.locator('.practice-count')).toContainText('4')
  await expect(student.locator('.practice-last')).toContainText('3/3')

  // Egyetlen tanulói bank van, nem kettő.
  await student.goto(new URL('/question-banks', page.url()).toString())
  await expect(student.locator('.import-card, .resource-card')).toHaveCount(1, { timeout: 20_000 })
  await context.close()
})
