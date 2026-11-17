// What a picker's search box matches.
//
// The picker lists every Question Bank (or every Exam) a teacher has, and the
// list grows into a scroll of similar names. The box narrows it by name, and by
// name as a teacher types it: Hungarian is full of accents a keyboard may not
// offer at speed, so `tunder` has to find "Tündér és legendamesék", and `Mozgas`
// has to find "Mozgásfejlődés (új)".

/** A name or a query folded to what the two are compared as: no accents, no
 *  case, and every run of spaces as one. */
export function foldedName(value: string): string {
  return value
    .normalize('NFKD')
    // The combining marks NFKD splits an accented letter into: á → a + ́.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whether a name answers a query. An empty query answers everything, which is
 *  what an unsought picker shows. */
export function nameMatches(name: string, query: string): boolean {
  const needle = foldedName(query)
  return needle === '' || foldedName(name).includes(needle)
}
