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
  sent: number | null
  nickname: string
  problem: string | null
  onAnswer: (choice: number) => void
}) {
  const t = useT()
  const question = view?.question ?? null
  const mine = view?.me ?? null
  const revealed = view?.phase === 'REVEAL'
  const ended = view?.phase === 'REPORT' || view?.phase === 'ENDED'

  // A visszaszámláló a legutóbb kapott nézetből indul, és magától ketyeg.
  const remaining = question?.remainingMs ?? null
  const [left, setLeft] = useState(0)
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

          <div className="gq-stu-choices">
            {question.choices.map((choice, index) => {
              const picked = sent === index || mine?.answer === index
              const tone = choiceTone({ index, correctIndex: revealed ? question.correct : null, picked })
              const disabled = view?.phase !== 'QUESTION' || mine?.canAnswer === false || sent !== null
              return (
                <button
                  key={index}
                  type="button"
                  className="gq-stu-choice"
                  data-tone={tone}
                  disabled={disabled}
                  onClick={() => onAnswer(index)}
                >
                  <span className="gq-stu-letter">{'ABCD'[index] ?? index + 1}</span>
                  <span className="gq-stu-choice-words">
                    <StudentBlocks rich={question.rich?.choices?.[index]} plain={choice} />
                  </span>
                </button>
              )
            })}
          </div>

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
