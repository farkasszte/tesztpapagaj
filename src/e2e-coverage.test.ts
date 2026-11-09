import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectRoot } from './paths'

/**
 * Őr a mérések fölött: minden `scripts/*.e2e.ts` vagy a **gyors** készletben
 * van (`bun run test:e2e:fast`), vagy itt, indoklással. Így egy új mérés nem
 * tud csendben a készleten kívül maradni — ami a legkönnyebben elfelejthető
 * dolog, és pont a legfrissebb kódot hagyná őrizetlenül.
 *
 * A lista nem ítélet: a teljes csomag (`bunx playwright test`) mindet futtatja.
 * A gyors készlet az, amit egy kör végén megfizethető megvárni.
 */

const root = projectRoot()

function loadFast(): Set<string> {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const line = pkg.scripts['test:e2e:fast'] ?? ''
  return new Set(
    line
      .split(/\s+/)
      .filter((part) => part.endsWith('.e2e.ts'))
      .map((part) => part.replace(/^scripts\//, '')),
  )
}

/**
 * Ami a gyors készletből kimarad. Többnyire hosszú, dokumentum-orientált utak
 * (import, szerkesztő, formázás) vagy olyan mérések, amelyek külső szolgáltatást
 * (Google Drive, valódi relay) igényelnek.
 */
const NOT_FAST = new Set([
  'account-backup.e2e.ts',
  'answer-columns.e2e.ts',
  'answer-placeholder.e2e.ts',
  'bulk-column-format-regression.e2e.ts',
  'canonical-question-indexeddb.e2e.ts',
  'canonical-question-propagation.e2e.ts',
  'convert-page.e2e.ts',
  'empty-exam.e2e.ts',
  'exam-workspaces.e2e.ts',
  'export-dialog.e2e.ts',
  'home-table.e2e.ts',
  'hungarian-ui.e2e.ts',
  'indexeddb-authoring.e2e.ts',
  'layout-spacing-regression.e2e.ts',
  'multipart.e2e.ts',
  'multiple-exams.e2e.ts',
  'multiple-question-banks.e2e.ts',
  'page-header.e2e.ts',
  'pasted-images.e2e.ts',
  'pending-images.e2e.ts',
  'probe-avatar.e2e.ts',
  'probe-classic.e2e.ts',
  'probe-offline.e2e.ts',
  'probe-oval.e2e.ts',
  'probe-split.e2e.ts',
  'question-bank-browsing.e2e.ts',
  'question-bank-drag.e2e.ts',
  'question-bank-export.e2e.ts',
  'question-bank-import.e2e.ts',
  'question-bank-tabs.e2e.ts',
  'question-bank.e2e.ts',
  'question-deletion.e2e.ts',
  'question-metadata.e2e.ts',
  'resource-collections.e2e.ts',
  'script-formatting.e2e.ts',
  'section-headings.e2e.ts',
  'selection-regression.e2e.ts',
  'shuffle-answer-order.e2e.ts',
  'shuffle-question-order.e2e.ts',
  'slash-menu.e2e.ts',
  'student-bank-update.e2e.ts',
  'text-arrows.e2e.ts',
  'type-size.e2e.ts',
  'whitespace-regression.e2e.ts',
  'work-space.e2e.ts',
  'working-copy-navigation.e2e.ts',
  'working-copy.e2e.ts',
  'workspace-layout.e2e.ts',
  'workspace-shortcuts.e2e.ts',
])

describe('e2e készlet', () => {
  const specs = readdirSync(join(root, 'scripts')).filter((name) => name.endsWith('.e2e.ts'))
  const fast = loadFast()

  it('minden mérés vagy a gyors készletben van, vagy a kimaradók listáján', () => {
    const unclassified = specs.filter((name) => !fast.has(name) && !NOT_FAST.has(name))
    expect(unclassified).toEqual([])
  })

  it('a gyors készlet és a kimaradók listája nem fedi egymást', () => {
    const both = [...fast].filter((name) => NOT_FAST.has(name))
    expect(both).toEqual([])
  })

  it('a listákban nincs olyan fájl, ami nem létezik', () => {
    const known = new Set(specs)
    const missing = [...fast, ...NOT_FAST].filter((name) => !known.has(name))
    expect(missing).toEqual([])
  })

  it('minden mérés pontosan egy helyen szerepel', () => {
    expect(fast.size + NOT_FAST.size).toBe(specs.length)
  })
})
