import { useEffect } from 'react'
import { useT } from '../i18n'
import { TEXT_STEPS, stepTextScale, useTextScale } from './text-scale'

/**
 * A játék szövegméretének állítója (tp#47): két koppintás, `A−` és `A+`.
 *
 * A méretet a `--gq-text` változó hordozza a dokumentum gyökerén, ezért a
 * színpad és a diák lapja ugyanazt a lépcsőt használja; a stíluslap csak a
 * kérdés és a válaszok betűméretét szorozza vele, a váz nem mozdul.
 */
export function TextSizeControl({ className }: { className?: string }) {
  const t = useT()
  const scale = useTextScale()

  useEffect(() => {
    document.documentElement.style.setProperty('--gq-text', String(scale))
  }, [scale])

  const index = TEXT_STEPS.findIndex((step) => Math.abs(step - scale) < 0.001)
  const smallest = index <= 0
  const largest = index >= TEXT_STEPS.length - 1

  return (
    <div className={`gq-textsize${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="gq-textsize-button"
        onClick={() => stepTextScale(-1)}
        disabled={smallest}
        aria-label={t('game.textSize.smaller')}
        title={t('game.textSize.smaller')}
      >
        A−
      </button>
      <output className="gq-textsize-value" aria-label={t('game.textSize.current')}>
        {Math.round(scale * 100)}%
      </output>
      <button
        type="button"
        className="gq-textsize-button"
        onClick={() => stepTextScale(1)}
        disabled={largest}
        aria-label={t('game.textSize.larger')}
        title={t('game.textSize.larger')}
      >
        A+
      </button>
    </div>
  )
}
