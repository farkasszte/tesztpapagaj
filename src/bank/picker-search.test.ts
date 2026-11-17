// The picker's search box, held to the way a teacher types a Hungarian name.
import { describe, expect, test } from 'bun:test'
import { foldedName, nameMatches } from './picker-search'

describe('the picker’s search', () => {
  test('finds a name without its accents', () => {
    expect(nameMatches('Tündér és legendamesék', 'tunder')).toBe(true)
    expect(nameMatches('Mozgásfejlődés (új)', 'mozgasfejlodes')).toBe(true)
    expect(nameMatches('Őrzés és űr, árvíztűrő', 'orzes es ur, arvizturo')).toBe(true)
  })

  test('ignores case and runs of spaces', () => {
    expect(nameMatches('Mentálhigiéné 1.', '  MENTAL  ')).toBe(true)
    expect(nameMatches('Gondolkodás_intelligencia_26', 'gondolkodas')).toBe(true)
  })

  test('matches anywhere in the name, not only at its start', () => {
    expect(nameMatches('Társadalomtudomány vizsgára 1', 'vizsgara')).toBe(true)
  })

  test('leaves a name that does not hold the query out', () => {
    expect(nameMatches('Érzéki csalódások, konstanciák', 'legenda')).toBe(false)
    expect(nameMatches('Játékped1 (művelet+szerep)', 'jatekped2')).toBe(false)
  })

  test('shows everything while nothing is asked', () => {
    expect(nameMatches('Bármi', '')).toBe(true)
    expect(nameMatches('Bármi', '   ')).toBe(true)
    expect(foldedName('  Két   szó ')).toBe('ket szo')
  })
})
