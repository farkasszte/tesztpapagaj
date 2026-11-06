import { expect, test, type Locator } from '@playwright/test'

async function activeExamDatabaseName(page: import('@playwright/test').Page) {
  // A médiatár a közös böngésző-adatbázisban él (`storage-schema.ts`), nem
  // Examonkénti névben — a régi `…-exam-<id>` név üres adatbázist nyitott.
  return page.evaluate(async () => {
    const { STORAGE_NAME } = await import(
      /* @vite-ignore */ '/src/storage/storage-schema.ts'
    ) as typeof import('../src/storage-schema')
    return STORAGE_NAME
  })
}

async function pastePng(target: Locator) {
  await target.evaluate(async (element) => {
    const png = await fetch('/logo.png').then((response) => response.blob())
    const clipboard = new DataTransfer()
    clipboard.items.add(new File([png], 'pasted.png', { type: 'image/png' }))
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    )
  })
}

async function pasteHtmlImage(target: Locator, html: string) {
  await target.evaluate((element, pastedHtml) => {
    const clipboard = new DataTransfer()
    clipboard.setData('text/html', pastedHtml)
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    )
  }, html)
}

async function pasteHtmlImageWithFile(target: Locator, html: string) {
  await target.evaluate(async (element, pastedHtml) => {
    const png = await fetch('/logo.png').then((response) => response.blob())
    const clipboard = new DataTransfer()
    clipboard.setData('text/html', pastedHtml)
    clipboard.items.add(new File([png], 'copied-image.png', { type: 'image/png' }))
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    )
  }, html)
}

async function writePngToClipboard(page: import('@playwright/test').Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(async () => {
    const png = await fetch('/logo.png').then((response) => response.blob())
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
  })
}

