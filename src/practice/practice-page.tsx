import { useEffect, useMemo, useState } from 'react'
import { DocView } from '../editor/doc-view'
import { playableQuestions } from '../game/projection'
import { textIsRight } from '../game/text-match'
import { createQuestionBankWorkspaceService, type QuestionBankResource } from '../bank/question-bank-workspaces'
import { t } from '../i18n/index'
import { navigate } from '../use-route'
import { practiceResultText, practiceResultsFor, practiceShareText, savePracticeResult } from './practice-results'
import './practice.css'

/**
 * Gyakorló mód: a Klasszikus egyszemélyes, saját eszközön játszott változata.
 *
 * Nincs szoba, nincs pont, nincs tanár: a diák a saját tempójában halad, minden
 * válasz után azonnal látja, eltalálta-e, a végén pedig a helyes válaszok
 * arányát (pl. 10/20 — 50%). Az eredmény a gépen marad, nem megy sehova.
 *
 * Csak azt kérdezi, amit gépelve vagy kattintva meg lehet válaszolni: az
 * egyetlen és a több helyes válaszos kérdést, valamint a rövid választ. A
 * sorrendezés, a párosítás és a kiegészítés kimarad — a végén megmondjuk,
 * hány ilyen volt.
 */
export function PracticePage({ bankId }: { bankId: string }) {
  const [bank, setBank] = useState<QuestionBankResource | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let live = true
    void createQuestionBankWorkspaceService()
      .read(bankId)
      .then((found) => {
        if (!live) return
        if (!found) setMissing(true)
        else setBank(found)
      })
      .catch(() => live && setMissing(true))
    return () => {
      live = false
    }
  }, [bankId])

  const deck = useMemo(() => {
    if (!bank) return null
    const playable = playableQuestions(bank.questions, { classic: true, shuffleAnswers: true })
    const items = playable.questions.filter(
      (question) =>
        question.choices.length > 0 || (question.accepted?.length ?? 0) > 0,
    )
    const skipped = playable.questions.length - items.length + playable.skipped.length
    return { items, words: playable.words, skipped }
  }, [bank])

  const [index, setIndex] = useState(0)
  /** Az eddigi válaszok: `true`, ha eltalálta. */
  const [results, setResults] = useState<boolean[]>([])
  /** Az épp megválaszolt kérdés eredménye (felfedés előtt `null`). */
  const [verdict, setVerdict] = useState<boolean | null>(null)
  const [typed, setTyped] = useState('')
  const [picked, setPicked] = useState<number[]>([])
  const [done, setDone] = useState(false)
  /** A telefonon megőrzött eredmények ehhez a bankhoz (legújabb elöl). */
  const [previous, setPrevious] = useState(() => practiceResultsFor(bankId))
  /** Az elrontott kérdések azonosítói ebben a futásban. */
  const [wrongIds, setWrongIds] = useState<string[]>([])
  /** `null`: a teljes pakli; tömb: csak ezek a kérdések („csak a hibásakat"). */
  const [subset, setSubset] = useState<string[] | null>(null)
  /** A megosztás visszajelzése („Kimásolva"), pár másodpercig. */
  const [shared, setShared] = useState(false)

  if (missing) {
    return (
      <main className="practice">
        <h1>{t('practice.missingTitle')}</h1>
        <p>{t('practice.missingHint')}</p>
        <button type="button" className="secondary-button" onClick={() => navigate('/question-banks')}>
          {t('practice.back')}
        </button>
      </main>
    )
  }

  if (!bank || !deck) {
    return (
      <main className="practice">
        <p className="practice-loading">{t('practice.loading')}</p>
      </main>
    )
  }

  const items = subset
    ? deck.items.filter((question) => subset.includes(question.id))
    : deck.items
  const total = items.length
  const right = results.filter(Boolean).length
  const percent = results.length === 0 ? 0 : Math.round((right / results.length) * 100)
  /** Amit a megosztás elküld — a gomb címkéjében is ott van, hogy látszódjon. */
  const shareText = practiceShareText({ name: bank.name, right, total: results.length })

  if (total === 0) {
    return (
      <main className="practice">
        <h1>{bank.name}</h1>
        <p className="practice-hint">{t('practice.nothingToAsk')}</p>
        <div className="practice-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate(`/jatek?bank=${encodeURIComponent(bank.id)}&mod=kartya`)}
          >
            {t('practice.flashcards')}
          </button>
        </div>
      </main>
    )
  }

  if (done) {
    return (
      <main className="practice">
        <h1>{bank.name}</h1>
        <p className="practice-score" data-percent={percent}>
          <span className="practice-score-fraction">
            {right}/{results.length}
          </span>
          <strong className="practice-score-percent">{percent}%</strong>
        </p>
        {wrongIds.length > 0 ? (
          <div className="practice-review">
            <h2>{t('practice.wrongTitle', { count: wrongIds.length })}</h2>
            <ol>
              {wrongIds.map((id) => {
                const missed = deck.items.find((one) => one.id === id)
                if (!missed) return null
                const spoken = deck.words.get(id)
                const answer = spoken?.choices?.length
                  ? (missed.correctChoices ?? [missed.correct])
                      .map((index) => missed.choices[index] ?? '')
                      .join(' / ')
                  : (missed.accepted?.[0] ?? missed.blanks?.join(' / ') ?? '')
                return (
                  <li key={id}>
                    <span className="practice-review-stem">
                      {spoken?.stem?.length ? <DocView content={spoken.stem} /> : missed.prompt}
                    </span>
                    {answer ? <span className="practice-review-answer">{answer}</span> : null}
                  </li>
                )
              })}
            </ol>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                // Csak a hibásak: ugyanaz a pakli, kiszűrve a jól megválaszoltak.
                setSubset(wrongIds)
                setWrongIds([])
                setResults([])
                setIndex(0)
                setVerdict(null)
                setTyped('')
                setPicked([])
                setDone(false)
              }}
            >
              {t('practice.onlyWrong')}
            </button>
          </div>
        ) : null}
        {previous.length > 0 ? (
          <div className="practice-history">
            <h2>{t('practice.history')}</h2>
            <ol>
              {previous.slice(0, 5).map((entry) => (
                <li key={entry.at}>
                  <span className="practice-history-when">
                    {new Date(entry.at).toLocaleDateString('hu-HU', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="practice-history-score">{practiceResultText(entry)}</span>
                </li>
              ))}
            </ol>
            {previous.length >= 5 ? <p className="practice-hint">{t('practice.historyMore')}</p> : null}
          </div>
        ) : null}
        <p className="practice-hint">{t('practice.doneHint')}</p>
        {deck.skipped > 0 ? (
          <p className="practice-hint">{t('practice.skipped', { count: deck.skipped })}</p>
        ) : null}
        <div className="practice-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setSubset(null)
              setWrongIds([])
              setIndex(0)
              setResults([])
              setVerdict(null)
              setTyped('')
              setPicked([])
              setDone(false)
            }}
          >
            {t('practice.again')}
          </button>
          <button
            type="button"
            className="secondary-button"
            title={shareText}
            data-share-text={shareText}
            onClick={() => void share()}
          >
            {shared ? t('practice.shared') : t('practice.share')}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate(`/jatek?bank=${encodeURIComponent(bank.id)}&mod=kartya`)}
          >
            {t('practice.flashcards')}
          </button>
        </div>
      </main>
    )
  }

  const question = items[Math.min(index, total - 1)]
  const words = deck.words.get(question.id)
  const choices = question.choices.length > 0
  const correctChoices = question.correctChoices ?? [question.correct]

  /**
   * Az eredmény megosztása: mobilon a rendszer megosztója, asztali gépen a
   * vágólap. A szöveg a diák telefonszámára megy, nem szerverre.
   */
  const share = async () => {
    const text = shareText
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setShared(true)
        setTimeout(() => setShared(false), 3000)
      }
    } catch {
      // A felhasználó elvetette a megosztást: nincs mit tenni.
    }
  }

  const judge = (answer: { picked?: number[]; text?: string }) => {
    if (verdict !== null) return
    const isRight = choices
      ? (answer.picked ?? []).length > 0 &&
        (answer.picked ?? []).every((index) => correctChoices.includes(index)) &&
        correctChoices.every((index) => (answer.picked ?? []).includes(index))
      : textIsRight(answer.text ?? '', question.accepted ?? [])
    setVerdict(isRight)
    setResults((all) => [...all, isRight])
    if (!isRight) setWrongIds((all) => (all.includes(question.id) ? all : [...all, question.id]))
  }

  const next = () => {
    setVerdict(null)
    setTyped('')
    setPicked([])
    if (index + 1 >= total) {
      // A diák meg tudja mutatni az iskolában: az eredmény a telefonon marad.
      const saved = savePracticeResult({
        bankId: bank.id,
        name: bank.name,
        right: results.filter(Boolean).length,
        total: results.length,
      })
      setPrevious(practiceResultsFor(bank.id, saved))
      setDone(true)
    } else setIndex(index + 1)
  }

  return (
    <main className="practice">
      <header className="practice-bar">
        <span className="practice-name">{bank.name}</span>
        <span className="practice-count">{t('practice.of', { index: index + 1, total })}</span>
        <span className="practice-tally">
          {t('practice.tally', { right, answered: results.length })}
        </span>
        {/* Az előző eredmény már az elején látszik: a diák meg tudja mutatni. */}
        {index === 0 && results.length === 0 && previous.length > 0 ? (
          <span className="practice-last">
            {t('practice.lastTime', { result: practiceResultText(previous[0]) })}
          </span>
        ) : null}
      </header>

      <section className="practice-card">
        <h2 className="practice-stem">
          {words?.stem ? <DocView content={words.stem} /> : question.prompt}
        </h2>

        {choices ? (
          <ul className="practice-choices">
            {question.choices.map((choice, choiceIndex) => {
              const isPicked = picked.includes(choiceIndex)
              const isRight = correctChoices.includes(choiceIndex)
              const show = verdict !== null
              return (
                <li key={choiceIndex}>
                  <button
                    type="button"
                    className={
                      'practice-choice' +
                      (isPicked ? ' is-picked' : '') +
                      (show && isRight ? ' is-right' : '') +
                      (show && isPicked && !isRight ? ' is-wrong' : '')
                    }
                    data-tone-index={choiceIndex % 4}
                    aria-pressed={isPicked}
                    disabled={verdict !== null}
                    onClick={() => {
                      if (correctChoices.length > 1) {
                        setPicked((all) =>
                          all.includes(choiceIndex)
                            ? all.filter((one) => one !== choiceIndex)
                            : [...all, choiceIndex],
                        )
                        return
                      }
                      setPicked([choiceIndex])
                      judge({ picked: [choiceIndex] })
                    }}
                  >
                    <span className="practice-letter">{'ABCD'[choiceIndex]}</span>
                    <span>{words?.choices[choiceIndex] ? <DocView content={words.choices[choiceIndex]} /> : choice}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <form
            className="practice-answer"
            onSubmit={(event) => {
              event.preventDefault()
              judge({ text: typed })
            }}
          >
            <input
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={verdict !== null}
              placeholder={t('practice.typeAnswer')}
              aria-label={t('practice.typeAnswer')}
            />
            <button type="submit" className="primary-button" disabled={verdict !== null || typed.trim().length === 0}>
              {t('practice.check')}
            </button>
          </form>
        )}

        {verdict !== null ? (
          <div className="practice-verdict" data-right={verdict ? 'true' : 'false'}>
            <strong>{verdict ? t('practice.right') : t('practice.wrong')}</strong>
            {!verdict && question.accepted?.length ? (
              <span>{t('practice.accepted', { answer: question.accepted[0] ?? '' })}</span>
            ) : null}
            {question.explanation ? <span className="practice-why">{question.explanation}</span> : null}
          </div>
        ) : null}
      </section>

      <div className="practice-actions">
        {correctChoices.length > 1 && verdict === null ? (
          <button
            type="button"
            className="primary-button"
            disabled={picked.length === 0}
            onClick={() => judge({ picked })}
          >
            {t('practice.check')}
          </button>
        ) : null}
        {verdict !== null ? (
          <button type="button" className="primary-button" onClick={next}>
            {index + 1 >= total ? t('practice.finish') : t('practice.next')}
          </button>
        ) : null}
        <button type="button" className="secondary-button" onClick={() => navigate('/question-banks')}>
          {t('practice.leave')}
        </button>
      </div>
    </main>
  )
}
