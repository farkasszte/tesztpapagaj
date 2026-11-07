import { useEffect, useMemo, useState } from 'react'
import { DocView } from '../editor/doc-view'
import { playableQuestions } from '../game/projection'
import { textIsRight } from '../game/text-match'
import { createQuestionBankWorkspaceService, type QuestionBankResource } from '../bank/question-bank-workspaces'
import { t } from '../i18n/index'
import { navigate } from '../use-route'
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

  const total = deck.items.length
  const right = results.filter(Boolean).length
  const percent = results.length === 0 ? 0 : Math.round((right / results.length) * 100)

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
          <strong>
            {right}/{results.length}
          </strong>
          <span>{percent}%</span>
        </p>
        <p className="practice-hint">{t('practice.doneHint')}</p>
        {deck.skipped > 0 ? (
          <p className="practice-hint">{t('practice.skipped', { count: deck.skipped })}</p>
        ) : null}
        <div className="practice-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
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
            onClick={() => navigate(`/jatek?bank=${encodeURIComponent(bank.id)}&mod=kartya`)}
          >
            {t('practice.flashcards')}
          </button>
        </div>
      </main>
    )
  }

  const question = deck.items[Math.min(index, total - 1)]
  const words = deck.words.get(question.id)
  const choices = question.choices.length > 0
  const correctChoices = question.correctChoices ?? [question.correct]

  const judge = (answer: { picked?: number[]; text?: string }) => {
    if (verdict !== null) return
    const isRight = choices
      ? (answer.picked ?? []).length > 0 &&
        (answer.picked ?? []).every((index) => correctChoices.includes(index)) &&
        correctChoices.every((index) => (answer.picked ?? []).includes(index))
      : textIsRight(answer.text ?? '', question.accepted ?? [])
    setVerdict(isRight)
    setResults((all) => [...all, isRight])
  }

  const next = () => {
    setVerdict(null)
    setTyped('')
    setPicked([])
    if (index + 1 >= total) setDone(true)
    else setIndex(index + 1)
  }

  return (
    <main className="practice">
      <header className="practice-bar">
        <span className="practice-name">{bank.name}</span>
        <span className="practice-count">{t('practice.of', { index: index + 1, total })}</span>
        <span className="practice-tally">
          {t('practice.tally', { right, answered: results.length })}
        </span>
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
