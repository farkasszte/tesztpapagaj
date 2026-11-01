import { useReducer, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { DocView } from './doc-view'
import { buildView } from './game/views'
import { Engine, createSession } from './game/engine'
import type { EndReason, Help, Settings } from './game/types'
import type { Session } from './game/types'
import { LETTERS, TINCTURES, useExitOnEscape, useGamePersistence, useNow, useStageKeys } from './game-parts'
import { Belt, Ring, Shape, Strike } from './game-shapes'
import type { PlayableWords } from './game/projection'
import type { Question } from './game/types'
import type { SavedGame } from './game-store'
import { useT, type TextKey } from './i18n'

/**
 * A Bajnok mód kivetítője, diákeszközök nélkül.
 *
 * A tanár vezet mindent, a Class Gauntlet szabályai szerint: megnevez egy
 * bajnokot, az osztály elolvassa a kérdést (a bajnok elnéz), a tanár beüti,
 * melyiket választotta a többség, majd a bajnok válaszol — három segítséggel —
 * és a felfedésnél kiderül, nő-e a kincsesláda, és fogy-e a hibalehetőség.
 * A szabályok a `game/engine.ts`-ben vannak; ez a fájl csak a színpad.
 */

const PHASES_WITH_QUESTION = new Set(['PHASE_A', 'PHASE_A_LOCKED', 'PHASE_B', 'ONE_LOCKED', 'REVEAL'])

const END_KEYS: Record<EndReason, TextKey> = {
  flameout: 'game.champion.endFlameout',
  deck_survived: 'game.champion.endDeck',
  mob_emptied: 'game.champion.endClass',
}

const HELP_KEYS: Record<Help, TextKey> = {
  poll: 'game.champion.helpPoll',
  ask: 'game.champion.helpAsk',
  trust: 'game.champion.helpTrust',
}

export function ChampionStage({
  title,
  questions,
  words,
  settings,
  onExit,
  restored,
  engine: given,
  status,
}: {
  title: string
  questions: Question[]
  words: Map<string, PlayableWords>
  settings: Partial<Settings>
  onExit: () => void
  /** Félbehagyott játék a böngésző tárolójából. */
  restored?: SavedGame
  /** Diák-eszközös módban a tanár fülén futó motor; ilyenkor nem ez hozza létre. */
  engine?: Engine
  /** A fejléc bal oldala: szobakód, létszám. */
  status?: ReactNode
}) {
  const t = useT()
  const [engine] = useState(() =>
    given
      ? given
      : restored
        ? new Engine(restored.session as Session)
        : new Engine(createSession({ code: '', setTitle: title, questions, settings, noDevices: true })),
  )
  const [, bump] = useReducer((count: number) => count + 1, 0)
  const [name, setName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const now = useNow()
  useExitOnEscape(onExit)

  const run = (action: () => { ok: boolean; message?: string }) => {
    const result = action()
    setNotice(result.ok ? null : (result.message ?? null))
    bump()
  }

  const session = engine.session
  const view = buildView(session, { now, pauseReason: engine.pauseReason })
  const game = view.game
  const question = view.question
  // A színpad a bank saját szavaival rajzol, ezért a nyitott kérdés id-je kell.
  const activeId = session.game?.active?.question.id
  const shown = activeId ? words.get(activeId) : undefined
  const one = game?.one
  const total = session.settings.timerSeconds * 1000

  const finished = view.phase === 'ENDED'
  useGamePersistence({ mode: 'champion', title, session, words, finished })
  useStageKeys({
    // Ahány lépés, annyi gomb: a szóköz mindig a soron következő lépést viszi.
    next: () => {
      if (view.phase === 'BETWEEN') run(() => engine.openQuestion())
      else if (view.phase === 'PHASE_A' && question?.peeking) run(() => engine.showToClass())
      else if (view.phase === 'PHASE_A_LOCKED') run(() => engine.showToOne())
      else if (view.phase === 'ONE_LOCKED') run(() => engine.reveal())
      else if (view.phase === 'REVEAL') run(() => engine.next())
    },
    pick: (index) => {
      if (view.phase === 'PHASE_A' && question && !question.peeking) run(() => engine.classAnswer(index))
      else if (view.phase === 'PHASE_B') run(() => engine.answerForOne(index))
    },
  })

  const startRound = (event: FormEvent) => {
    event.preventDefault()
    run(() => engine.startNamedRound(name))
    setName('')
  }

  const renderChoices = (
    mode: 'class' | 'one' | 'board',
    onPick?: (index: number) => void,
  ) => (
    <div className="gq-choices" data-count={question?.choices?.length ?? 0}>
      {(question?.choices ?? []).map((text, index) => {
        const state =
          mode === 'board' && question?.reveal
            ? index === question.reveal.correct
              ? 'correct'
              : 'faded'
            : 'idle'
        const label = text || (shown?.choices[index] ? '' : '')
        return (
          <div
            key={index}
            className="gq-answer"
            data-state={state}
            data-pickable={onPick ? 'true' : 'false'}
            data-tint={index}
                  style={{ ['--c' as string]: TINCTURES[index] ?? TINCTURES[0] }}
            role={onPick ? 'button' : 'group'}
            tabIndex={onPick ? 0 : undefined}
            aria-label={`${LETTERS[index]}: ${label}`}
            onClick={onPick ? () => onPick(index) : undefined}
            onKeyDown={
              onPick
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onPick(index)
                    }
                  }
                : undefined
            }
          >
            <Shape index={index} letter={LETTERS[index]} />
            <DocView content={shown?.choices[index] ?? []} />
            {state === 'correct' ? (
              <span className="gq-tick" aria-hidden="true">
                ✓
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="gq-stage" role="dialog" aria-modal="true" aria-label={t('game.mode.champion.name')}>
      <div className="gq-stage-bar">
        {status ?? <span className="gq-pin">{t('game.stage.noDevices')}</span>}
        <span className="gq-where">
          {game ? (
            <>
              <span>{t('game.champion.round', { round: game.ordinal })}</span>
              {one ? <span className="gq-one-name">{one.nickname}</span> : null}
              <span className="gq-stat">
                <Belt />
                {t('game.champion.pot')} <strong>{game.bank}</strong>
              </span>
              <span
                className="gq-stat gq-hearts"
                aria-label={`${t('game.champion.strikes')}: ${game.strikes}`}
              >
                <span className="gq-heart">
                  {Array.from({ length: Math.max(0, game.strikes) }, (_, index) => (
                    <Strike key={index} />
                  ))}
                </span>
                <span className="gq-heart-empty">
                  {Array.from(
                    { length: Math.max(0, game.baseStrikes - game.strikes) },
                    (_, index) => (
                      <Strike key={index} />
                    ),
                  )}
                </span>
              </span>
            </>
          ) : (
            view.setTitle
          )}
        </span>
        <button type="button" className="gq-quiet" onClick={onExit}>
          {t('game.stage.endGame')}
        </button>
      </div>

      {notice ? <p className="gq-notice">{notice}</p> : null}

      {view.phase === 'LOBBY' || view.phase === 'LEADERBOARD' ? (
        <section className="gq-done">
          {view.phase === 'LEADERBOARD' && game?.result ? (
            <>
              <h1 className="gq-big">{t('game.champion.gameOver')}</h1>
              <p>{t(END_KEYS[game.result.reason], { pot: game.result.bank })}</p>
            </>
          ) : (
            <h1 className="gq-big">{t('game.champion.title')}</h1>
          )}
          <form className="gq-start-row" onSubmit={startRound}>
            <label htmlFor="gq-one" className="gq-label">
              {t('game.champion.nameLabel')}
            </label>
            <input
              id="gq-one"
              className="gq-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('game.champion.namePlaceholder')}
              autoFocus
            />
            <button type="submit" className="gq-go" disabled={!name.trim()}>
              {view.phase === 'LEADERBOARD' ? t('game.champion.nextRound') : t('game.start')}
            </button>
          </form>
        </section>
      ) : null}

      {view.phase === 'BETWEEN' ? (
        <section className="gq-done">
          <h1 className="gq-big">{one?.nickname}</h1>
          <p>{t('game.champion.between', { index: (game?.questionIndex ?? 0) + 1, total: game?.deckSize ?? 0 })}</p>
          <button type="button" className="gq-go" onClick={() => run(() => engine.openQuestion())}>
            {t('game.champion.openQuestion')}
          </button>
        </section>
      ) : null}

      {question && view.phase === 'PHASE_A' && question.peeking ? (
        <section className="gq-done">
          <h1 className="gq-big">{t('game.champion.lookAway')}</h1>
          <button type="button" className="gq-go" onClick={() => run(() => engine.showToClass())}>
            {t('game.champion.showToClass')}
          </button>
        </section>
      ) : null}

      {question && view.phase === 'PHASE_A' && !question.peeking ? (
        <section className="gq-question">
          <div className="gq-head">
            <h1 className="gq-prompt">
              <DocView content={shown?.stem ?? []} />
            </h1>
            {question.remainingMs !== null ? <Ring remaining={question.remainingMs} total={total} /> : null}
          </div>
          {view.noDevices ? (
            <>
              <p className="gq-status">{t('game.champion.classMajority')}</p>
              {renderChoices('class', (choice) => run(() => engine.classAnswer(choice)))}
            </>
          ) : (
            <p className="gq-status">
              {t('game.champion.classAnswering', {
                answered: question.answered,
                eligible: question.eligible,
              })}
            </p>
          )}
          <div className="gq-foot">
            <p className="gq-status">{view.noDevices ? t('game.champion.classByHand') : t('game.champion.classOnPhones')}</p>
            {view.noDevices ? (
              <button type="button" className="gq-quiet" onClick={() => run(() => engine.skip())}>
                {t('game.champion.skip')}
              </button>
            ) : (
              <button type="button" className="gq-go" onClick={() => run(() => engine.lock())}>
                {t('game.champion.lockAnswers')}
              </button>
            )}
          </div>
        </section>
      ) : null}

      {view.phase === 'PHASE_A_LOCKED' ? (
        <section className="gq-done">
          <h1 className="gq-big">{t('game.champion.classDone')}</h1>
          <p>{t('game.champion.classDoneHint', { name: one?.nickname ?? '' })}</p>
          <button type="button" className="gq-go" onClick={() => run(() => engine.showToOne())}>
            {t('game.champion.showToOne')}
          </button>
        </section>
      ) : null}

      {question && view.phase === 'PHASE_B' ? (
        <section className="gq-question">
          <div className="gq-head">
            <h1 className="gq-prompt">
              <DocView content={shown?.stem ?? []} />
            </h1>
          </div>
          <div className="gq-helps">
            {(['poll', 'ask', 'trust'] as Help[]).map((help) => (
              <button
                key={help}
                type="button"
                className="gq-help"
                disabled={!game?.helpsAvailable[help] || !one}
                onClick={() => {
                  if (!one) return
                  run(() =>
                    help === 'poll'
                      ? engine.helpPoll(one.id, 0)
                      : help === 'ask'
                        ? engine.helpAsk(one.id)
                        : engine.helpTrust(one.id),
                  )
                }}
              >
                {t(HELP_KEYS[help])}
              </button>
            ))}
          </div>
          {question.helpResult ? (
            <p className="gq-status">
              {question.helpResult.type === 'majority' || question.helpResult.type === 'trust'
                ? t('game.champion.helpMajority', {
                    letter: LETTERS[question.helpResult.choice ?? 0] ?? '',
                  })
                : question.helpResult.type === 'poll'
                  ? t('game.champion.helpPollResult', {
                      count: question.helpResult.count,
                      total: question.helpResult.total,
                    })
                  : t('game.champion.helpAskUsed')}
            </p>
          ) : null}
          <p className="gq-status">{t('game.champion.oneAnswer')}</p>
          {renderChoices('one', (choice) => run(() => engine.answerForOne(choice)))}
          <div className="gq-foot">
            <p className="gq-status" />
          </div>
        </section>
      ) : null}

      {question && view.phase === 'ONE_LOCKED' ? (
        <section className="gq-question">
          <div className="gq-head">
            <h1 className="gq-prompt">
              <DocView content={shown?.stem ?? []} />
            </h1>
          </div>
          <p className="gq-status">
            {t('game.champion.locked', {
              name: one?.nickname ?? '',
              letter: LETTERS[question.oneAnswer ?? 0] ?? '',
            })}
          </p>
          <div className="gq-foot">
            <p className="gq-status" />
            <button type="button" className="gq-go" onClick={() => run(() => engine.reveal())}>
              {t('game.champion.reveal')}
            </button>
          </div>
        </section>
      ) : null}

      {question && view.phase === 'REVEAL' && question.reveal ? (
        <section className="gq-question">
          <div className="gq-head">
            <h1 className="gq-prompt">
              <DocView content={shown?.stem ?? []} />
            </h1>
          </div>
          {renderChoices('board')}
          {shown?.explanation ? (
            <p className="gq-status">
              <DocView content={shown.explanation} />
            </p>
          ) : null}
          <div className="gq-foot">
            <p className="gq-status">
              {t(question.reveal.oneCorrect ? 'game.champion.oneRight' : 'game.champion.oneWrong', {
                name: one?.nickname ?? '',
              })}
              {question.reveal.bankDelta !== 0
                ? ` · ${t('game.champion.potDelta', { amount: question.reveal.bankDelta })}`
                : ''}
            </p>
            <button type="button" className="gq-go" onClick={() => run(() => engine.next())}>
              {game?.result ? t('game.champion.finishRound') : t('game.stage.next')}
            </button>
          </div>
        </section>
      ) : null}

      {PHASES_WITH_QUESTION.has(view.phase) && !question ? (
        <section className="gq-done">
          <h1 className="gq-big">{t('game.champion.waiting')}</h1>
        </section>
      ) : null}
    </div>
  )
}
