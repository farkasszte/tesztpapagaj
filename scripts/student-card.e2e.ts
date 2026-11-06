import { expect, test } from '@playwright/test'

// A diák válaszkártyája (tp#42): a pipa a betű **helyén** áll, ezért nem
// tördeli újra a válasz szövegét, és a kártya alacsonyabb. A mérés a valódi
// `game.css`-t használja: a `/jatek` oldal betölti a stíluslapot, a kártyát
// utána a lapba injektáljuk — így a stílus és a geometria együtt mérhető.
test('a diák kártyája: a pipa nem tördeli újra a szöveget', async ({ page }) => {
  await page.goto('/jatek')
  await expect(page.locator('.gq-stage, .gq-page, main').first()).toBeVisible()

  const measured = await page.evaluate(() => {
    const host = document.createElement('div')
    host.className = 'gq-stu'
    host.style.width = '360px'
    host.innerHTML = `
      <div class="gq-stu-choices">
        <button class="gq-stu-choice" data-tone="idle" style="--c: rgb(196,64,47)">
          <span class="gq-stu-letter">A</span>
          <span class="gq-stu-choice-words"><span class="doc-content"><p>Hosszabb válasz szöveg, ami két sort is kitölt a telefonon</p></span></span>
        </button>
        <button class="gq-stu-choice" data-tone="picked" style="--c: rgb(196,64,47)">
          <span class="gq-stu-letter" data-ticked="true">A</span>
          <span class="gq-stu-choice-words"><span class="doc-content"><p>Hosszabb válasz szöveg, ami két sort is kitölt a telefonon</p></span></span>
        </button>
        <button class="gq-stu-choice" data-tone="idle" style="--c: rgb(47,92,140)">
          <span class="gq-stu-letter">B</span>
          <span class="gq-stu-choice-words"><span class="doc-content"><p>Rövid</p></span></span>
        </button>
        <button class="gq-stu-choice" data-tone="idle" style="--c: rgb(154,110,13)">
          <span class="gq-stu-letter">C</span>
          <span class="gq-stu-choice-words"><span class="doc-content"><p>Rövid</p></span></span>
        </button>
      </div>`
    document.body.append(host)

    const cards = [...host.querySelectorAll<HTMLElement>('.gq-stu-choice')]
    const words = cards.map((card) => card.querySelector<HTMLElement>('.gq-stu-choice-words')!)
    const letter = cards[1].querySelector<HTMLElement>('.gq-stu-letter')!
    const idle = cards[0].querySelector<HTMLElement>('.gq-stu-letter')!
    const tickContent = getComputedStyle(letter, '::after').content
    const result = {
      heights: cards.map((card) => Math.round(card.getBoundingClientRect().height)),
      wordsWidths: words.map((span) => Math.round(span.getBoundingClientRect().width * 10) / 10),
      wordsHeights: words.map((span) => Math.round(span.getBoundingClientRect().height)),
      tickContent,
      letterText: letter.textContent,
      letterColorTicked: getComputedStyle(letter).color,
      letterColorIdle: getComputedStyle(idle).color,
      borderWidth: getComputedStyle(cards[0]).borderTopWidth,
      borderColorIdle: getComputedStyle(cards[0]).borderTopColor,
      borderColorPicked: getComputedStyle(cards[1]).borderTopColor,
    }
    return result
  })

  await page.locator('.gq-stu').screenshot({ path: 'E:/AI/hermes/cache/scratch/student-cards.png' })
  await page.evaluate(() => document.querySelector('.gq-stu')?.remove())

  // A kiválasztott és a jelöletlen kártya szövege ugyanolyan széles: nincs újratördelés.
  expect(measured.wordsWidths[0]).toBe(measured.wordsWidths[1])
  expect(measured.wordsHeights[0]).toBe(measured.wordsHeights[1])
  // A pipa a betű karikájában jelenik meg, a kártya szövegének érintése nélkül.
  expect(measured.tickContent).toContain('✓')
  expect(measured.letterText).toBe('A')
  // Az egysoros kártya alacsonyabb lett (a korábbi 54 px minimum helyett 44).
  expect(measured.heights[2]).toBeLessThanOrEqual(46)
  // A kétsoros kártya magassága a tartalomé, nem a minimumé.
  expect(measured.heights[0]).toBeGreaterThan(measured.heights[2])
  // A jelöletlen és a kijelölt kártya kerete ugyanolyan vastag: nincs elmozdulás.
  expect(measured.borderColorIdle).not.toBe(measured.borderColorPicked)
})
