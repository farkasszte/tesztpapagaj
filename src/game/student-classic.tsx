import { useEffect, useState } from 'react'
import type { ClassicView } from './classic/views'
import { StudentBlocks } from './student-blocks'
import { TINCTURES } from './parts'
import { choiceTone, rightLetters } from './student-tone'
import { acceptedAnswersOf, textIsRight } from './text-match'
import { useT } from '../i18n'

/**
 * A Klasszikus mód diák-nézete: kérdés, válaszgombok, felfedés.
 *
 * Csak rajzol — a küldést a hívó végzi (`onAnswer`), hogy a hálózat egy helyen
 * legyen. A válaszom a tanár nézetéből jön vissza (`me.answer`), tehát nem a
 * helyi kattintás számít, hanem az, amit a tanár gépe rögzített.
 */
export function ClassicStudentGame({
  view,
  sent,
  nickname,
  problem,
  reviewCount = 0,
  onOpenReview,
  onAnswer,
}: {
  view: ClassicView | null
  /** Amit már elküldtem, de még nem jött vissza a tanártól. */
  sent: number[] | null
  nickname: string
  problem: string | null
  /** Hány kérdést rontott el: ennyi kártya vár a hibalistán (a játék végén). */
  reviewCount?: number
  onOpenReview?: () => void
  /** Egy válasz, vagy egy több helyes válaszos kérdésnél a megjelöltek. */
  onAnswer: (choices: number[], texts?: string[]) => void
}) {
  const t = useT()
  /** A több helyes válaszos kérdésnél a beküldés előtt összegyűjtött jelölések. */
  const [marked, setMarked] = useState<number[]>([])
  /** Párosításnál fogalmanként a válasz indexe, és az épp kiválasztott fogalom. */
  const [links, setLinks] = useState<(number | null)[]>([])
  const [active, setActive] = useState<number | null>(null)
  /** A beírt válaszok, hézagonként. */
  const [typed, setTyped] = useState<string[]>([])
  const question = view?.question ?? null
  const mine = view?.me ?? null
  const revealed = view?.phase === 'REVEAL'
  const ended = view?.phase === 'REPORT' || view?.phase === 'ENDED'

  // A visszaszámláló a legutóbb kapott nézetből indul, és magától ketyeg.
  const remaining = question?.remainingMs ?? null
  const [left, setLeft] = useState(0)
  // Új kérdésnél a jelölések és a párok elölről kezdődnek.
  useEffect(() => {
    setMarked([])
    setLinks([])
    setActive(null)
    setTyped([])
  }, [question?.number])
  useEffect(() => {
    if (remaining === null) return
    setLeft(Math.ceil(remaining / 1000))
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [remaining])

  // Ha lejár az idő, a megjelölt válaszok maguktól mennek el: a diák ne
  // veszítse el a válaszát azért, mert a beküldés gomb a képernyő alján van.
  // A motor a határidő előtt még elfogadja, ezért egy másodperccel korábban
  // indulunk.
  useEffect(() => {
    if (!question || view?.phase !== 'QUESTION' || sent !== null) return
    if (!question.multi && !question.ordered) return
    if (marked.length === 0 || left > 1) return
    onAnswer(marked)
  }, [left, marked, question, sent, view?.phase, onAnswer])

  return (
    <div className="gq-stu">
      <header className="gq-stu-bar">
        <span className="gq-stu-name">{nickname}</span>
        {mine && !view?.theme ? (
          <span className="gq-stu-points">{t('game.student.points', { points: mine.points })}</span>
        ) : null}
        {question && !ended ? (
          <span className="gq-stu-count">
            {question.number}/{question.total}
          </span>
        ) : null}
      </header>

      {!view || view.phase === 'LOBBY' ? (
        <section className="gq-stu-card">
          <h1>{t('game.student.waiting')}</h1>
          <p className="gq-hint">{t('game.student.waitingHint')}</p>
          {view ? (
            <p className="gq-stu-roster">
              {t('game.devices.joined', { count: view.roster.filter((entry) => entry.connected).length })}
            </p>
          ) : null}
          {problem ? <p className="gq-stu-problem">{problem}</p> : null}
        </section>
      ) : null}

      {ended ? (
        <section className="gq-stu-card">
          <h1>{t('game.student.over')}</h1>
          <p className="gq-stu-result">
            {t('game.student.finalPoints', {
              points: mine?.points ?? 0,
              right: mine?.correctSoFar ?? 0,
              asked: mine?.asked ?? 0,
            })}
          </p>
          {onOpenReview && reviewCount > 0 ? (
            <>
              <button type="button" className="gq-stu-review" onClick={onOpenReview}>
                {t('game.review.open', { count: reviewCount })}
              </button>
              <p className="gq-hint">{t('game.review.kept')}</p>
            </>
          ) : null}
        </section>
      ) : null}

      {question && !ended ? (
        <section className="gq-stu-question">
          <div className="gq-stu-prompt">
            <StudentBlocks rich={question.rich?.prompt} plain={question.prompt} />
          </div>
          {view?.phase === 'QUESTION' && question.remainingMs !== null ? (
            <p className="gq-stu-clock" aria-live="off">
              {left} {t('game.stage.seconds')}
            </p>
          ) : null}

          {question.matching && question.prompts ? (
            <div className="gq-stu-prompts">
              <p className="gq-hint">{t('game.student.matchHint')}</p>
              {question.prompts.map((prompt, index) => {
                const linked = links[index] ?? null
                const right = question.matchAnswers?.[index] ?? null
                return (
                  <button
                    key={index}
                    type="button"
                    className="gq-stu-prompt"
                    data-active={active === index ? 'yes' : 'no'}
                    data-right={right === null ? undefined : right === linked ? 'yes' : 'no'}
                    onClick={() => setActive(index)}
                  >
                    <span className="gq-stu-prompt-text">{prompt}</span>
                    <span className="gq-stu-prompt-link">
                      {linked === null ? '·' : ('ABCD'[linked] ?? linked + 1)}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}

          {question.textEntry ? (
            <div className="gq-stu-texts">
              <p className="gq-hint">
                {question.gaps > 1
                  ? t('game.student.fillHint', { count: question.gaps })
                  : t('game.student.writeHint')}
              </p>
              {Array.from({ length: question.gaps }, (_, index) => {
                const right = revealed ? (question.rightBlanks?.[index] ?? null) : null
                const value = typed[index] ?? ''
                // Hézagoknál a helyes válasz a felfedésnél érkezik meg, rövid
                // válasznál a tanár ítélete (`me.right`) mondja meg, jó-e.
                const tone = right !== null
                  ? !value
                    ? undefined
                    : textIsRight(value, acceptedAnswersOf(right))
                      ? 'correct'
                      : 'wrong'
                  : revealed && mine?.right !== null && mine?.right !== undefined
                    ? mine.right
                      ? 'correct'
                      : 'wrong'
                    : undefined
                return (
                  <label key={index} className="gq-stu-text" data-tone={tone}>
                    {question.gaps > 1 ? (
                      <span className="gq-stu-text-gap">{index + 1}.</span>
                    ) : null}
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={120}
                      value={value}
                      disabled={view?.phase !== 'QUESTION' || mine?.canAnswer === false || sent !== null}
                      placeholder={t('game.student.writePlaceholder')}
                      onChange={(event) => {
                        const next = [...typed]
                        next[index] = event.target.value
                        setTyped(next)
                      }}
                      onKeyDown={(event) => {
                        // Enterrel is elküldhető, ha minden hézag ki van töltve.
                        if (event.key !== 'Enter') return
                        const complete = Array.from({ length: question.gaps }, (_, i) =>
                          (typed[i] ?? '').trim(),
                        )
                        if (complete.every(Boolean)) onAnswer([], complete)
                      }}
                    />
                  </label>
                )
              })}
            </div>
          ) : null}

          <div
            className="gq-stu-choices"
            hidden={question.textEntry}
            data-marked={marked.length > 0 ? 'true' : 'false'}
          >
            {question.choices.map((choice, index) => {
              const mine_ = mine?.answers ?? (mine ? [mine.answer ?? -1] : [])
              const picked = (sent ?? []).includes(index) || marked.includes(index) || mine_.includes(index)
              const correctIndexes = revealed
                ? (question.correctChoices ?? (question.correct === null ? [] : [question.correct]))
                : null
              const tone = choiceTone({ index, correctIndexes, picked })
              const disabled = view?.phase !== 'QUESTION' || mine?.canAnswer === false || sent !== null
              return (
                <button
                  key={index}
                  type="button"
                  className="gq-stu-choice"
                  data-tone={tone}
                  // Ugyanaz a négy szín, mint a tanár színpadán: a diák a
                  // telefonján is ugyanazt a kártyát látja, csak kisebben.
                  style={{ ['--c' as string]: TINCTURES[index] ?? TINCTURES[0] }}
                  disabled={disabled}
                  onClick={() => {
                    // Párosítás: a válasz a kiválasztott fogalomhoz kötődik.
                    if (question.matching) {
                      const target = active ?? links.findIndex((linked) => linked === null)
                      if (target < 0) return
                      setLinks((current) => {
                        const next = [...current]
                        const taken = next.indexOf(index)
                        if (taken >= 0) next[taken] = null
                        next[target] = index
                        return next
                      })
                      setActive(null)
                      return
                    }
                    // Egy válasz: azonnal megy. Több válasz: jelölés. Sorrend:
                    // a koppintás sorrendje maga a válasz.
                    if (!question.multi && !question.ordered) {
                      onAnswer([index])
                      return
                    }
                    setMarked((current) =>
                      current.includes(index) ? current.filter((one) => one !== index) : [...current, index],
                    )
                  }}
                >
                  <span className="gq-stu-letter">
                    {question.ordered && marked.includes(index)
                      ? marked.indexOf(index) + 1
                      : ('ABCD'[index] ?? index + 1)}
                  </span>
                  <span className="gq-stu-choice-words">
                    <StudentBlocks rich={question.rich?.choices?.[index]} plain={choice} />
                  </span>
                  {/* A jelölés a kártya **végén** is látszik: a diák ujja a
                      kártya közepén van, a betűt eltakarja. */}
                  {tone === 'picked' || tone === 'correct' ? (
                    <span className="gq-stu-tick" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {(question.multi || question.ordered || question.matching || question.textEntry) &&
          view?.phase === 'QUESTION' ? (
            <div className="gq-stu-confirm">
              <p className="gq-hint">
                {question.textEntry
                  ? t('game.student.textSendHint')
                  : question.matching
                    ? t('game.student.matchSendHint')
                    : question.ordered
                      ? t('game.student.orderHint')
                      : t('game.student.multiHint')}
              </p>
              <button
                type="button"
                className="primary-button"
                disabled={
                  question.textEntry
                    ? Array.from({ length: question.gaps }, (_, index) =>
                        (typed[index] ?? '').trim(),
                      ).some((text) => !text) || sent !== null
                    : question.matching
                      ? links.length !== (question.prompts?.length ?? 0) ||
                        links.some((linked) => linked === null) ||
                        sent !== null
                      : marked.length === 0 || sent !== null
                }
                onClick={() =>
                  onAnswer(
                    question.matching ? links.map((linked) => linked ?? -1) : marked,
                    question.textEntry
                      ? Array.from({ length: question.gaps }, (_, index) => (typed[index] ?? '').trim())
                      : undefined,
                  )
                }
              >
                {question.textEntry
                  ? t('game.student.textSend')
                  : question.matching
                    ? t('game.student.matchSend')
                    : question.ordered
                      ? t('game.student.orderSend')
                      : t('game.student.multiSend')}
              </button>
            </div>
          ) : null}

          {revealed && question.textEntry ? (
            <p className="gq-stu-verdict" data-right={mine?.right ? 'yes' : 'no'}>
              {mine?.right
                ? t('game.student.right')
                : t('game.student.textWrong', {
                    answer: (question.rightBlanks ?? question.accepted ?? []).join(' · '),
                  })}
            </p>
          ) : null}

          {/* Sorrend: a helyes sorrendet írjuk ki, nem egy betűt. */}
          {revealed && question.ordered && question.correctOrder ? (
            <p className="gq-stu-verdict" data-right={mine?.right ? 'yes' : 'no'}>
              {mine?.right
                ? t('game.student.right')
                : t('game.student.orderWrong', {
                    order: question.correctOrder
                      .map((order) => question.choices[order] ?? '')
                      .join(' → '),
                  })}
            </p>
          ) : null}

          {/* Párosítás: a párok a táblán látszanak, itt csak a tény. */}
          {revealed && question.matching ? (
            <p className="gq-stu-verdict" data-right={mine?.right ? 'yes' : 'no'}>
              {mine?.right ? t('game.student.right') : t('game.student.matchWrong')}
            </p>
          ) : null}

          {revealed && !question.textEntry && !question.ordered && !question.matching &&
          question.correct !== null ? (
            <p className="gq-stu-verdict" data-right={mine?.right ? 'yes' : 'no'}>
              {mine?.right
                ? t('game.student.right')
                : t('game.student.wrong', {
                    // Több helyes válasznál mindegyik betű: „C, D".
                    letter: rightLetters(question.correctChoices ?? [question.correct]),
                  })}
            </p>
          ) : null}
          {revealed && question.rich?.explanation ? (
            <div className="gq-stu-why">
              <StudentBlocks rich={question.rich.explanation} plain={question.explanation ?? ''} />
            </div>
          ) : null}
          {view?.phase === 'QUESTION' && mine?.canAnswer === false ? (
            <p className="gq-hint">{t('game.student.locked')}</p>
          ) : null}
        </section>
      ) : null}

      {problem ? <p className="gq-stu-problem">{problem}</p> : null}
    </div>
  )
}
