/**
 * A válaszkártya hangvétele: a saját válasz, a helyes, a téves, vagy semmi.
 *
 * Külön fájlban, mert a `game-student-blocks.tsx` komponenst exportál — a Fast
 * Refresh csak komponenseket fogad el egy fájlban.
 */
export function choiceTone({
  index,
  correctIndex,
  picked,
}: {
  index: number
  correctIndex: number | null
  picked: boolean
}): 'idle' | 'picked' | 'correct' | 'wrong' | 'faded' {
  if (correctIndex === null) return picked ? 'picked' : 'idle'
  if (index === correctIndex) return 'correct'
  return picked ? 'wrong' : 'faded'
}
