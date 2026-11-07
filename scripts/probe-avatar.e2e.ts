import { expect, test } from '@playwright/test'
import { go } from './navigate'

// Az avatar-rajzoló ellenőrzése: ugyanaz a név ugyanazt a figurát adja, a
// különböző nevek különbözőt, és a kép valóban SVG (nem üres hely).
test('az avatar determinisztikus, és a nevekhez külön figurát rajzol', async ({ page }) => {
  // Az első látogatás service worker-újratöltése elviheti az `evaluate`-t.
  const evaluate = async <T,>(fn: () => Promise<T>, arg?: unknown): Promise<T> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await page.evaluate(fn as never, arg as never)
      } catch {
        await page.waitForTimeout(600)
      }
    }
    throw new Error('az avatar-mérés nem indult el')
  }
  await go(page, '/about')
  const drawn = await evaluate(async () => {
    const { ensureAvatarStyle, playerAvatarSvg, avatarSeed } = (await import(
      /* @vite-ignore */ '/src/game/avatar.ts'
    )) as typeof import('../src/game/avatar')
    await ensureAvatarStyle('critters')
    const names = ['Anna', 'Bence', 'Csilla', 'Dávid', 'Anna', 'anna']
    const svgs = names.map((name) => playerAvatarSvg(name, 96))
    return {
      seed: avatarSeed('  Anna  '),
      lengths: svgs.map((svg) => svg.length),
      checks: svgs.map((svg) => svg.startsWith('<svg') && svg.includes('</svg>')),
      // Ugyanaz a mag → ugyanaz a rajz; más mag → más figura.
      sameSeed: svgs[0] === svgs[4],
      otherSeed: svgs[0] !== svgs[5],
      distinct: new Set(svgs.slice(0, 4)).size,
      gallery: ['Anna', 'Bence', 'Csilla', 'Dávid', 'Emese', 'Ferenc', 'Gitta', 'Huba'].map(
        (name) => ({ name, svg: playerAvatarSvg(name, 192) }),
      ),
    }
  })

  expect(drawn.seed).toBe('anna')
  expect(drawn.checks.every(Boolean)).toBe(true)
  expect(drawn.lengths.every((len) => len > 500)).toBe(true)
  // Ugyanaz a seed → ugyanaz a rajz; a szóköz nem számít.
  expect(drawn.sameSeed).toBe(true)
  expect(drawn.otherSeed).toBe(true)
  // Négy különböző név → négy különböző figura.
  expect(drawn.distinct).toBe(4)

  // Látható ellenőrzés: a lapra kitesszük a figurákat.
  await page.setContent(
    `<main style="display:flex;flex-wrap:wrap;gap:12px;padding:24px;background:#f4ece0;font:14px system-ui">
      ${drawn.gallery
        .map(
          (item) =>
            `<figure style="margin:0;text-align:center"><span class="gq-avatar">${item.svg}</span>` +
            `<figcaption style="margin-top:6px">${item.name}</figcaption></figure>`,
        )
        .join('')}
    </main>`,
  )
  await page.addStyleTag({
    content:
      '.gq-avatar{display:inline-block;width:96px;height:96px;border-radius:9999px;overflow:hidden;background:#e8dcc8}.gq-avatar svg{display:block;width:100%;height:100%}',
  })
  await expect(page.locator('.gq-avatar svg')).toHaveCount(8)
  await page.screenshot({ path: 'avatars.png', fullPage: true })
})
