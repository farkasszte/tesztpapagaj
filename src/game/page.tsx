import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppShell } from '../app-shell'
import type { PersistentStorageStatus } from '../storage/durable-storage'
import { ChampionStage } from './champion-stage'
import { PerilStage } from './peril-stage'
import { ClassicStage } from './stage'
import { ClassicDevices } from './devices'
import { SplitDevices } from './split/devices'
import { pairQuestions } from './split/pair'
import { ChampionDevices } from './champion-devices'
import { PerilDevices } from './peril-devices'
import { FlashcardDeck } from './flashcard-view'
import { deckOf } from './flashcard'
import { playableQuestions } from './projection'
import { clearSavedGame, readSavedGame, type GameMode, type SavedGame } from './store'
import type { ClassicSession } from './classic/types'
import type { Session } from './types'
import type { PerilSession } from './peril/types'
import type { QuestionBankResource, QuestionBankSummary, QuestionBankWorkspaceService } from '../bank/question-bank-workspaces'
import { useT } from '../i18n/index'
import { AVATAR_STYLES, DEFAULT_AVATAR_STYLE, applyAvatarStyle } from './avatar-styles'
import { PlayerAvatar } from './avatar-view'

/** A minta három magja: mindig ugyanaz, hogy a készletek összehasonlíthatók legyenek. */
const SAMPLE_SEEDS = ['minta-anna', 'minta-bence', 'minta-csilla']
import '../game.css'

/**
 * A Kvízjáték oldala: játékmód, majd kérdésbank, majd a kivetítés.
 *
 * A játék a tanár által vezérelt kivetítés: senkinek nem kell eszköz. A bank a
 * szokásos helyéről, az IndexedDB-ből jön, tehát ugyanazok a kérdések
 * játszhatók, amiket a tanár a bankokban már megírt; a nem játszható kérdéseket
 * a lista megnevezi, nem csendben hagyja ki.
 */

type Mode = GameMode | 'flashcard' | 'race' | 'boss' | 'split' | 'vote'

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
  // A tanulókártya nem verseny: nincs pont, idő és szoba, ezért a beállításai
  // is mások (lásd a lenti ágat).
  { id: 'flashcard', name: 'game.mode.flashcard.name', blurb: 'game.mode.flashcard.blurb', ready: true, tincture: '#55607a' },
  // A két „másik játék” a Klasszikus naplójára épül, de a számításhoz mindenki
  // válasza kell, ezért diák-eszköz nélkül nem indul (a jelölő rejtve, a mód
  // kiválasztása bekapcsolja).
  { id: 'race', name: 'game.mode.race.name', blurb: 'game.mode.race.blurb', ready: true, tincture: '#2f6b4f' },
  { id: 'boss', name: 'game.mode.boss.name', blurb: 'game.mode.boss.blurb', ready: true, tincture: '#7a2f4a' },
  // A differenciált kvíz két bankot játszik egyszerre: a diák a belépésnél
  // választ oldalt, a pont közös (tp#45).
  { id: 'split', name: 'game.mode.split.name', blurb: 'game.mode.split.blurb', ready: true, tincture: '#4a6b8a' },
  // A szavazás a helyes válasz nélküli kérdéseké: a tanár feltesz egy
  // véleménykérdést, a diákok szavaznak, a színpad a megoszlást mutatja (B5).
  { id: 'vote', name: 'game.mode.vote.name', blurb: 'game.mode.vote.blurb', ready: true, tincture: '#6c4a86' },
] as const
/** A módok, amelyekhez diák-eszköz kell (a napló minden választ számol). */
const DEVICE_MODES: readonly Mode[] = ['race', 'boss', 'split', 'vote'] as const

