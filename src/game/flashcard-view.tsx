import { useEffect, useMemo, useRef, useState } from 'react'
import { DocView } from '../editor/doc-view'
import type { Flashcard } from './flashcard'
import type { PlayableWords } from './projection'
import { useExitOnEscape, useStageFocusTrap } from './parts'
import { useT } from '../i18n/index'

/**
 * Tanulókártya — kártyás ismétlés a bankból.
 *
 * A Zsírkréta `FlashcardViewer`-ének a mintája: elől a kérdés, hátul a helyes
 * válasz és a magyarázat. Nincs pont, nincs idő, nincs szoba: a tanár kivetíti,
 * vagy a diák a saját eszközén átfutja. A kártya koppintásra (vagy szóközre)
 * fordul, a nyilak lapoznak, a keverés és az automatikus lejátszás a fejlécben
 * állítható.
 */

/** Az automatikus lejátszás ütemei, másodpercben; a 0 a kikapcsolt állapot. */
const PLAY_STEPS = [0, 5, 10, 20] as const

export function FlashcardDeck({
  title,
  cards,
  words,
  onExit,
}: {
  title: string
  /** A pakli kártyái — a bank kérdéseiből vagy a diák hibalistájából. */
  cards: readonly Flashcard[]
  /** A szövegek Rich Textje, ha van (a játékból indítva); a hibalistánál nincs. */
  words?: Map<string, PlayableWords>
  onExit: () => void
}) {
  const t = useT()
  const trapRef = useStageFocusTrap<HTMLDivElement>()
  useExitOnEscape(onExit)

  const [leitnerMode, setLeitnerMode] = useState(true)
  const storageKey = `tesztpapagaj:leitner:${title}`

  const [boxMap, setBoxMap] = useState<Record<string, 1 | 2 | 3>>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved) as Record<string, 1 | 2 | 3>
    } catch {
      // ignore
    }
    return {}
  })

  // Mentés a böngésző tárolójába
  const updateBox = (cardId: string, level: 1 | 2 | 3) => {
    setBoxMap((prev) => {
      const next = { ...prev, [cardId]: level }
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const resetBoxes = () => {
    const fresh: Record<string, 1 | 2 | 3> = {}
    cards.forEach((c) => {
      fresh[c.id] = 1
    })
    setBoxMap(fresh)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
    setIndex(0)
    setFlipped(false)
  }

  const box1 = useMemo(() => cards.filter((c) => (boxMap[c.id] ?? 1) === 1), [cards, boxMap])
  const box2 = useMemo(() => cards.filter((c) => boxMap[c.id] === 2), [cards, boxMap])
  const box3 = useMemo(() => cards.filter((c) => boxMap[c.id] === 3), [cards, boxMap])

  // Leitner-módban az 1. és 2. dobozban lévő kártyákat gyakoroljuk, megőrizve a sorrendet
  const activeDeck = useMemo(() => {
    if (!leitnerMode) return [...cards]
    const learning = cards.filter((c) => (boxMap[c.id] ?? 1) < 3)
    return learning.length > 0 ? learning : [...cards]
  }, [cards, boxMap, leitnerMode])

  const [order, setOrder] = useState<Flashcard[]>(activeDeck)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [step, setStep] = useState<number>(0)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    setOrder((current) => {
      const activeIds = new Set(activeDeck.map((c) => c.id))
      const filtered = current.filter((c) => activeIds.has(c.id))
      return filtered.length > 0 ? filtered : activeDeck
    })
    setIndex((current) => (current < activeDeck.length ? current : 0))
  }, [activeDeck])

  const allMastered = leitnerMode && cards.length > 0 && box3.length === cards.length
  const card = order[index]
  const cardLevel = card ? boxMap[card.id] ?? 1 : 1

  const cardRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true })
  }, [index, allMastered])

  const go = (delta: number) => {
    if (order.length === 0) return
    setFlipped(false)
    setIndex((current) => (current + delta + order.length) % order.length)
  }

  const handleFail = () => {
    if (!card) return
    updateBox(card.id, 1)
    setFlipped(false)
    if (order.length > 1) {
      setIndex((current) => (current + 1) % order.length)
    }
  }

  const handlePass = () => {
    if (!card) return
    const nextLevel = cardLevel === 1 ? 2 : 3
    updateBox(card.id, nextLevel)
    setFlipped(false)
    if (order.length > 1) {
      setIndex((current) => (current + 1) % order.length)
    }
  }

  const shuffle = () => {
    setOrder((current) => {
      const next = [...current]
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[next[i], next[j]] = [next[j], next[i]]
      }
      return next
    })
    setIndex(0)
    setFlipped(false)
  }

  // Az automatikus lejátszás: előbb megfordít, aztán lapoz — mint egy vetítés.
  useEffect(() => {
    if (step === 0 || order.length === 0) return
    timer.current = window.setInterval(() => {
      setFlipped((open) => {
        if (!open) return true
        setIndex((current) => (current + 1) % order.length)
        return false
      })
    }, step * 1000)
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current)
      timer.current = null
    }
  }, [step, order.length])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        // Gombon a böngésző maga aktivál (a kártya fordul); a mezőkben gépelni kell.
        if (
          event.target instanceof HTMLButtonElement ||
          event.target instanceof HTMLSelectElement ||
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement
        ) {
          return
        }
        event.preventDefault()
        setFlipped((open) => !open)
      } else if (event.key === '1' && flipped && leitnerMode) {
        event.preventDefault()
        handleFail()
      } else if (event.key === '2' && flipped && leitnerMode) {
        event.preventDefault()
        handlePass()
      } else if (event.key === 'ArrowRight') {
        go(1)
      } else if (event.key === 'ArrowLeft') {
        go(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const rich = card && words ? words.get(card.id) : undefined

  return (
    <div className="gq-stage gq-cards" ref={trapRef} role="dialog" aria-modal="true" aria-label={t('game.mode.flashcard.name')}>
      <div className="gq-stage-bar">
        <span className="gq-pin">{t('game.mode.flashcard.name')}</span>
        <span className="gq-where">
          <span>{title}</span>
          <span className="gq-stat">
            <strong>
              {order.length === 0 ? 0 : index + 1} / {order.length}
            </strong>
          </span>
          {leitnerMode && (
            <span className="gq-leitner-boxes" aria-label={t('game.flashcard.leitnerMode')}>
              <span className="gq-leitner-box gq-leitner-box--1" title={t('game.flashcard.box1')}>
                {t('game.flashcard.box1Short')}: {box1.length}
              </span>
              <span className="gq-leitner-box gq-leitner-box--2" title={t('game.flashcard.box2')}>
                {t('game.flashcard.box2Short')}: {box2.length}
              </span>
              <span className="gq-leitner-box gq-leitner-box--3" title={t('game.flashcard.box3')}>
                {t('game.flashcard.box3Short')}: {box3.length}
              </span>
            </span>
          )}
        </span>
        <button type="button" className="gq-quiet" onClick={onExit}>
          {t('game.stage.endGame')}
        </button>
      </div>

      {allMastered ? (
        <div className="gq-leitner-finished" role="region" aria-label={t('game.flashcard.finishedTitle')}>
          <div style={{ fontSize: 54 }}>🏆</div>
          <h2>{t('game.flashcard.finishedTitle')}</h2>
          <p>{t('game.flashcard.finishedSubtitle')}</p>
          <button type="button" className="gq-go" onClick={resetBoxes}>
            {t('game.flashcard.restart')}
          </button>
        </div>
      ) : card ? (
        <>
          <button
            type="button"
            ref={cardRef}
            className="gq-card"
            data-flipped={flipped ? 'yes' : 'no'}
            aria-label={flipped ? t('game.flashcard.back') : t('game.flashcard.front')}
            onClick={() => setFlipped((open) => !open)}
          >
            <div className="gq-card-header-row">
              <span className="gq-card-side">{t(flipped ? 'game.flashcard.back' : 'game.flashcard.front')}</span>
              {leitnerMode && (
                <span className={`gq-card-box-badge gq-card-box-badge--${cardLevel}`}>
                  {t(`game.flashcard.box${cardLevel}Short` as never)}
                </span>
              )}
            </div>
            {flipped ? (
              <span className="gq-card-body">
                <span className="gq-card-answer">
                  {card.answers.map((answer) => (
                    <span key={answer} className="gq-card-answer-line">
                      {answer}
                    </span>
                  ))}
                </span>
                {card.explanation ? <span className="gq-card-why">{card.explanation}</span> : null}
              </span>
            ) : (
              <span className="gq-card-body">
                {rich ? (
                  <span className="gq-card-stem">
                    <DocView content={rich.stem} />
                  </span>
                ) : (
                  <span className="gq-card-stem">{card.prompt}</span>
                )}
                <span className="gq-card-hint">{t('game.flashcard.flipHint')}</span>
              </span>
            )}
          </button>

          {flipped && leitnerMode && (
            <div className="gq-leitner-actions">
              <button
                type="button"
                className="gq-leitner-btn gq-leitner-btn--fail"
                onClick={handleFail}
              >
                ✕ {t('game.flashcard.didNotKnow')}
              </button>
              <button
                type="button"
                className="gq-leitner-btn gq-leitner-btn--pass"
                onClick={handlePass}
              >
                ✓ {t('game.flashcard.knewIt')}
              </button>
            </div>
          )}

          <div className="gq-card-nav">
            <button type="button" className="gq-quiet" onClick={() => go(-1)} disabled={order.length < 2}>
              ← {t('game.flashcard.previous')}
            </button>
            <button type="button" className="gq-go" onClick={() => setFlipped((open) => !open)}>
              {t(flipped ? 'game.flashcard.front' : 'game.flashcard.flip')}
            </button>
            <button type="button" className="gq-quiet" onClick={() => go(1)} disabled={order.length < 2}>
              {t('game.flashcard.next')} →
            </button>
          </div>
        </>
      ) : (
        <p className="gq-lead">{t('game.flashcard.empty')}</p>
      )}

      <div className="gq-card-tools gq-card-tools-bottom">
        <button
          type="button"
          className="gq-quiet"
          onClick={() => {
            setLeitnerMode((prev) => !prev)
            setIndex(0)
            setFlipped(false)
          }}
        >
          {leitnerMode ? t('game.flashcard.freeMode') : t('game.flashcard.leitnerMode')}
        </button>
        {leitnerMode && (
          <button
            type="button"
            className="gq-quiet"
            onClick={resetBoxes}
            title={t('game.flashcard.resetProgress')}
          >
            {t('game.flashcard.resetProgress')}
          </button>
        )}
        <button type="button" className="gq-quiet" onClick={shuffle} disabled={order.length < 2}>
          {t('game.flashcard.shuffle')}
        </button>
        <label className="gq-card-speed">
          {t('game.flashcard.autoPlay')}
          <select
            className="gq-input gq-input-small"
            value={step}
            onChange={(event) => setStep(Number(event.target.value))}
          >
            {PLAY_STEPS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds === 0 ? t('game.flashcard.off') : t('game.flashcard.seconds', { n: seconds })}
              </option>
            ))}
          </select>
        </label>
      </div>

    </div>
  )
}
