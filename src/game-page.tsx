import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppShell } from './app-shell'
import type { PersistentStorageStatus } from './durable-storage'
import { ChampionStage } from './game-champion-stage'
import { PerilStage } from './game-peril-stage'
import { ClassicStage } from './game-stage'
import { ClassicDevices } from './game-devices'
import { ChampionDevices } from './game-champion-devices'
import { PerilDevices } from './game-peril-devices'
import { playableQuestions } from './game/projection'
import { clearSavedGame, readSavedGame, type GameMode, type SavedGame } from './game-store'
import type { ClassicSession } from './game/classic/types'
import type { Session } from './game/types'
import type { PerilSession } from './game/peril/types'
import type { QuestionBankResource, QuestionBankSummary, QuestionBankWorkspaceService } from './question-bank-workspaces'
import { useT } from './i18n'
import './game.css'

/**
 * A Kvízjáték oldala: játékmód, majd kérdésbank, majd a kivetítés.
 *
 * A játék a tanár által vezérelt kivetítés: senkinek nem kell eszköz. A bank a
 * szokásos helyéről, az IndexedDB-ből jön, tehát ugyanazok a kérdések
 * játszhatók, amiket a tanár a bankokban már megírt; a nem játszható kérdéseket
 * a lista megnevezi, nem csendben hagyja ki.
 */

type Mode = GameMode

/**
 * A félbehagyott játék kérdései a mentett session-ből: a Klasszikus és a Bajnok
 * a saját listáját viszi, a Veszély! a tábláján.
 */
function questionsOf(saved: SavedGame) {
  if (saved.mode === 'peril') {
    const session = saved.session as PerilSession
    return session.board.flatMap((column) => column.tiles.map((tile) => tile.question))
  }
  return (saved.session as ClassicSession | Session).questions
}

/** Each mode keeps the colour it wears on the stage. */
const MODES: { id: Mode; name: string; blurb: string; ready: boolean; tincture: string }[] = [
  { id: 'classic', name: 'game.mode.classic.name', blurb: 'game.mode.classic.blurb', ready: true, tincture: '#2f5d8f' },
  { id: 'champion', name: 'game.mode.champion.name', blurb: 'game.mode.champion.blurb', ready: true, tincture: '#b23f2c' },
  { id: 'peril', name: 'game.mode.peril.name', blurb: 'game.mode.peril.blurb', ready: true, tincture: '#b38418' },
] as const

