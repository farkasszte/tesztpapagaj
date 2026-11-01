import { useEffect, useState } from 'react'
import type { ClassicView } from './game/classic/views'
import { StudentBlocks } from './game-student-blocks'
import { choiceTone } from './game-student-tone'
import { useT } from './i18n'

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
  onAnswer,
}: {
  view: ClassicView | null
  /** Amit már elküldtem, de még nem jött vissza a tanártól. */
  sent: number[] | null
  nickname: string
  problem: string | null
  /** Egy válasz, vagy egy több helyes válaszos kérdésnél a megjelöltek. */
  onAnswer: (choices: number[]) => void
}) {
  const t = useT()
  /** A több helyes válaszos kérdésnél a beküldés előtt összegyűjtött jelölések. */
  const [marked, setMarked] = useState<number[]>([])
  /** Párosításnál fogalmanként a válasz indexe, és az épp kiválasztott fogalom. */
  const [links, setLinks] = useState<(number | null)[]>([])
  const [active, setActive] = useState<number | null>(null)
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
  }, [question?.number])
  useEffect(() => {
    if (remaining === null) return
    setLeft(Math.ceil(remaining / 1000))
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [remaining])

  return (
    <div className="gq-stu">
      <header className="gq-stu-bar">
        <span className="gq-stu-name">{nickname}</span>
        {mine ? <span className="gq-stu-points">{t('game.student.points', { points: mine.points })}</span> : null}
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
        </section>
      ) : null}

      {question && !ended ? (
        <section className="gq-stu-question">
          <div className="gq-stu-prompt">
            <StudentBlocks rich={question.rich?.prompt} plain={question.prompt} />
          </div>
          {view?.phase === 'QUESTION' && question.remainingMs !== null ? (
            <p className="gq-stu-clock" aria-live="off">
              {left} s
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

          <div className="gq-stu-choices">
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
                </button>
              )
            })}
          </div>

          {(question.multi || question.ordered || question.matching) &&
          view?.phase === 'QUESTION' ? (
            <div className="gq-stu-confirm">
              <p className="gq-hint">
                {question.matching
                  ? t('game.student.matchSendHint')
                  : question.ordered
                    ? t('game.student.orderHint')
                    : t('game.student.multiHint')}
              </p>
              <button
                type="button"
                className="primary-button"
                disabled={
                  question.matching
                    ? links.length !== (question.prompts?.length ?? 0) ||
                      links.some((linked) => linked === null) ||
                      sent !== null
                    : marked.length === 0 || sent !== null
                }
                onClick={() =>
                  onAnswer(question.matching ? links.map((linked) => linked ?? -1) : marked)
                }
              >
                {question.matching
                  ? t('game.student.matchSend')
                  : question.ordered
                    ? t('game.student.orderSend')
                    : t('game.student.multiSend')}
              </button>
            </div>
          ) : null}

          {revealed && question.correct !== null ? (
            <p className="gq-stu-verdict" data-right={mine?.right ? 'yes' : 'no'}>
              {mine?.right
                ? t('game.student.right')
                : t('game.student.wrong', { letter: 'ABCD'[question.correct] ?? '' })}
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