export function GamePage({
  banks,
  persistentStorage,
  initialBankId = '',
  initialMode = '',
}: {
  banks: QuestionBankWorkspaceService
  persistentStorage: PersistentStorageStatus
  /** A bank oldaláról érkező kérés: ezzel a bankkal induljon a játék. */
  initialBankId?: string
  /** A bank oldaláról jött mód (`flashcard`), ha nem a Klasszikus. */
  initialMode?: string
}) {
  const t = useT()
  const [mode, setMode] = useState<Mode>(
    initialMode === 'flashcard' ? 'flashcard' : initialMode === 'race' || initialMode === 'boss' ? initialMode : 'classic',
  )
  const [summaries, setSummaries] = useState<readonly QuestionBankSummary[] | null>(null)
  const [bankId, setBankId] = useState('')
  /** Kereső a bankok között: száz fölött a legördülő nem elég. */
  const [bankFilter, setBankFilter] = useState('')
  /** A differenciált kvíz jobb oldalának bankja (tp#45). */
  const [bankBId, setBankBId] = useState('')
  const [bankB, setBankB] = useState<QuestionBankResource | null>(null)
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
  /** A felfedés után a válasz kártyáján a betű helyén a választók száma. */
  const [showCounts, setShowCounts] = useState(false)
  /** A játékos-figurák készlete: ezt a ~5 kB-os csomagot kapja meg a diák. */
  const [avatarStyle, setAvatarStyle] = useState<string>(() => {
    try {
      return localStorage.getItem('testparrot.avatar-style') ?? DEFAULT_AVATAR_STYLE
    } catch {
      return DEFAULT_AVATAR_STYLE
    }
  })
  /** Diákok a saját telefonjukon (egyelőre a Klasszikus módban). */
  const [devices, setDevices] = useState(false)
  // A kiválasztott készletet a tanár színpada is azonnal használja, és a
  // következő megnyitáskor is ez marad.
  useEffect(() => {
    applyAvatarStyle(avatarStyle)
    try {
      localStorage.setItem('testparrot.avatar-style', avatarStyle)
    } catch {
      // Magánböngészés: a beállítás akkor sem visz el semmit.
    }
  }, [avatarStyle])

  /** A futam és a szörny minden választ számol, tehát diák-eszköz nélkül nem megy. */
  const needsDevices = DEVICE_MODES.includes(mode)
  const [playing, setPlaying] = useState(false)
  /** A böngészőben talált félbehagyott játék, amíg a tanár nem dönt róla. */
  const [resume, setResume] = useState<SavedGame | null>(null)
  /** A kért bank nem található: a tanár tudja, miért nem az jött be. */
  const [missingBank, setMissingBank] = useState(false)
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
      // A bank oldaláról jött kérés: ha a bank megvan, azzal indulunk; ha
      // időközben törölték, kimondjuk és az első bankra esünk vissza.
      const wanted = initialBankId ? list.find((summary) => summary.id === initialBankId) : undefined
      if (initialBankId && !wanted) setMissingBank(true)
      setBankId((chosen) => chosen || wanted?.id || list[0]?.id || '')
      setBankBId((chosen) => chosen || list[1]?.id || list[0]?.id || '')
    })
    return () => {
      live = false
    }
  }, [banks, initialBankId])

  // A differenciált kvíz második bankja: ugyanazon a szolgáltatáson át nyílik.
  useEffect(() => {
    if (mode !== 'split' || !bankBId) {
      setBankB(null)
      return
    }
    let live = true
    void banks.open(bankBId).then((opened) => {
      if (live) setBankB(opened)
    })
    return () => {
      live = false
    }
  }, [banks, bankBId, mode])

  // A kereső a **legördülő** listáját szűri, nem cseréli le: a választás
  // ugyanaz marad, csak rövidebb a lista. A kiválasztott bank mindig látszik,
  // különben a legördülő értéke eltűnne a szűrés alatt.
  const shownBanks = useMemo(() => {
    const all = summaries ?? []
    const needle = bankFilter.trim().toLocaleLowerCase('hu')
    if (!needle) return all.map((summary) => ({ summary, pinned: false }))
    const matches = all.filter((summary) => summary.name.toLocaleLowerCase('hu').includes(needle))
    const chosen = all.find((summary) => summary.id === bankId)
    // A kiválasztott bank a szűrés alatt is a listában marad — különben a
    // legördülő értéke elveszne —, de **meg van jelölve**, hogy ne számoljunk
    // vele találatként.
    const pinned = chosen && !matches.some((summary) => summary.id === chosen.id)
    return [
      ...(pinned ? [{ summary: chosen, pinned: true }] : []),
      ...matches.map((summary) => ({ summary, pinned: false })),
    ]
  }, [summaries, bankFilter, bankId])
  /** Valódi találatok: a beragadt kiválasztott bank nem számít bele. */
  const bankMatches = shownBanks.filter(({ pinned }) => !pinned).length

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
      ? playableQuestions(bank.questions, {
          classic: mode === 'classic',
          // Szavazásnál a helyes válasz nélküli kérdések a játszhatók.
          vote: mode === 'vote',
          shuffleAnswers,
        })
      : null),
    [bank, mode, shuffleAnswers],
  )
  const canStart = !!playable && playable.questions.length > 0

  const resumed = restored
    ? { title: restored.title, questions: questionsOf(restored), words: new Map(restored.words) }
    : null
  const playableB = useMemo(
    () => (bankB ? playableQuestions(bankB.questions, { classic: true, shuffleAnswers: false }) : null),
    [bankB],
  )
  /** A közös kör: a két oldal ugyanannyi kérdést játszik. */
  const pairing = useMemo(
    () => (playable && playableB ? pairQuestions(playable.questions, playableB.questions) : null),
    [playable, playableB],
  )

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
      mode === 'flashcard' ? (
        <FlashcardDeck
          title={source.title}
          cards={deckOf(source.questions)}
          words={source.words}
          onExit={exit}
        />
      ) : (mode === 'race' || mode === 'boss' || mode === 'vote') ? (
        // A futam és a szörny a Klasszikus naplóját viszi, de minden válasz
        // kell hozzá: ezért mindig a diák-eszközös házon át indul.
        <ClassicDevices
          title={source.title}
          questions={source.questions}
          words={source.words}
          settings={{
            timerSeconds,
            shuffleQuestions: shuffle,
            roundResults: false,
            // Szavazásnál nincs pont, és a megoszlás a lényeg.
            showCounts: mode === 'vote',
            scoring: mode !== 'vote',
          }}
          onExit={exit}
          bankId={bankId}
          stage={mode}
        />
      ) : mode === 'split' && bankBId && bankBId !== bankId && pairing && playable && playableB && bank && bankB ? (
        <SplitDevices
          banks={{
            a: { name: bank.name, questions: pairing.a, words: playable.words },
            b: { name: bankB.name, questions: pairing.b, words: playableB.words },
          }}
          settings={{ timerSeconds, shuffleQuestions: shuffle }}
          onExit={exit}
        />
      ) : devices && mode === 'classic' ? (
        <ClassicDevices
          title={source.title}
          questions={source.questions}
          words={source.words}
          settings={{ timerSeconds, shuffleQuestions: shuffle, roundResults, showCounts, avatarStyle }}
          onExit={exit}
          bankId={bankId}
        />
      ) : devices && mode === 'champion' ? (
        <ChampionDevices
          title={source.title}
          questions={source.questions}
          words={source.words}
          settings={{ shuffleQuestions: shuffle, avatarStyle }}
          onExit={exit}
        />
      ) : mode === 'champion' ? (
        <ChampionStage
          title={source.title}
          questions={source.questions}
          words={source.words}
          settings={{ timerSeconds, shuffleQuestions: shuffle, avatarStyle }}
          onExit={exit}
          restored={restored ?? undefined}
        />
      ) : devices && mode === 'peril' ? (
        <PerilDevices
          title={source.title}
          questions={source.questions}
          words={source.words}
          avatarStyle={avatarStyle}
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
          settings={{ timerSeconds, shuffleQuestions: shuffle, roundResults, showCounts, avatarStyle }}
          onExit={exit}
          restored={restored ?? undefined}
          bankId={bankId}
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
            {/* A kereső csak akkor jelenik meg, ha már sok a bank: két banknál
                a mező csak zavarna. */}
            {(summaries?.length ?? 0) >= 8 ? (
              <>
                <input
                  id="gq-bank-search"
                  className="gq-search"
                  type="search"
                  value={bankFilter}
                  onChange={(event) => setBankFilter(event.target.value)}
                  placeholder={t('game.bankSearch')}
                  aria-label={t('game.bankSearch')}
                  aria-controls="gq-bank"
                />
                <p className="gq-hint gq-search-count" role="status">
                  {bankMatches === 0
                    ? t('game.bankSearchNone')
                    : t('game.bankSearchCount', {
                        shown: bankMatches,
                        total: summaries?.length ?? 0,
                      })}
                </p>
              </>
            ) : null}
            <select
              id="gq-bank"
              value={bankId}
              onChange={(event) => setBankId(event.target.value)}
              disabled={!summaries || summaries.length === 0 || shownBanks.length === 0}
            >
              {shownBanks.map(({ summary, pinned }) => (
                <option key={summary.id} value={summary.id}>
                  {summary.name} ({summary.questionCount})
                  {pinned ? ` — ${t('game.bankSearchPinned')}` : ''}
                </option>
              ))}
            </select>
            <p className="gq-hint">{t('game.chooseBankHint')}</p>
          </div>

          {mode === 'split' ? (
            <div className="gq-field">
              <label htmlFor="gq-bank-b">{t('game.split.bankB')}</label>
              <select
                id="gq-bank-b"
                value={bankBId}
                onChange={(event) => setBankBId(event.target.value)}
                disabled={(summaries?.length ?? 0) === 0}
              >
                {(summaries ?? []).map((summary) => (
                  <option key={summary.id} value={summary.id}>
                    {summary.name} ({summary.questionCount})
                  </option>
                ))}
              </select>
              <p className="gq-hint">
                {pairing
                  ? t('game.split.pairCut', { count: pairing.length })
                  : t('game.split.needsTwoBanks')}
              </p>
              <p className="gq-hint">{t('game.split.onlyChoice')}</p>
            </div>
          ) : null}

          {summaries && summaries.length === 0 ? <p className="gq-lead">{t('game.noBanks')}</p> : null}
          {missingBank ? (
            <p className="gq-tally gq-tally-empty" role="alert">
              {t('game.bankMissing')}
            </p>
          ) : null}

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

        <div hidden={mode === 'flashcard'}>
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
            <label hidden={needsDevices}>
              <input
                type="checkbox"
                checked={devices || needsDevices}
                disabled={needsDevices}
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
            {/* A megoszlás csak ott olvasható, ahol van kitől: diák-eszközös
                Klasszikus. A kivetítésnél senki nem válaszol, tehát minden
                kártyán nulla állna. */}
            {devices && mode === 'classic' ? (
              <label>
                <input
                  type="checkbox"
                  checked={showCounts}
                  onChange={(event) => setShowCounts(event.target.checked)}
                />
                {t('game.showCounts')}
              </label>
            ) : null}
            <label className="gq-avatar-style">
              {t('game.avatar.styleLabel')}
              <select value={avatarStyle} onChange={(event) => setAvatarStyle(event.target.value)}>
                {AVATAR_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {t(style.label as never)}
                  </option>
                ))}
              </select>
              {/* Minta a választás mellett: a készlet neve nem mond semmit, a
                  figura igen. Csak a kiválasztott készlet töltődik le. */}
              <span className="gq-avatar-sample" aria-hidden="true">
                {SAMPLE_SEEDS.map((seed) => (
                  <PlayerAvatar key={seed} seed={seed} size={22} />
                ))}
              </span>
            </label>
          </div>
          {needsDevices ? (
            <p className="gq-hint">{t('game.mode.needsDevices')}</p>
          ) : devices ? (
            <p className="gq-hint">{t('game.devices.switchHint')}</p>
          ) : null}
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
