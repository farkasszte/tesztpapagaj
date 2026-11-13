import { useEffect, useReducer, useState, type ReactNode } from 'react'
import { DocView } from '../editor/doc-view'
import type { ClassicEngine } from './classic/engine'
import { buildClassicView, type ClassicView } from './classic/views'
import type { PlayableWords } from './projection'
import { bossNameKey, bossOf } from './boss'
import { raceOf, trackPositions } from './race'
import { LETTERS, TINCTURES, useExitOnEscape, useNow, useStageFocusTrap, useStageKeys } from './parts'
import { Letter } from './shapes'
import { PlayerAvatar } from './avatar-view'
import { useT } from '../i18n/index'
import { StageTools } from './stage-tools'
import { DragonGraphic } from './dragon-graphic'

/**
 * A két „másik játék” színpada: Grand Prix és Szörnytámadás.
 *
 * Egyik sem új motor: a **Klasszikus naplója** fut (kérdés, válaszok, felfedés,
 * következő kérdés), és csak a jelentése más — táv a pont helyett, illetve közös
 * szörny-életerő. Ezért a színpad ugyanazt a `ClassicEngine`-t kapja, amit a
 * diák-eszközös út amúgy is használ, a diákok telefonja pedig változatlanul
 * válaszol. A számítás tiszta és tesztelt (`game/race.ts`, `game/boss.ts`).
 */

type StageProps = {
  title: string
  onExit: () => void
  engine: ClassicEngine
  words: Map<string, PlayableWords>
  status?: ReactNode
  hint?: string
}