test('pasted image files render and persist with a question', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  // Új dolgozatban még nincs nyitott kérdésbank, a kérdés aztán születik: a
  // panel előbb bankot kér, és csak utána kínál „Add question" gombot.
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()

  const dialog = page.getByRole('dialog', { name: 'Question editor' })
  const editor = dialog.locator('.ProseMirror')
  await editor.locator('> p').first().fill('Question with a pasted image')
  await editor.locator('> p').first().press('End')
  await pastePng(editor)

  const pastedImage = editor.locator('img[src^="/local-images/"]')
  await expect(pastedImage).toHaveCount(1)
  await expect
    .poll(() =>
      pastedImage.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Save question' }).click()
  // A panelben született kérdés még nincs a dolgozaton: a sor „Add … to the
  // exam" gombja teszi fel, ahogy a tanár is tenné.
  await page.getByRole('button', { name: /^Add .+ to the exam$/ }).first().click()
  const question = page.locator('.exam-question').first()
  await expect(question.locator('img[src^="/local-images/"]')).toHaveCount(1)

  await question.dblclick()
  await expect(dialog.locator('img[src^="/local-images/"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.reload()
  const reloadedImage = page
    .locator('.exam-question')
    .first()
    .locator('img[src^="/local-images/"]')
  await expect(reloadedImage).toHaveCount(1)
  await expect
    .poll(() =>
      reloadedImage.evaluate(
        (image) => (image as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0)
})

test('images paste through the native browser clipboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  // Új dolgozatban még nincs nyitott kérdésbank, a kérdés aztán születik: a
  // panel előbb bankot kér, és csak utána kínál „Add question" gombot.
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()

  const dialog = page.getByRole('dialog', { name: 'Question editor' })
  const editor = dialog.locator('.ProseMirror')
  await editor.locator('> p').first().click()
  await writePngToClipboard(page)
  await page.keyboard.press('Control+V')

  await expect(editor.locator('img[src^="/local-images/"]')).toHaveCount(1)
})

test('copied web images are captured and persist with a question', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  // Új dolgozatban még nincs nyitott kérdésbank, a kérdés aztán születik: a
  // panel előbb bankot kér, és csak utána kínál „Add question" gombot.
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()

  const dialog = page.getByRole('dialog', { name: 'Question editor' })
  const editor = dialog.locator('.ProseMirror')
  await editor.locator('> p').first().click()
  await pasteHtmlImage(editor, '<img src="/logo.png" alt="Crepe">')

  // #26: a pasted web image is copied into the application-owned Media Store at
  // ingestion and rendered through a stable internal reference, never left
  // pointing at its original mutable URL.
  const imageBlock = editor.locator('.picture-block')
  await expect(imageBlock.locator('.picture-frame')).toHaveCount(1)
  const capturedImage = imageBlock.locator('img[src^="/local-images/"]')
  await expect(capturedImage).toHaveCount(1)
  await expect(imageBlock.locator('img[src="/logo.png"]')).toHaveCount(0)

  // The public media boundary retains hash, bytes, MIME type and dimensions;
  // Question Content retains only the stable internal media reference.
  const databaseName = await activeExamDatabaseName(page)
  const media = await page.evaluate(async ({ source, databaseName }) => {
    const hash = source.slice('/local-images/'.length)
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<{
        hash: string
        mimeType: string
        byteLength: number
        width: number
        height: number
      } | undefined>((resolve, reject) => {
        const request = database.transaction('media-assets').objectStore('media-assets').get(hash)
        request.onsuccess = () => {
          const asset = request.result
          resolve(asset && { ...asset, byteLength: asset.bytes.byteLength })
        }
        request.onerror = () => reject(request.error)
      })
    } finally {
      database.close()
    }
  }, { source: await capturedImage.getAttribute('src'), databaseName })
  expect(media).toMatchObject({
    hash: (await capturedImage.getAttribute('src'))!.slice('/local-images/'.length),
    mimeType: 'image/png',
  })
  expect(media?.byteLength).toBeGreaterThan(0)
  expect(media?.width).toBeGreaterThan(0)
  expect(media?.height).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Save question' }).click()
  // A panelben született kérdés még nincs a dolgozaton: a sor „Add … to the
  // exam" gombja teszi fel, ahogy a tanár is tenné.
  await page.getByRole('button', { name: /^Add .+ to the exam$/ }).first().click()
  const question = page.locator('.exam-question').first()
  await expect(question.locator('img[src^="/local-images/"]')).toHaveCount(1)
  await expect(question.locator('img[src="/logo.png"]')).toHaveCount(0)

  // Renders after reload from owned storage, independent of the original URL
  // and the retired Cache Storage implementation.
  await page.evaluate(() => caches.delete('crepe-local-images-v1'))
  await page.route('/logo.png', (route) => route.abort())
  await page.reload()
  const reloadedImage = page
    .locator('.exam-question')
    .first()
    .locator('img[src^="/local-images/"]')
  await expect(reloadedImage).toHaveCount(1)
  await expect
    .poll(() =>
      reloadedImage.evaluate(
        (image) => (image as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0)
})

test('identical image bytes share one Media Asset', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  // Új dolgozatban még nincs nyitott kérdésbank, a kérdés aztán születik: a
  // panel előbb bankot kér, és csak utána kínál „Add question" gombot.
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()

  const editor = page.getByRole('dialog', { name: 'Question editor' }).locator('.ProseMirror')
  await editor.locator('> p').first().click()
  await pastePng(editor)
  await pastePng(editor)
  await expect(editor.locator('img[src^="/local-images/"]')).toHaveCount(2)

  const databaseName = await activeExamDatabaseName(page)
  const assetCount = await page.evaluate(async (databaseName) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = database.transaction('media-assets').objectStore('media-assets').count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      database.close()
    }
  }, databaseName)
  expect(assetCount).toBe(1)
})

test('an uncapturable pasted image is visibly unresolved', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  // Új dolgozatban még nincs nyitott kérdésbank, a kérdés aztán születik: a
  // panel előbb bankot kér, és csak utána kínál „Add question" gombot.
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()

  const editor = page.getByRole('dialog', { name: 'Question editor' }).locator('.ProseMirror')
  await editor.locator('> p').first().click()
  await pasteHtmlImage(editor, '<img src="/does-not-exist.png">')
  await expect(editor).toContainText('[Image could not be captured.]')
  await expect(editor.locator('img[src="/does-not-exist.png"]')).toHaveCount(0)
})

