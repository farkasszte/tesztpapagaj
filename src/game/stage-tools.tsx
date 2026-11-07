import { AmbientMusicControl } from './ambient-music'
import { TextSizeControl } from './text-size'

/**
 * A színpadi eszközök egységes, egybeépített sávja: zene és betűméret-állítás.
 *
 * Egyetlen összefüggő vezérlődobozba fűzi a hangerőt és a szövegméretet,
 * a játék aréna/arany szegélyes stílusához igazítva a fejléc többi elemével.
 */
export function StageTools({ className = '' }: { className?: string }) {
  return (
    <span className={`gq-stage-tools${className ? ` ${className}` : ''}`} role="group">
      <AmbientMusicControl />
      <span className="gq-stage-tools-sep" aria-hidden="true" />
      <TextSizeControl className="gq-textsize-stage" />
    </span>
  )
}

