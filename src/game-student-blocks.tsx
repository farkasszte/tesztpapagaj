import { DocView } from './doc-view'
import { toProse, type RichText } from './game/rich-text'

/**
 * Egy kérdés szavai a telefonon: a formázott változat, ha van, különben a sima
 * szöveg. A `DocView` rajzolja a matekot és a képeket pontosan úgy, ahogy a
 * színpadon — a diák ugyanazt látja, amit a tanár kivetít.
 */
export function StudentBlocks({ rich, plain }: { rich: RichText | undefined; plain: string }) {
  if (rich && rich.length > 0) {
    const document = toProse(rich)
    const content = (document.content ?? []) as never[]
    if (content.length > 0) return <DocView content={content} />
  }
  return <p>{plain}</p>
}
