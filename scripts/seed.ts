import type { Page } from '@playwright/test'
import { go } from './navigate'

/**
 * Közös bank-vetés az e2e-khez.
 *
 * Két dolgot tesz, amit eddig minden szkript magában másolt:
 *
 * 1. **Próbálkozik.** Az első látogatáskor a service worker újratöltheti a
 *    lapot, és az éppen futó `page.evaluate` „execution context destroyed"
 *    hibával elszáll. Ilyenkor újra kell menni az `/about`-ra.
 * 2. **Egyedi azonosítókat ad.** A kérdés-azonosítók nem ismételhetők a
 *    tárolóban (a statisztika és a kép hozzájuk tartozik), ezért minden
 *    próbálkozás saját `tag`-et kap, amit a hívó beépít az azonosítókba.
 */

export async function retrySeed<T>(
  page: Page,
  work: (tag: string) => Promise<T>,
  attempts = 5,
): Promise<T> {
  let last: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // Az első navigáció hibája nem baj: a következő próbálkozás úgyis újratölt.
    await go(page, '/about').catch(() => undefined)
    try {
      return await work(`${Date.now().toString(36)}-${attempt}`)
    } catch (error) {
      last = error
      await page.waitForTimeout(600)
    }
  }
  throw last instanceof Error ? last : new Error('a bank vetése nem sikerült')
}

/** Egy bank a beépített szolgáltatással; a kérdéseket a hívó adja JSON-ban. */
export async function seedBank(
  page: Page,
  name: string,
  questions: (tag: string) => unknown[],
): Promise<string> {
  return retrySeed(page, (tag) =>
    page.evaluate(
      async ({ bankName, items }) => {
        const { createQuestionBankWorkspaceService } = (await import(
          /* @vite-ignore */ '/src/bank/question-bank-workspaces.ts'
        )) as typeof import('../src/bank/question-bank-workspaces')
        const banks = createQuestionBankWorkspaceService()
        const bank = await banks.create()
        await banks.commit(bank.id, { kind: 'rename', name: bankName })
        await banks.commit(bank.id, { kind: 'create-questions', questions: items } as never)
        return bank.id
      },
      { bankName: name, items: questions(tag) },
    ),
  )
}
