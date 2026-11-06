import { useEffect, useReducer, type ReactNode } from 'react'
import { DocView } from '../editor/doc-view'
import type { ClassicEngine } from './classic/engine'
import { buildClassicView, type ClassicView } from './classic/views'
import type { PlayableWords } from './projection'
import { bossNameKey, bossOf } from './boss'
import { raceOf, trackPositions } from './race'
import { LETTERS, TINCTURES, useExitOnEscape, useNow, useStageFocusTrap, useStageKeys } from './parts'
import { Letter } from './shapes'
import { useT } from '../i18n/index'
import { TextSizeControl } from './text-size'

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
}: {
  view: ClassicView
  words: Map<string, PlayableWords>
  questionId: string | undefined
  hint?: string
  remaining: number
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
      {question.textEntry ? (
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
}: {
  nameKey: string
  title: string
  engine: ClassicEngine
  words: Map<string, PlayableWords>
  status?: ReactNode
  hint?: string
  onExit: () => void
  board: (view: ClassicView) => ReactNode
  outcome?: ReactNode
}) {
  const t = useT()
  const trapRef = useStageFocusTrap<HTMLDivElement>()
  const [, bump] = useReducer((count: number) => count + 1, 0)
  const now = useNow()
  useExitOnEscape(onExit)

  const session = engine.session
  const view = buildClassicView(session, { now })
  const act = (run: () => unknown) => {
    run()
    bump()
  }
  useStageKeys({
    next: () => {
      if (view.phase === 'QUESTION') act(() => engine.lock())
      else if (view.phase === 'REVEAL') act(() => engine.next())
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
      <TextSizeControl className="gq-textsize-stage" />
        <span className="gq-mode-left">{status}</span>
        <span className="gq-where">
          <span>{title}</span>
          {view.question ? (
            <span className="gq-stat">
              <strong>
                {view.question.number} / {view.question.total}
              </strong>
            </span>
          ) : null}
        </span>
        <button type="button" className="gq-quiet" onClick={onExit}>
          {t('game.stage.endGame')}
        </button>
      </div>

      {board(view)}

      {finished ? (
        <div className="gq-mode-outcome">{outcome}</div>
      ) : (
        <>
          <QuestionBoard
            view={view}
            words={words}
            questionId={session.questions[session.index]?.id}
            hint={hint}
            remaining={remaining}
          />
          {view.phase === 'QUESTION' ? (
            <button type="button" className="gq-go" onClick={() => act(() => engine.lock())}>
              {t('game.stage.showAnswer')}
            </button>
          ) : (
            <button
              type="button"
              className="gq-go"
              onClick={() => act(() => engine.next())}
            >
              {view.question && view.question.number < view.question.total
                ? t('game.stage.next')
                : t('game.stage.finish')}
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
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <ellipse cx="50" cy="50" rx="44" ry="38" className="gq-oval-road" />
              <ellipse cx="50" cy="50" rx="34" ry="28" className="gq-oval-inner" />
              <line x1="50" y1="10" x2="50" y2="18" className="gq-oval-start" />
            </svg>
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
          <ol className="gq-track" aria-label={t('game.race.standings')}>
          {racers.map((racer) => (
            <li key={racer.id} className="gq-lane" data-lead={racer.place === 1 ? 'yes' : undefined}>
              <span className="gq-lane-place">{racer.place}.</span>
              <span className="gq-lane-name">{racer.nickname}</span>
              <span className="gq-lane-road" aria-hidden="true">
                <span className="gq-lane-runner" style={{ left: `${racer.distance}%` }} />
              </span>
              <span className="gq-lane-meters">{Math.round(racer.distance)}%</span>
              {racer.nitro > 0 ? (
                <span className="gq-lane-nitro" title={t('game.race.nitroCount', { count: racer.nitro })}>
                  {racer.nitro}
                </span>
              ) : null}
              {racer.spunOut > 0 ? (
                <span className="gq-lane-spin" title={t('game.race.spinCount', { count: racer.spunOut })}>
                  !
                </span>
              ) : null}
            </li>
          ))}
          </ol>
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
                    <span className="gq-podium-meters">{Math.round(racer.distance)}%</span>
                  </li>
                )
              })}
            </ol>
            <ol className="gq-track">
              {racers.slice(0, 3).map((racer) => (
                <li key={racer.id} className="gq-lane" data-lead={racer.place === 1 ? 'yes' : undefined}>
                  <span className="gq-lane-place">{racer.place}.</span>
                  <span className="gq-lane-name">{racer.nickname}</span>
                  <span className="gq-lane-meters">
                    {t('game.race.result', { meters: Math.round(racer.distance), right: racer.right })}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="gq-lead">{t('game.mode.noPlayers')}</p>
        )
      }
    />
  )
}

/** Szörnytámadás: a közös szörny életereje és az osztály pajzsa. */
export function BossStage({ title, onExit, engine, words, status, hint }: StageProps) {
  const t = useT()
  const session = engine.session
  const state = bossOf(session)

  return (
    <ModeStage
      nameKey="game.mode.boss.name"
      title={title}
      engine={engine}
      words={words}
      status={status}
      hint={hint}
      onExit={onExit}
      board={() => (
        <div className="gq-boss" data-kind={state.kind} data-enraged={state.enraged ? 'yes' : 'no'}>
          <div className="gq-boss-head">
            <span className="gq-boss-name">{t(bossNameKey(state.kind) as never)}</span>
            <span className="gq-boss-hp">
              {state.hp} / {state.maxHp}
            </span>
          </div>
          <div className="gq-boss-bar" role="progressbar" aria-valuenow={state.hp} aria-valuemin={0} aria-valuemax={state.maxHp}>
            <span className="gq-boss-fill" style={{ width: `${(state.hp / state.maxHp) * 100}%` }} />
          </div>
          <div className="gq-boss-shield" aria-label={t('game.boss.shield')}>
            {Array.from({ length: Math.round(state.maxShield / 10) }, (_, index) => (
              <span key={index} className="gq-boss-pip" data-on={index < state.shield / 10 ? 'yes' : 'no'} />
            ))}
            <span className="gq-boss-bites">{t('game.boss.hits', { hits: state.hits, bites: state.bites })}</span>
          </div>
        </div>
      )}
      outcome={
        state.outcome === 'win' ? (
          <h2 className="gq-big">{t('game.boss.won')}</h2>
        ) : state.outcome === 'lose' ? (
          <h2 className="gq-big">{t('game.boss.lost')}</h2>
        ) : state.outcome === 'draw' ? (
          <h2 className="gq-big">{t('game.boss.drawn')}</h2>
        ) : (
          // A küldetés úgy ért véget, hogy a szörny életben maradt, de a pajzs
          // is: ez nem döntetlen, hanem kitartás.
          <h2 className="gq-big">{t('game.boss.survived')}</h2>
        )
      }
    />
  )
}