export function GamePage({
  banks,
  persistentStorage,
}: {
  banks: QuestionBankWorkspaceService
  persistentStorage: PersistentStorageStatus
}) {
  const t = useT()
  const [mode, setMode] = useState<Mode>('classic')
  const [summaries, setSummaries] = useState<readonly QuestionBankSummary[] | null>(null)
  const [bankId, setBankId] = useState('')
  const [bank, setBank] = useState<QuestionBankResource | null>(null)
  const [loading, setLoading] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(20)
  const [shuffle, setShuffle] = useState(false)
  // A kvízjáték válaszsorrendje alapból kevert: a kártyák sorrendje ne árulja
  // el a megoldást. A tanár kikapcsolhatja, ha a bank sorrendje számít.
  const [shuffleAnswers, setShuffleAnswers] = useState(true)
  /** A felfedés után a tanár színpadán az első öt pontszámmal. Csak akkor van
   *  értelme, ha a diákok a saját eszközükön játszanak: kivetítésnél nincs
   *  kit rangsorolni. */
  const [roundResults, setRoundResults] = useState(false)
  /** Diákok a saját telefonjukon (egyelőre a Klasszikus módban). */
  const [devices, setDevices] = useState(false)
  const [playing, setPlaying] = useState(false)
  /** A böngészőben talált félbehagyott játék, amíg a tanár nem dönt róla. */
  const [resume, setResume] = useState<SavedGame | null>(null)
  /** Amelyiket éppen folytatjuk. */
  const [restored, setRestored] = useState<SavedGame | null>(null)

  useEffect(() => {
    let live = true
    void readSavedGame().then((saved) => {
      if (live) setResume(saved)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    void banks.recent().then((list) => {
      if (!live) return
      setSummaries(list)
      setBankId((chosen) => chosen || list[0]?.id || '')
    })
    return () => {
      live = false
    }
  }, [banks])

  useEffect(() => {
    if (!bankId) {
      setBank(null)
      return
    }
    let live = true
    setLoading(true)
    void banks
      .open(bankId)
      .then((opened) => {
        if (live) setBank(opened)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [banks, bankId])

  // A több helyes válasz csak a Klasszikus módban játszható, ezért a mód is
  // beleszámít abba, mi játszható.
  const playable = useMemo(
    () => (bank
      ? playableQuestions(bank.questions, { classic: mode === 'classic', shuffleAnswers })
      : null),
    [bank, mode, shuffleAnswers],
  )
  const canStart = !!playable && playable.questions.length > 0

  const resumed = restored
    ? { title: restored.title, questions: questionsOf(restored), words: new Map(restored.words) }
    : null
  const playingNow = playing && (resumed ?? (playable && bank ? { title: bank.name, questions: playable.questions, words: playable.words } : null))
  if (playingNow) {
    const source = playingNow
    // A színpad a teljes képernyőé: portálon kerül a héj fölé, hogy a
    // navigáció és a morzsamenü ne látszódjon alatta.
    const exit = () => {
      setPlaying(false)
      setRestored(null)
    }
    const stage =
      devices && mode === 'classic' ? (
        <ClassicDevices
          title={source.title}
          questions={source.questions}
          words={source.words}
          settings={{ timerSeconds, shuffleQuestions: shuffle, roundResults }}
          onExit={exit}
        />
      ) : devices && mode === 'champion' ? (
        <ChampionDevices
          title={source.title}
          questions={source.questions}
          words={source.words}
          settings={{ shuffleQuestions: shuffle }}
          onExit={exit}
        />
      ) : mode === 'champion' ? (
        <ChampionStage
          title={source.title}
          questions={source.questions}
          words={source.words}
          settings={{ timerSeconds, shuffleQuestions: shuffle }}
          onExit={exit}
          restored={restored ?? undefined}
        />
      ) : devices && mode === 'peril' ? (
        <PerilDevices
          title={source.title}
          questions={source.questions}
          words={source.words}
          onExit={exit}
        />
      ) : mode === 'peril' ? (
        <PerilStage
          title={source.title}
          questions={source.questions}
          words={source.words}
          onExit={exit}
          restored={restored ?? undefined}
        />
      ) : (
        <ClassicStage
          title={source.title}
          questions={source.questions}
          words={source.words}
          settings={{ timerSeconds, shuffleQuestions: shuffle, roundResults }}
          onExit={exit}
          restored={restored ?? undefined}
        />
      )
    return createPortal(stage, document.body)
  }

  return (
    <AppShell
      crumbs={[{ label: t('shell.home'), href: '/' }, { label: t('game.title') }]}
      persistentStorage={persistentStorage}
    >
    <div className="gq-page">
      <h1>{t('game.title')}</h1>
      <p className="gq-lead">{t('game.intro')}</p>

      {resume ? (
        <div className="gq-resume">
          <div>
            <h2 className="gq-resume-title">{t('game.resume.title')}</h2>
            <p className="gq-resume-line">
              {t('game.resume.line', {
                title: resume.title,
                mode: t(`game.mode.${resume.mode}.name` as never),
                when: new Date(resume.savedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
              })}
            </p>
            <p className="gq-hint">{t('game.resume.hint')}</p>
          </div>
          <div className="gq-resume-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setMode(resume.mode)
                setRestored(resume)
                setResume(null)
                setPlaying(true)
              }}
            >
              {t('game.resume.go')}
            </button>
            <button
              type="button"
              className="gq-later"
              onClick={() => {
                void clearSavedGame()
                setResume(null)
              }}
            >
              {t('game.resume.drop')}
            </button>
          </div>
        </div>
      ) : null}

      <fieldset className="gq-modes">
        <legend className="gq-label">{t('game.mode.section')}</legend>
        {MODES.map(({ id, name, blurb, ready, tincture }) => (
          <button
            key={id}
            type="button"
            className="gq-mode"
            style={{ ['--t' as string]: tincture }}
            aria-pressed={mode === id}
            disabled={!ready}
            onClick={() => setMode(id)}
          >
            <span className="gq-mode-mark">
              <span className="gq-mode-dot" aria-hidden="true" />
              {t(name as never)}
            </span>
            <span className="gq-mode-blurb">{t(blurb as never)}</span>
            {ready ? null : <span className="gq-mode-tag">{t('game.mode.soon')}</span>}
          </button>
        ))}
      </fieldset>

      <div className="gq-setup">
        <div>
          <div className="gq-field">
            <label htmlFor="gq-bank">{t('game.chooseBank')}</label>
            <select
              id="gq-bank"
              value={bankId}
              onChange={(event) => setBankId(event.target.value)}
              disabled={!summaries || summaries.length === 0}
            >
              {(summaries ?? []).map((summary) => (
                <option key={summary.id} value={summary.id}>
                  {summary.name} ({summary.questionCount})
                </option>
              ))}
            </select>
            <p className="gq-hint">{t('game.chooseBankHint')}</p>
          </div>

          {summaries && summaries.length === 0 ? <p className="gq-lead">{t('game.noBanks')}</p> : null}

          {playable ? (
            <p className={playable.questions.length === 0 ? 'gq-tally gq-tally-empty' : 'gq-tally'}>
              {playable.questions.length === 0 ? (
                t('game.nothingPlayable')
              ) : (
                <strong>
                  {t('game.playableCount', {
                    playable: playable.questions.length,
                    total: bank?.questions.length ?? 0,
                  })}
                </strong>
              )}
            </p>
          ) : loading ? (
            <p className="gq-hint">{t('game.chooseBank')}</p>
          ) : null}
        </div>

        <div>
          <div className="gq-field">
            <label htmlFor="gq-timer">{t('game.timer')}</label>
            <input
              id="gq-timer"
              type="number"
              min={5}
              max={300}
              step={5}
              value={timerSeconds}
              onChange={(event) => setTimerSeconds(Math.max(5, Math.min(300, Number(event.target.value) || 20)))}
            />
          </div>
          <div className="gq-checks">
            <label>
              <input type="checkbox" checked={shuffle} onChange={(event) => setShuffle(event.target.checked)} />
              {t('game.shuffle')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={shuffleAnswers}
                onChange={(event) => setShuffleAnswers(event.target.checked)}
              />
              {t('game.shuffleAnswers')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={devices}
                disabled={false}
                onChange={(event) => {
                  setDevices(event.target.checked)
                  // Diák-eszköz nélkül nincs kit rangsorolni: a jelölő ne
                  // maradjon bekapcsolva egy olyan beállításon, ami nem hat.
                  if (!event.target.checked) setRoundResults(false)
                }}
              />
              {t('game.devices.switch')}
            </label>
            {/* Csak a diák-eszközös Klasszikus módban van kit rangsorolni. */}
            {devices && mode === 'classic' ? (
              <label>
                <input
                  type="checkbox"
                  checked={roundResults}
                  onChange={(event) => setRoundResults(event.target.checked)}
                />
                {t('game.roundResults')}
              </label>
            ) : null}
          </div>
          {devices ? <p className="gq-hint">{t('game.devices.switchHint')}</p> : null}
        </div>
      </div>

      {playable && playable.skipped.length > 0 ? (
        <div className="gq-out">
          <h3>
            {t('game.leftOut')} — {playable.skipped.length}
          </h3>
          <ul>
            {playable.skipped.slice(0, 12).map((skipped) => (
              <li key={skipped.number}>
                {t('game.leftOutLine', { number: skipped.number, reason: skipped.reason })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="gq-start">
        <button type="button" className="primary-button" disabled={!canStart} onClick={() => setPlaying(true)}>
          {t('game.start')}
        </button>
      </div>
    </div>
    </AppShell>
  )
}
