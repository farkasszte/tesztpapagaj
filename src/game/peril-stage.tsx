import { useReducer, useState, type ReactNode } from 'react'
import { DocView } from '../editor/doc-view'
import { PerilEngine, createPerilSession } from './peril/engine'
import { buildPerilView } from './peril/views'
import type { Column, PerilSession } from './peril/types'
import { autoDraft, planBoard } from './peril-board'
import {
  listTemplates,
  loadPlan,
  removeTemplate,
  savePlan,
  saveTemplate,
  type PerilPlan,
  type PerilTemplate,
} from './peril-plan'
import { PerilBoardBuilder } from './peril-builder'
import type { PlayableWords } from './projection'
import type { Question } from './types'
import { LETTERS, TINCTURES, useExitOnEscape, useGamePersistence, useNow, useStageFocusTrap, useStageKeys } from './parts'
import { Letter } from './shapes'
import type { SavedGame } from './store'
import { gameMessage } from './messages'
import { useT } from '../i18n/index'
import { StageTools } from './stage-tools'

/**
 * A Veszély! kivetítője, diákeszközök nélkül.
 *
 * A tanár vezet mindent: felírt csapatnevekkel indul a tábla, a tanár koppint a
 * mezőre, koppint, melyik csapat jelentkezett elsőnek, mit válaszolt, és egy
 * kincsesbarlangnál beüti a tétet. A tábla a készlet kérdéseiből épül
 * (`game/peril-board.ts`), a szabályok pedig a `game/peril/engine.ts`-ben
 * vannak — ez a fájl csak a színpad.
 */

const DEFAULT_TEAMS = ['Csapat 1', 'Csapat 2', 'Csapat 3', 'Csapat 4']
const TEAM_CHOICES = [2, 3, 4, 5, 6]

