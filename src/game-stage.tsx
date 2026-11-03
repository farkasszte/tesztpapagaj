import { useReducer, useState, type ReactNode } from 'react'
import { DocView } from './doc-view'
import type { ClassicSettings } from './game/classic/types'
import { ClassicEngine, createClassicSession } from './game/classic/engine'
import { buildClassicView } from './game/classic/views'
import type { PlayableWords } from './game/projection'
import type { Question } from './game/types'
import { resumedClassicSession } from './game/resume'
import { LETTERS, TINCTURES, useExitOnEscape, useGamePersistence, useNow, useStageKeys } from './game-parts'
import { Bell, Letter, Ring } from './game-shapes'
import type { SavedGame } from './game-store'
import { useT } from './i18n'

/**
 * A kivetítés: a Klasszikus mód színpada diákeszközök nélkül.
 *
 * A tanár vezet mindent — a kérdést és a válaszokat a nagy képernyő mutatja, az
 * osztály táblán vagy kézfeltartással válaszol, és a tanár kattint a válasz
 * megmutatására, majd a következő kérdésre. A szabályok a `game/classic`
 * motorjában vannak, a szavakat pedig az alkalmazás saját, csak olvasható
 * rajzolója adja (`DocView`), így a képek, a kivágások és a matek pontosan úgy
 * állnak a színpadon, ahogy a dolgozaton.
 *
 * A színpad a Class Gauntlet terme: sötét, meleg kő, felülről jövő fénnyel, a
 * válaszok pedig címertani színt és saját jelvényt kapnak (kehely, pajzs,
 * korona, torony) — így hátulról, szín nélkül is megkülönböztethetők.
 */

