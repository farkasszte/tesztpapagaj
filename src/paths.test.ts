import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fixturePath, projectRoot, publicPath, srcPath } from './paths'

const SRC = srcPath()

function sourceFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) found.push(path)
  }
  return found
}

describe('a projekt gyökere', () => {
  test('felismerhető, és a három útvonal oda mutat, ahová kell', () => {
    expect(readFileSync(join(projectRoot(), 'package.json'), 'utf8').length).toBeGreaterThan(0)
    expect(srcPath('paths.ts')).toBe(join(projectRoot(), 'src', 'paths.ts'))
    expect(publicPath('fonts', 'FreeSerif.ttf')).toBe(join(projectRoot(), 'public', 'fonts', 'FreeSerif.ttf'))
    expect(fixturePath('aiken')).toBe(join(projectRoot(), 'fixtures', 'aiken'))
  })

  test('a próbaanyagok a gyökérben vannak, nem a forrás mellett', () => {
    expect(readdirSync(fixturePath()).length).toBeGreaterThan(0)
  })
})

describe('a forrás nem függ a saját helyétől', () => {
  test('egyetlen fájl sem nyit meg útvonalat az `import.meta.url`-höz képest', () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => !path.endsWith('paths.ts'))
      .filter((path) => /new URL\(\s*['"`]\.\.?\//.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(projectRoot().length + 1).replaceAll('\\', '/'))

    // Aki ide kerül: a fájl a saját helyéhez képest nyit meg fájlt, ezért
    // bármelyik mozgatás csendben eltörné. Használja a `paths.ts` segédeit.
    expect(offenders).toEqual([])
  })
})
