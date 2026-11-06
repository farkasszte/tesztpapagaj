import { useEffect, useReducer, useState } from 'react'
import { useT } from '../../i18n'
import type { ClassicEngine } from '../classic/engine'
import { buildClassicView } from '../classic/views'
import { mergeRanks, type Side } from './pair'
import { TextSizeControl } from '../text-size'
import { useStageFocusTrap } from '../parts'

/**
 * A differenciált kvíz színpada (tp#45): a két bank kérdése egyszerre, bal és
 * jobb oldalon. A kör közös — a tanár egy gombbal lépteti mindkét oldalt —, a
 * ponttábla is közös: a két oldal játékosai egy listában állnak.
 */
export function SplitStage({
  engines,
  names,
  onExit,
}: {
  engines: { a: ClassicEngine; b: ClassicEngine }
  names: { a: string; b: string }
  onExit: () => void
}) {
  const t = useT()
  const trapRef = useStageFocusTrap<HTMLDivElement>()
  const [, bump] = useReducer((count: number) => count + 1, 0)
  // A lobbi indítja a két motort, ezért a színpad már futva nyílik meg.
  const [started, setStarted] = useState(() => engines.a.session.phase !== 'LOBBY')

  // A közös idő: mindkét oldal óráját ugyanebben az ütemben léptetjük, tehát
  // a két oldal sosem csúszik el egymástól.
  useEffect(() => {
    if (!started) return
    const timer = setInterval(() => {
      const a = engines.a.tick()
      const b = engines.b.tick()
      if (a || b) bump()
    }, 400)
    return () => clearInterval(timer)
  }, [engines, started])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const left = engines.a.session
  const right = engines.b.session
  const players = mergeRanks([
    ...left.players.map((player) => ({ ...player, side: 'a' as Side })),
    ...right.players.map((player) => ({ ...player, side: 'b' as Side })),
  ])
  const phase = left.phase

  const step = (run: () => void) => {
    run()
    bump()
  }

  return (
    <div className="gq-stage gq-split" ref={trapRef} role="dialog" aria-modal="true" aria-label={t('game.mode.split.name')}>
      <div className="gq-stage-bar">
        <span className="gq-pin">{left.title}</span>
        <span className="gq-players">{t('game.devices.joined', { count: players.filter((p) => p.connected).length })}</span>
      </div>

      <div className="gq-split-panels">
        {(['a', 'b'] as const).map((side) => {
          const engine = engines[side]
          const view = buildClassicView(engine.session, { now: Date.now() })
          const question = view.question
          return (
            <section key={side} className="gq-split-panel" data-side={side}>
              <h2 className="gq-split-name">{names[side]}</h2>
              {question ? (
                <>
                  <p className="gq-split-count">
                    {t('game.split.round', { number: question.number, total: question.total })}
                  </p>
                  <p className="gq-split-prompt">{question.prompt}</p>
                  <ol className="gq-split-answers">
                    {question.choices.map((choice, index) => {
                      const right =
                        view.phase === 'REVEAL' &&
                        (question.correctChoices ?? (question.correct === null ? [] : [question.correct])).includes(index)
                      return (
                        <li key={index} className="gq-split-answer" data-right={right ? 'true' : undefined}>
                          <span className="gq-split-letter">{'ABCD'[index] ?? index + 1}</span>
                          <span>{choice}</span>
                        </li>
                      )
                    })}
                  </ol>
                  <p className="gq-split-answered">
                    {t('game.devices.answered', {
                      answered: question.answered,
                      answering: question.answering,
                    })}
                  </p>
                </>
              ) : (
                <p className="gq-hint">{t('game.split.waiting')}</p>
              )}
            </section>
          )
        })}
      </div>

      <ol className="gq-split-board" aria-label={t('game.split.board')}>
        {players.map((player) => (
          <li key={player.id} className="gq-split-row" data-side={player.side}>
            <span className="gq-split-row-name">{player.nickname}</span>
            <span className="gq-split-row-side">{names[player.side]}</span>
            <span className="gq-split-row-points">{player.points}</span>
          </li>
        ))}
      </ol>

      <div className="gq-foot">
        {!started ? (
          <button
            type="button"
            className="gq-go"
            onClick={() =>
              step(() => {
                engines.a.start()
                engines.b.start()
                setStarted(true)
              })
            }
          >
            {t('game.split.start')}
          </button>
        ) : phase === 'QUESTION' ? (
          <button
            type="button"
            className="gq-go"
            onClick={() =>
              step(() => {
                engines.a.lock()
                engines.b.lock()
              })
            }
          >
            {t('game.stage.showAnswer')}
          </button>
        ) : phase === 'REVEAL' ? (
          <button
            type="button"
            className="gq-go"
            onClick={() =>
              step(() => {
                engines.a.next()
                engines.b.next()
              })
            }
          >
            {t('game.split.next')}
          </button>
        ) : (
          <button type="button" className="gq-go" onClick={onExit}>
            {t('game.split.finish')}
          </button>
        )}
        <button type="button" className="gq-later" onClick={onExit}>
          {t('game.devices.back')}
        </button>
      </div>
      <TextSizeControl />
    </div>
  )
}