export function ClassicStage({
  title,
  questions,
  words,
  settings,
  onExit,
  restored,
  engine: given,
  status,
  hint,
}: {
  title: string
  questions: Question[]
  words: Map<string, PlayableWords>
  settings: Partial<ClassicSettings>
  onExit: () => void
  /** Félbehagyott játék a böngésző tárolójából: onnan folytatjuk, ahol állt. */
  restored?: SavedGame
  /** Diák-eszközös módban a tanár fülén futó motor; ilyenkor nem ez hozza létre. */
  engine?: ClassicEngine
  /** A fejléc bal oldala: a szobakód és a bent lévők száma. */
  status?: ReactNode
  /** A lábléc súgója, ha nem a kézfeltartásos változat kell. */
  hint?: string
}) {
  const t = useT()
  const [engine] = useState(() => {
    if (given) return given
    // A mentés régi: a megjelenítési beállítást a mostani felületről vesszük,
    // különben a bejelölt körönkénti eredmény a folytatott játékban nem látszana.
    if (restored) return new ClassicEngine(resumedClassicSession(restored, { roundResults: settings.roundResults }))
    const session = createClassicSession({ code: '', title, questions, settings, noDevices: true })
    const created = new ClassicEngine(session)
    created.start()
    return created
  })
  const [, bump] = useReducer((count: number) => count + 1, 0)
  /** Amelyik kérdés eredménytáblája épp a képernyőn van. A kör eredménye külön
   *  lépés: a tanár a felfedés után előbb megnézi a kört, és csak utána lép
   *  tovább a következő kérdésre. */
  const [boardOf, setBoardOf] = useState<number | null>(null)
  const now = useNow()
  useExitOnEscape(onExit)

  const session = engine.session
  const view = buildClassicView(session, { now })
  const asked = session.questions[session.index]
  const shown = asked ? words.get(asked.id) : undefined
  const question = view.question
  const total = session.settings.timerSeconds * 1000
  const remaining = session.deadline === null ? 0 : Math.max(0, session.deadline - now)
  const timeUp = view.phase === 'QUESTION' && session.deadline !== null && now >= session.deadline
  const board = boardOf === session.index ? view.roundTop : null
  const act = (run: () => unknown) => {
    run()
    bump()
  }

  useGamePersistence({
    mode: 'classic',
    title,
    session,
    words,
    // A jelentés a játék természetes vége: onnan nincs mit folytatni.
    finished: view.phase === 'REPORT' || view.phase === 'ENDED',
  })
  useStageKeys({
    next: () => {
      if (view.phase === 'QUESTION') act(() => engine.lock())
      else if (view.phase === 'REVEAL') act(() => engine.next())
    },
  })

  return (
    <div className="gq-stage" role="dialog" aria-modal="true" aria-label={t('game.title')}>
      <div className="gq-stage-bar">
        {status ?? <span className="gq-pin">{t('game.stage.noDevices')}</span>}
        {session.noDevices || !question ? null : (
          <span className="gq-players">
            {t('game.devices.answered', {
              answered: question.answered,
              answering: question.answering,
            })}
          </span>
        )}
        <span className="gq-where">
          {question
            ? t('game.stage.questionOf', { number: question.number, total: question.total })
            : view.title}
        </span>
        <button type="button" className="gq-quiet" onClick={onExit}>
          {t('game.stage.endGame')}
        </button>
      </div>

      {question && shown ? (
        <section className="gq-question">
          <div className="gq-head">
            <h1 className="gq-prompt">
              <DocView content={shown.stem} />
            </h1>
            {view.phase === 'QUESTION' && session.deadline !== null ? (
              <Ring remaining={remaining} total={total} unit={t('game.stage.seconds')} />
            ) : null}
          </div>

          {/* A kör eredménye külön lépés: ilyenkor a kérdés teste (válaszok,
              fogalmak, beírt válasz) helyett az első öt áll a képernyőn. */}
          {board ? (
            <section className="gq-board">
              <p className="gq-board-kicker">{t('game.roundResults.title')}</p>
              <ol className="gq-board-list">
                {board.map((player, index) => (
                  <li key={player.nickname}>
                    <span className="gq-board-rank">{index + 1}</span>
                    <span className="gq-board-name">{player.nickname}</span>
                    <span className="gq-board-points">{player.points}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* Párosításnál a fogalmak a válaszkártyák fölött állnak, a felfedés
              után a hozzájuk tartozó válasz betűjével. */}
          {!board && question.matching && question.prompts ? (
            <ol className="gq-match">
              {question.prompts.map((prompt, index) => {
                const answer = question.matchAnswers?.[index] ?? null
                return (
                  <li key={index}>
                    <span className="gq-match-prompt">{prompt}</span>
                    <span className="gq-match-letter">
                      {answer === null ? '·' : ('ABCD'[answer] ?? answer + 1)}
                    </span>
                  </li>
                )
              })}
            </ol>
          ) : null}

          {/* Beírt válasz: a táblán a kérdés áll, a felfedésnél a helyes
              válaszok; a válaszok a kártyák helyén, sorszámozva. */}
          {board ? null : question.textEntry ? (
            <div className="gq-written">
              {view.phase === 'QUESTION' ? (
                <p className="gq-written-hint">
                  {view.noDevices
                    ? t('game.stage.writeOnPaper')
                    : t('game.stage.writeOnPhones')}
                </p>
              ) : (
                <ol className="gq-match">
                  {question.rightBlanks ? (
                    // Kiegészítés: hézagonként a maga válasza, sorszámozva.
                    question.rightBlanks.map((answer, index) => (
                      <li key={index}>
                        <span className="gq-match-prompt">{index + 1}.</span>
                        <span className="gq-match-letter gq-written-answer">{answer}</span>
                      </li>
                    ))
                  ) : (
                    // Rövid válasz: az elfogadható alakok egy sorban.
                    <li>
                      <span className="gq-match-prompt">{t('game.stage.rightAnswer')}</span>
                      <span className="gq-match-letter gq-written-answer">
                        {(question.accepted ?? []).join(' · ')}
                      </span>
                    </li>
                  )}
                </ol>
              )}
            </div>
          ) : (
          <div className="gq-choices" data-count={shown.choices.length}>
            {shown.choices.map((choiceWords, index) => {
              // Több helyes válasznál mindegyik helyes válasz pipát és szegélyt kap;
              // sorrendnél a válasz maga a sorrend, ezért sorszám áll a kártyán.
              const right = question.correctChoices
              const order = question.correctOrder
              // Párosításnál minden válasz „helyes": a fogalmak mellett álló betű
              // mondja meg, melyik melyikhez tartozik, ezért itt nincs jelölés.
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
                  {state === 'correct' ? (
                    <span className="gq-tick" aria-hidden="true">
                      <Bell />
                    </span>
                  ) : null}
                  {order !== null && order.includes(index) ? (
                    <span className="gq-order" aria-hidden="true">
                      {order.indexOf(index) + 1}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
          )}

          <div className="gq-foot">
            <p className="gq-status">
              {view.phase === 'QUESTION'
                ? timeUp
                  ? t('game.stage.timeUp')
                  : (hint ?? t('game.stage.answerByHand'))
                : shown.explanation
                  ? <DocView content={shown.explanation} />
                  : null}
            </p>
            {view.phase === 'QUESTION' ? (
              <button type="button" className="gq-go" onClick={() => act(() => engine.lock())}>
                {t('game.stage.showAnswer')}
              </button>
            ) : board === null && view.roundTop && view.roundTop.length > 0 ? (
              // A kör eredménye külön lépés: előbb a kör, aztán a következő kérdés.
              <button type="button" className="gq-go" onClick={() => act(() => setBoardOf(session.index))}>
                {t('game.roundResults.open')}
              </button>
            ) : (
              <button
                type="button"
                className="gq-go"
                onClick={() => {
                  setBoardOf(null)
                  act(() => engine.next())
                }}
              >
                {question.number < question.total ? t('game.stage.next') : t('game.stage.finish')}
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="gq-done">
          <h1 className="gq-big">{t('game.stage.done')}</h1>
          {/* Diákeszközön a játék végén a tanár a kivetítőn látja, ki hány pontot
              szerzett — ugyanaz, amit a diákok a telefonjukon. */}
          {!session.noDevices && view.report ? (
            <div className="gq-report-wrap">
              <h2 className="gq-report-title">{t('game.devices.report')}</h2>
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
              <p className="gq-hint">{t('game.devices.reportHint')}</p>
            </div>
          ) : null}
          <button type="button" className="gq-go" onClick={onExit}>
            {t('game.stage.backToBanks')}
          </button>
        </section>
      )}
    </div>
  )
}