export function PerilStage({
  title,
  questions,
  words,
  onExit,
  restored,
  engine: given,
  status,
}: {
  title: string
  questions: Question[]
  words: Map<string, PlayableWords>
  onExit: () => void
  /** Félbehagyott játék a böngésző tárolójából. */
  restored?: SavedGame
  /** Diák-eszközös módban a tanár fülén futó motor. */
  engine?: PerilEngine
  /** A fejléc bal oldala: szobakód, létszám. */
  status?: ReactNode
}) {
  const t = useT()
  const trapRef = useStageFocusTrap<HTMLDivElement>()
  const [names, setNames] = useState<string[]>(() => {
    const teams = (restored?.session as PerilSession | undefined)?.settings?.teams?.names
    return teams?.length ? teams : DEFAULT_TEAMS
  })
  const [engine, setEngine] = useState<PerilEngine | null>(() =>
    given
      ? given
      : restored
        ? new PerilEngine(restored.session as PerilSession)
        : null,
  )
  const [wagerText, setWagerText] = useState('')
  /** A tanár táblaterve; üresen az automatikus tábla játszik. */
  const [plan, setPlan] = useState<PerilPlan | null>(() => loadPlan())
  const [templates, setTemplates] = useState<PerilTemplate[]>(() => listTemplates())
  const [notice, setNotice] = useState<string | null>(null)
  const [, bump] = useReducer((count: number) => count + 1, 0)
  const now = useNow()
  useExitOnEscape(onExit)

  const run = (action: () => { ok: boolean; message?: string }) => {
    const result = action()
    setNotice(result.ok ? null : gameMessage(result.message) || null)
    bump()
  }

  const columnLabel = (index: number) => t('game.peril.column', { n: index + 1 })

  // Mentett terv híján az automatikus tábla a terv, hogy a szerkesztő mindig
  // ugyanazt mutassa, amit a játék játszani fog.
  const activePlan: PerilPlan = plan ?? {
    draft: autoDraft(questions, { untitled: columnLabel }),
    trove: 'auto',
  }
  const changePlan = (next: PerilPlan) => {
    setPlan(next)
    savePlan(next)
  }

  const startBoard = (session: PerilEngine) => {
    const board: Column[] = planBoard(activePlan, questions, { untitled: columnLabel })
    const result = session.startBoard(board)
    setNotice(result.ok ? null : gameMessage(result.message) || null)
    bump()
  }

  const start = () => {
    const teamNames = names.map((name) => name.trim()).filter(Boolean)
    if (teamNames.length < 2) {
      setNotice(t('game.peril.needTeams'))
      return
    }
    const created = new PerilEngine(
      createPerilSession({ code: '', settings: { teams: { names: teamNames, assign: 'auto' } }, noDevices: true }),
    )
    setEngine(created)
    startBoard(created)
  }

  const session = engine?.session ?? null
  const view = session ? buildPerilView(session, { now }) : null
  useGamePersistence({
    mode: 'peril',
    title,
    session: session ?? { seq: -1 },
    words,
    finished: view?.phase === 'ENDED',
    enabled: !!session,
  })
  useStageKeys({
    next: () => {
      if (!engine || !view) return
      if (view.phase === 'READING') run(() => engine.armBuzzers())
      else if (view.phase === 'REVEAL') run(() => engine.next())
    },
    pick: (index) => {
      if (!engine || !view) return
      if (view.phase === 'ANSWERING') run(() => engine.answerFor(index))
    },
  })

  if (!engine || !session || !view) {
    return (
      <div className="gq-stage" ref={trapRef} role="dialog" aria-modal="true" aria-label={t('game.mode.peril.name')}>
        <div className="gq-stage-bar">
          {status ?? <span className="gq-pin">{t('game.stage.noDevices')}</span>}
          <span className="gq-where">{title}</span>
          <button type="button" className="gq-quiet" onClick={onExit}>
            {t('game.stage.endGame')}
          </button>
        </div>
        <section className="gq-done">
          <h1 className="gq-big">{t('game.mode.peril.name')}</h1>
          <p>{t('game.peril.teamsHint')}</p>
          <div className="gq-team-form">
            <label className="gq-label" htmlFor="gq-team-count">
              {t('game.peril.teamCount')}
            </label>
            <select
              id="gq-team-count"
              className="gq-input gq-input-small"
              value={names.length}
              onChange={(event) => {
                const count = Number(event.target.value)
                setNames((current) =>
                  Array.from({ length: count }, (_, index) => current[index] ?? `Csapat ${index + 1}`),
                )
              }}
            >
              {TEAM_CHOICES.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
            {names.map((name, index) => (
              <input
                key={index}
                className="gq-input gq-input-small"
                aria-label={t('game.peril.teamName', { n: index + 1 })}
                value={name}
                onChange={(event) =>
                  setNames((current) => current.map((other, i) => (i === index ? event.target.value : other)))
                }
              />
            ))}
          </div>
          <PerilBoardBuilder
            plan={activePlan}
            questions={questions}
            onChange={changePlan}
            templates={templates}
            onSaveTemplate={(name) => setTemplates(saveTemplate(name, activePlan))}
            onLoadTemplate={changePlan}
            onRemoveTemplate={(id) => setTemplates(removeTemplate(id))}
          />
          <button type="button" className="gq-go" onClick={start}>
            {t('game.peril.startBoard')}
          </button>
        </section>
      </div>
    )
  }

  const open = view.open
  const tile = session.open ? session.board[session.open.column]?.tiles[session.open.row] : undefined
  const shown = tile ? words.get(tile.question.id) : undefined
  const teams = view.teams

  const wagerFor = () => {
    const amount = Number(wagerText)
    if (!Number.isFinite(amount)) return
    run(() => engine.wagerFor(Math.max(0, Math.round(amount))))
    setWagerText('')
  }

  return (
    <div className="gq-stage" role="dialog" aria-modal="true" aria-label={t('game.mode.peril.name')}>
      <div className="gq-stage-bar">
        {status ?? <span className="gq-pin">{t('game.stage.noDevices')}</span>}
        <span className="gq-where">
          <span>{t('game.peril.boardNo', { n: session.boardsPlayed + 1 })}</span>
          {view.control ? <span className="gq-one-name">{t('game.peril.control', { name: view.control.name })}</span> : null}
          {teams.map((team) => (
            <span key={team.id} className="gq-stat">
              {team.name} <strong>{team.points}</strong>
            </span>
          ))}
        </span>
        <span className="gq-bar-end">
          <StageTools />
          <button type="button" className="gq-quiet" onClick={onExit}>
            {t('game.stage.endGame')}
          </button>
        </span>
      </div>

      {notice ? <p className="gq-notice">{notice}</p> : null}

      {view.phase === 'BOARD' ? (
        <section className="gq-board-wrap">
          {view.control ? (
            <p className="gq-status">
              {view.noDevices
                ? t('game.peril.controlHint', { name: view.control.name })
                : t('game.peril.controlHintDevices', { name: view.control.name })}
            </p>
          ) : null}
          <div className="gq-board" style={{ gridTemplateColumns: `repeat(${view.board.length}, minmax(0, 1fr))` }}>
            {view.board.map((column, columnIndex) => (
              <div key={columnIndex} className="gq-column">
                <h2 className="gq-column-title">{column.title}</h2>
                {column.tiles.map((tileView, rowIndex) => (
                  <button
                    key={rowIndex}
                    type="button"
                    className="gq-tile"
                    data-played={tileView.played ? 'true' : 'false'}
                    disabled={tileView.played || !view.noDevices}
                    onClick={() => run(() => engine.pickTile(columnIndex, rowIndex))}
                  >
                    {tileView.played ? '·' : tileView.value}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view.phase === 'READING' && tile ? (
        <section className="gq-done">
          <h1 className="gq-big">{t('game.peril.reading', { value: tile.value })}</h1>
          <button type="button" className="gq-go" onClick={() => run(() => engine.armBuzzers())}>
            {t('game.peril.arm')}
          </button>
        </section>
      ) : null}

      {view.phase === 'BUZZING' ? (
        <section className="gq-done">
          <h1 className="gq-big">{t('game.peril.buzz')}</h1>
          {open?.remainingMs != null ? <p className="gq-status">{Math.ceil(open.remainingMs / 1000)} s</p> : null}
          {view.noDevices ? (
            <div className="gq-teams">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className="gq-team"
                  // A nézet a kiejtett jelölteket néven adja, nem azonosítóval.
                  disabled={open?.lockedOut.includes(team.name) ?? false}
                  onClick={() => run(() => engine.buzzFor(team.id))}
                >
                  {team.name}
                  <small>{team.points}</small>
                </button>
              ))}
            </div>
          ) : (
            <p>{t('game.peril.buzzOnPhones')}</p>
          )}
        </section>
      ) : null}

      {view.phase === 'WAGERING' && open ? (
        <section className="gq-done">
          <h1 className="gq-big">{t('game.peril.wagerTitle')}</h1>
          <p>{t('game.peril.wagerHint', { name: open.answering ?? '', max: Math.max(500, ...teams.map((team) => team.points)) })}</p>
          {view.noDevices ? (
          <div className="gq-start-row">
            <input
              className="gq-input"
              type="number"
              min={0}
              value={wagerText}
              onChange={(event) => setWagerText(event.target.value)}
              aria-label={t('game.peril.wagerTitle')}
            />
            <button type="button" className="gq-go" onClick={wagerFor} disabled={!wagerText.trim()}>
              {t('game.peril.wagerGo')}
            </button>
          </div>
          ) : (
            <p className="gq-hint">{t('game.peril.wagerOnPhones')}</p>
          )}
        </section>
      ) : null}

      {view.phase === 'ANSWERING' && open ? (
        <section className="gq-question">
          <div className="gq-head">
            <h1 className="gq-prompt">
              <DocView content={shown?.stem ?? []} />
            </h1>
          </div>
          <p className="gq-status">{t('game.peril.answering', { name: open.answering ?? '' })}</p>
          {view.noDevices ? null : <p className="gq-hint">{t('game.peril.answerOnPhones')}</p>}
          <div className="gq-choices" data-count={open.choices?.length ?? 0}>
            {(open.choices ?? []).map((_, index) => (
              <div
                key={index}
                className="gq-answer"
                data-state="idle"
                data-pickable={view.noDevices ? 'true' : 'false'}
                data-tint={index}
                  style={{ ['--c' as string]: TINCTURES[index] ?? TINCTURES[0] }}
                role="button"
                tabIndex={0}
                aria-label={`${LETTERS[index]}: ${open.choices?.[index] ?? ''}`}
                onClick={() => {
                  if (view.noDevices) run(() => engine.answerFor(index))
                }}
                onKeyDown={(event) => {
                  if (view.noDevices && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault()
                    run(() => engine.answerFor(index))
                  }
                }}
              >
                <Letter letter={LETTERS[index]} />
                <DocView content={shown?.choices[index] ?? []} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view.phase === 'REVEAL' && open ? (
        <section className="gq-question">
          <div className="gq-head">
            <h1 className="gq-prompt">
              <DocView content={shown?.stem ?? []} />
            </h1>
          </div>
          <div className="gq-choices" data-count={open.choices?.length ?? 0}>
            {(open.choices ?? []).map((_, index) => (
              <div
                key={index}
                className="gq-answer"
                data-state={index === open.correct ? 'correct' : 'faded'}
                data-tint={index}
                  style={{ ['--c' as string]: TINCTURES[index] ?? TINCTURES[0] }}
                role="group"
                aria-label={`${LETTERS[index]}: ${open.choices?.[index] ?? ''}`}
              >
                <Letter letter={LETTERS[index]} />
                <DocView content={shown?.choices[index] ?? []} />
                {index === open.correct ? (
                  <span className="gq-tick" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          {shown?.explanation ? (
            <p className="gq-status">
              <DocView content={shown.explanation} />
            </p>
          ) : null}
          <div className="gq-foot">
            <p className="gq-status">
              {open.result
                ? open.result.name
                  ? t('game.peril.resultLine', { name: open.result.name, points: open.result.points })
                  : t('game.peril.nobodyPoint')
                : ''}
            </p>
            <button type="button" className="gq-go" onClick={() => run(() => engine.next())}>
              {session.played.length + 1 >= session.board.reduce((n, column) => n + column.tiles.length, 0)
                ? t('game.peril.seeFinal')
                : t('game.stage.next')}
            </button>
          </div>
        </section>
      ) : null}

      {view.phase === 'FINAL' ? (
        <section className="gq-done">
          <h1 className="gq-big">{t('game.peril.final')}</h1>
          <ol className="gq-standings">
            {view.standings.map((standing) => (
              <li key={standing.name}>
                <span className="gq-rank">{standing.rank}</span>
                <span className="gq-rank-name">{standing.name}</span>
                <strong>{standing.points}</strong>
              </li>
            ))}
          </ol>
          <div className="gq-start-row">
            <button type="button" className="gq-go" onClick={() => startBoard(engine)}>
              {t('game.peril.newBoard')}
            </button>
          </div>
        </section>
      ) : null}

      {view.phase === 'LOBBY' || view.phase === 'ENDED' ? (
        <section className="gq-done">
          <h1 className="gq-big">{t('game.peril.waiting')}</h1>
        </section>
      ) : null}
    </div>
  )
}