test('a nonexistent internal media reference is visibly unresolved', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  // Új dolgozatban még nincs nyitott kérdésbank, a kérdés aztán születik: a
  // panel előbb bankot kér, és csak utána kínál „Add question" gombot.
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()

  const editor = page.getByRole('dialog', { name: 'Question editor' }).locator('.ProseMirror')
  await editor.locator('> p').first().click()
  await pasteHtmlImage(editor, `<img src="/local-images/${'a'.repeat(64)}">`)
  await expect(editor).toContainText('[Image could not be captured.]')
  await expect(editor.locator('img[src^="/local-images/"]')).toHaveCount(0)
})

test('Save waits for a pending successful image capture', async ({ page }) => {
  await page.route('/slow-logo.png', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.fulfill({ path: 'public/logo.png', contentType: 'image/png' })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  // Új dolgozatban még nincs nyitott kérdésbank, a kérdés aztán születik: a
  // panel előbb bankot kér, és csak utána kínál „Add question" gombot.
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()

  const dialog = page.getByRole('dialog', { name: 'Question editor' })
  const editor = dialog.locator('.ProseMirror')
  await editor.locator('> p').first().click()
  await pasteHtmlImage(editor, '<img src="/slow-logo.png">')
  await page.getByRole('button', { name: 'Save question' }).click()
  // A panelben született kérdés még nincs a dolgozaton: a sor „Add … to the
  // exam" gombja teszi fel, ahogy a tanár is tenné.
  await page.getByRole('button', { name: /^Add .+ to the exam$/ }).first().click()
  const question = page.locator('.exam-question').first()
  await expect(question.locator('img[src^="/local-images/"]')).toHaveCount(1)
  await expect(question).not.toContainText('[Image could not be captured.]')
})

test('mixed HTML keeps every image and surrounding text', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  // Új dolgozatban még nincs nyitott kérdésbank, a kérdés aztán születik: a
  // panel előbb bankot kér, és csak utána kínál „Add question" gombot.
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()

  const editor = page.getByRole('dialog', { name: 'Question editor' }).locator('.ProseMirror')
  await editor.locator('> p').first().click()
  await pasteHtmlImage(editor, 'before <img src="/logo.png"> middle <img src="/logo.png"> after')
  await expect(editor).toContainText('before')
  await expect(editor).toContainText('middle')
  await expect(editor).toContainText('after')
  await expect(editor.locator('img[src^="/local-images/"]')).toHaveCount(2)
})

test('copied web images with a clipboard file become a picture block', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  // Új dolgozatban még nincs nyitott kérdésbank, a kérdés aztán születik: a
  // panel előbb bankot kér, és csak utána kínál „Add question" gombot.
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()

  const dialog = page.getByRole('dialog', { name: 'Question editor' })
  const editor = dialog.locator('.ProseMirror')
  await editor.locator('> p').first().click()
  await pasteHtmlImageWithFile(editor, '<img src="/logo.png" alt="Crepe">')

  const imageBlock = editor.locator('.picture-block')
  await expect(imageBlock.locator('img')).toHaveCount(1)
  // A szerkesztő maga nem méretezi a képet (ADR-0050): a méret a lapon állítódik,
  // ezért itt a blokk és a kép megléte a bizonyíték, nem egy fogantyú.
  await expect(imageBlock.locator('.picture-frame')).toHaveCount(1)
})

test('image files paste into answer choices', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Exam' }).first().click()
  // Új dolgozatban még nincs nyitott kérdésbank, a kérdés aztán születik: a
  // panel előbb bankot kér, és csak utána kínál „Add question" gombot.
  await page.getByRole('button', { name: 'New Question Bank' }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.getByRole('menuitem', { name: 'Multiple choice' }).click()

  const dialog = page.getByRole('dialog', { name: 'Question editor' })
  const firstChoice = dialog.locator('.mc-choice-body').first()
  await firstChoice.locator('p').click()
  await pastePng(firstChoice)

  await expect(firstChoice.locator('img[src^="/local-images/"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Save question' }).click()
  // A panelben született kérdés még nincs a dolgozaton: a sor „Add … to the
  // exam" gombja teszi fel, ahogy a tanár is tenné.
  await page.getByRole('button', { name: /^Add .+ to the exam$/ }).first().click()
  const question = page.locator('.exam-question').first()
  await expect(
    question.locator('.choice-body img[src^="/local-images/"]'),
  ).toHaveCount(1)
})
