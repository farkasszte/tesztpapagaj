/**
 * A válaszkártya hangvétele: a saját válasz, a helyes, a téves, vagy semmi.
 *
 * Külön fájlban, mert a `student-blocks.tsx` komponenst exportál — a Fast
 * Refresh csak komponenseket fogad el egy fájlban.
 */
/** A helyes válaszok betűi, ahogy a diáknak kiírjuk: több helyes válasznál
 *  mindegyik („C, D"), nem csak az első — különben a téves válasz indoklása
 *  félrevezet. */
export function rightLetters(indexes: readonly number[]): string {
  return indexes
    .filter((index) => index >= 0 && index < 4)
    .sort((a, b) => a - b)
    .map((index) => 'ABCD'[index])
    .join(', ');
}

export function choiceTone({
  index,
  correctIndexes,
  picked,
}: {
  index: number
  /** Every right choice once the answer shows; null while it is still hidden. */
  correctIndexes: readonly number[] | null
  picked: boolean
}): 'idle' | 'picked' | 'correct' | 'wrong' | 'faded' {
  if (correctIndexes === null) return picked ? 'picked' : 'idle'
  if (correctIndexes.includes(index)) return 'correct'
  return picked ? 'wrong' : 'faded'
}
