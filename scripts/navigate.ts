import type { Page } from '@playwright/test'

/**
 * Navigálás, ami kibírja az első látogatás újratöltését.
 *
 * Az app az első betöltéskor regisztrálja a képek service workerét, majd
 * újratölti az oldalt, hogy a worker vezérlés alá kerüljön. A vetés
 * (`page.evaluate`) utáni navigáció ezzel versenyez, és a böngésző
 * `net::ERR_ABORTED`-ot ad — ez nem hiba, csak meg kell ismételni.
 */
export async function go(page: Page, url: string): Promise<void> {
  // A lassú fejlesztői szerver (2 magos gép, 58 mérés egymás után) néha
  // túllépi a navigáció időkeretét: ez is átmeneti, nem hiba.
  const transient = /ERR_ABORTED|NS_BINDING_ABORTED|interrupted by another navigation|timeout/i

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      // A `domcontentloaded` elég: az app a saját betöltése után rajzol, és az
      // esetleges újratöltés nem akasztja meg 30 mp-re a navigációt.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!transient.test(message)) throw error
      await page.waitForTimeout(250 + attempt * 250)
    }
  }

  throw new Error(`a navigáció nem sikerült: ${url}`)
}