/** A kérdés és a válaszok — mindkét színpad ugyanezt rajzolja. */
function QuestionBoard({
  view,
  words,
  questionId,
  hint,
  remaining,
  board,
}: {
  view: ClassicView
  words: Map<string, PlayableWords>
  questionId: string | undefined
  hint?: string
  remaining: number
  board: ClassicView['roundTop']
}) {
  const t = useT()
  const question = view.question
  if (!question) return null
  const shown = questionId ? words.get(questionId) : undefined

  return (
    <div className="gq-mode-question">
      <div className="gq-mode-stem">
        {shown ? <DocView content={shown.stem} /> : <span>{question.prompt}</span>}
      </div>
      {board ? (
        <section className="gq-board">
          <p className="gq-board-kicker">{t('game.roundResults.title')}</p>
          <ol className="gq-board-list">
            {board.map((player, index) => (
              <li key={player.nickname}>
                <span className="gq-board-rank">{index + 1}</span>
                <PlayerAvatar seed={player.avatar ?? player.nickname} size={30} />
                <span className="gq-board-name">{player.nickname}</span>
                <span className="gq-board-points">{player.points}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : question.textEntry ? (
        <p className="gq-written-hint">{t('game.mode.textAnswer')}</p>
      ) : shown ? (
        <div className="gq-choices" data-count={shown.choices.length}>
          {shown.choices.map((choiceWords, index) => {
            const right = question.correctChoices
            const order = question.correctOrder
            const state =
              order !== null || question.matching
                ? 'idle'
                : right === null
                  ? 'idle'
                  : right.includes(index)
                    ? 'correct'
                    : 'faded'
            return (
              <div
                key={index}
                className="gq-answer"
                data-state={state}
                data-tint={index}
                style={{ ['--c' as string]: TINCTURES[index] ?? TINCTURES[0] }}
                role="group"
                aria-label={`${LETTERS[index]}: ${question.choices[index] ?? ''}`}
              >
                <Letter letter={LETTERS[index]} />
                <DocView content={choiceWords} />
              </div>
            )
          })}
        </div>
      ) : null}
      <div className="gq-foot">
        <p className="gq-status">
          {view.phase === 'QUESTION' ? (
            <>
              {hint ?? t('game.mode.answerHint')}
              {remaining > 0 ? <span className="gq-mode-clock">{Math.ceil(remaining / 1000)}</span> : null}
            </>
          ) : shown?.explanation ? (
            <DocView content={shown.explanation} />
          ) : null}
        </p>
      </div>
    </div>
  )
}

/** A két színpad közös váza: fejléc, saját tábla, kérdés, léptető gombok. */
function ModeStage({
  nameKey,
  title,
  engine,
  words,
  status,
  hint,
  onExit,
  board,
  outcome,
  isResolved = false,
}: {
  nameKey: string
  title: string
  engine: ClassicEngine
  words: Map<string, PlayableWords>
  status?: ReactNode
  hint?: string
  onExit: () => void
  board: (view: ClassicView) => ReactNode
  outcome?: ReactNode | ((view: ClassicView) => ReactNode)
  isResolved?: boolean
}) {
  const t = useT()
  const trapRef = useStageFocusTrap<HTMLDivElement>()
  const [, bump] = useReducer((count: number) => count + 1, 0)
  const [boardOf, setBoardOf] = useState<number | null>(null)
  const now = useNow()
  useExitOnEscape(onExit)

  const session = engine.session
  const view = buildClassicView(session, { now })
  const roundBoard = boardOf === session.index ? view.roundTop : null
  const act = (run: () => unknown) => {
    run()
    bump()
  }
  useStageKeys({
    next: () => {
      if (view.phase === 'QUESTION') act(() => engine.lock())
      else if (view.phase === 'REVEAL') {
        setBoardOf(null)
        if (isResolved) act(() => engine.endSession())
        else act(() => engine.next())
      }
    },
  })

  // Az óra lejártát a motor veszi észre; itt csak a kép frissül.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (engine.tick()) bump()
    }, 500)
    return () => window.clearInterval(timer)
  }, [engine])

  const remaining =
    session.deadline === null ? 0 : Math.max(0, session.deadline - now)
  const finished = view.phase === 'REPORT' || view.phase === 'ENDED'

  return (
    <div
      className="gq-stage gq-mode-stage"
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label={t(nameKey as never)}
    >
      <div className="gq-stage-bar">
        <span className="gq-mode-left">{status}</span>
        <span className="gq-where">
          <span className="gq-one-name">{title}</span>
          {view.question ? (
            <span className="gq-stat">
              <strong>
                {view.question.number} / {view.question.total}
              </strong>
            </span>
          ) : null}
        </span>
        <span className="gq-bar-end">
          <StageTools />
          <button type="button" className="gq-quiet" onClick={onExit}>
            {t('game.stage.endGame')}
          </button>
        </span>
      </div>

      {board(view)}

      {finished ? (
        <div className="gq-mode-outcome">{typeof outcome === 'function' ? outcome(view) : outcome}</div>
      ) : (
        <>
          <QuestionBoard
            view={view}
            words={words}
            questionId={session.questions[session.index]?.id}
            hint={hint}
            remaining={remaining}
            board={roundBoard}
          />
          {view.phase === 'QUESTION' ? (
            <button type="button" className="gq-go" onClick={() => act(() => engine.lock())}>
              {t('game.stage.showAnswer')}
            </button>
          ) : roundBoard === null && view.roundTop && view.roundTop.length > 0 ? (
            <button type="button" className="gq-go" onClick={() => act(() => setBoardOf(session.index))}>
              {t('game.roundResults.open')}
            </button>
          ) : (
            <button
              type="button"
              className="gq-go"
              onClick={() => {
                setBoardOf(null)
                if (isResolved) act(() => engine.endSession())
                else act(() => engine.next())
              }}
            >
              {isResolved || (view.question && view.question.number >= view.question.total)
                ? t('game.stage.finish')
                : t('game.stage.next')}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** Grand Prix: a pont helyett megtett táv, a gyors válasz nitrót ad. */
export function RaceStage({ title, onExit, engine, words, status, hint }: StageProps) {
  const t = useT()
  const session = engine.session
  const racers = raceOf(session)
  const leader = racers[0]

  return (
    <ModeStage
      nameKey="game.mode.race.name"
      title={title}
      engine={engine}
      words={words}
      status={status}
      hint={hint}
      onExit={onExit}
      board={() => (
        <>
          {/* Egyetlen ovál pálya: a mezőny együtt fut, a hely összemérhető. */}
          <div className="gq-oval" aria-hidden="true">
            <span className="gq-oval-road" />
            <span className="gq-oval-inner" />
            <span className="gq-oval-start" />
            {trackPositions(racers).map((spot) => {
              const anchor = spot.racers[0]
              const many = spot.racers.length > 1
              return (
                <span
                  key={spot.id}
                  className="gq-runner"
                  data-lead={anchor?.place === 1 ? 'yes' : undefined}
                  data-slot={spot.slot}
                  data-count={many ? spot.racers.length : undefined}
                  title={spot.racers.map((one) => one.nickname).join(', ')}
                  style={{
                    left: `${spot.x}%`,
                    top: `${spot.y}%`,
                    background: TINCTURES[((anchor?.place ?? 1) - 1) % TINCTURES.length],
                    zIndex: 100 - (anchor?.place ?? 99),
                  }}
                >
                  <span className="gq-runner-dot">{many ? spot.racers.length : ''}</span>
                  {many ? null : <span className="gq-runner-name">{anchor?.nickname}</span>}
                </span>
              )
            })}
          </div>
          <table className="gq-laptimes" aria-label={t('game.race.standings')}>
            <thead>
              <tr>
                <th scope="col">{t('game.race.place')}</th>
                <th scope="col">{t('game.race.racer')}</th>
                <th scope="col">{t('game.race.bestLap')}</th>
                <th scope="col">{t('game.race.nitroCount', { count: '' })}</th>
              </tr>
            </thead>
            <tbody>
              {racers.map((racer) => (
                <tr key={racer.id} data-lead={racer.place === 1 ? 'yes' : undefined}>
                  <td className="gq-lap-place">{racer.place}.</td>
                  <td className="gq-lap-name">{racer.nickname}</td>
                  <td className="gq-lap-time">
                    {racer.bestMs === null
                      ? t('game.race.noLap')
                      : t('game.race.seconds', {
                          seconds: (racer.bestMs / 1000).toFixed(1).replace('.', ','),
                        })}
                  </td>
                  <td className="gq-lap-marks">
                    {racer.nitro > 0 ? (
                      <span className="gq-lap-nitro" title={t('game.race.nitroCount', { count: racer.nitro })}>
                        {racer.nitro}
                      </span>
                    ) : null}
                    {racer.spunOut > 0 ? (
                      <span className="gq-lap-spin" title={t('game.race.spinCount', { count: racer.spunOut })}>
                        !
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      outcome={
        leader ? (
          <>
            <h2 className="gq-big">{t('game.race.winner', { name: leader.nickname })}</h2>
            {/* Dobogó: a legjobb három, a holtversenyesek azonos fokon. */}
            <ol className="gq-podium" aria-label={t('game.race.standings')}>
              {[1, 0, 2].map((order) => {
                const racer = racers[order]
                if (!racer) return null
                const tied = racers.filter((one) => one.place === racer.place).length > 1
                return (
                  <li
                    key={racer.id}
                    className="gq-podium-step"
                    data-place={racer.place}
                    data-tied={tied ? 'yes' : undefined}
                  >
                    <span className="gq-podium-name">{racer.nickname}</span>
                    <span className="gq-podium-height">
                      <span className="gq-podium-place">{racer.place}</span>
                    </span>
                    <span className="gq-podium-meters">
                      {racer.bestMs === null
                        ? t('game.race.noLap')
                        : t('game.race.seconds', {
                            seconds: (racer.bestMs / 1000).toFixed(1).replace('.', ','),
                          })}
                    </span>
                  </li>
                )
              })}
            </ol>
          </>
        ) : (
          <p className="gq-lead">{t('game.mode.noPlayers')}</p>
        )
      }
    />
  )
}

/** Sárkányok völgye: a sárkány életereje és az osztály pajzsa. */
export function BossStage({ title, onExit, engine, words, status, hint }: StageProps) {
  const t = useT()
  const session = engine.session
  const state = bossOf(session)
  const isResolved = state.outcome === 'win' || state.outcome === 'lose'

  return (
    <ModeStage
      nameKey="game.mode.boss.name"
      title={title}
      engine={engine}
      words={words}
      status={status}
      hint={hint}
      onExit={onExit}
      isResolved={isResolved}
      board={() => (
        <div
          className="gq-boss"
          data-kind={state.kind}
          data-tier={state.tier}
          data-enraged={state.enraged ? 'yes' : 'no'}
        >
          <div className="gq-boss-avatar-frame">
            <DragonGraphic
              tier={state.tier}
              enraged={state.enraged}
              hp={state.hp}
              outcome={state.outcome}
            />
          </div>
          <div className="gq-boss-info">
            <div className="gq-boss-head">
              <span className="gq-boss-name">{t(bossNameKey(state.tier) as never)}</span>
              <span className="gq-boss-hp">
                {state.hp} / {state.maxHp}
              </span>
            </div>
            <div className="gq-boss-bar" role="progressbar" aria-valuenow={state.hp} aria-valuemin={0} aria-valuemax={state.maxHp}>
              <span className="gq-boss-fill" style={{ width: `${(state.hp / state.maxHp) * 100}%` }} />
            </div>
            <div className="gq-boss-shield" aria-label={t('game.boss.shield')}>
              <span className="gq-boss-shield-label">{t('game.boss.shield')}</span>
              <div className="gq-boss-pips">
                {Array.from({ length: Math.round(state.maxShield / 10) }, (_, index) => {
                  const intact = index < state.shield / 10
                  return (
                    <span
                      key={index}
                      className="gq-boss-pip"
                      data-on={intact ? 'yes' : 'no'}
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 24 28" className="gq-boss-shield-svg">
                        <path
                          className="gq-boss-shield-body"
                          d="M12 1.5L22 5.2V13.2C22 19.6 17.6 24.4 12 26.5C6.4 24.4 2 19.6 2 13.2V5.2L12 1.5Z"
                        />
                        {intact ? (
                          <path
                            className="gq-boss-shield-crest"
                            d="M12 4.5V23.3M5.5 9.2L12 6.8L18.5 9.2"
                          />
                        ) : (
                          <path
                            className="gq-boss-shield-crack"
                            d="M13.5 4.2L9.8 11.4L14.2 14.4L10.4 22.8"
                          />
                        )}
                      </svg>
                    </span>
                  )
                })}
              </div>
              <span className="gq-boss-bites">{t('game.boss.hits', { hits: state.hits, bites: state.bites })}</span>
            </div>
          </div>
        </div>
      )}
      outcome={(view) => (
        <div className="gq-boss-outcome-wrap">
          <div className="gq-boss-outcome-avatar">
            <DragonGraphic
              tier={state.tier}
              enraged={false}
              hp={state.hp}
              outcome={state.outcome}
            />
          </div>
          {state.outcome === 'win' ? (
            <h2 className="gq-big">{t('game.boss.won')}</h2>
          ) : state.outcome === 'lose' ? (
            <h2 className="gq-big">{t('game.boss.lost')}</h2>
          ) : (
            // A küldetés úgy ért véget, hogy a sárkány életben maradt, de a pajzs
            // is: ez nem döntetlen, hanem kitartás.
            <h2 className="gq-big">{t('game.boss.survived')}</h2>
          )}
          {session.settings.roundResults && view.report && view.report.students.length > 0 ? (
            <div className="gq-report-wrap">
              <h3 className="gq-report-title">{t('game.devices.report')}</h3>
              <ol className="gq-report">
                {[...view.report.students]
                  .sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname))
                  .slice(0, 8)
                  .map((student, index) => (
                    <li key={student.nickname}>
                      <span className="gq-report-rank">{index + 1}</span>
                      <span className="gq-report-name">{student.nickname}</span>
                      <span className="gq-report-right">
                        {t('game.devices.reportRight', { right: student.correct, asked: student.answered })}
                      </span>
                      <span className="gq-report-points">{student.points}</span>
                    </li>
                  ))}
              </ol>
            </div>
          ) : null}
        </div>
      )}
    />
  )
}
