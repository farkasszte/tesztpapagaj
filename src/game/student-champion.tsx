import { useEffect, useState } from 'react'
import type { View } from './views'
import type { Help } from './types'
import { TINCTURES } from './parts'
import { Heart } from './shapes'
import { StudentBlocks } from './student-blocks'
import { choiceTone } from './student-tone'
import { useT, type TextKey } from '../i18n/index'
import { TextSizeControl } from './text-size'
import { AvatarPicker } from './avatar-picker'

/**
 * A Bajnok mód diák-nézete.
 *
 * A szabályok a tanár gépén futnak; itt csak az látszik, amit a saját nézet
 * (`self`) megenged: a bajnok a kérdést csak akkor látja, amikor már ő jön, az
 * osztály a saját tippjét, a felfedés után pedig mindenki a helyes választ.
 * A bajnok három segítsége (kikérdezés, két tanácsadó, az osztállyal) a
 * telefonján nyílik, és a tanár gépe számolja ki az eredményt.
 */

const HELP_LABELS: Record<Help, TextKey> = {
  poll: 'game.champion.helpPoll',
  ask: 'game.champion.helpAsk',
  trust: 'game.champion.helpTrust',
}

export function ChampionStudentGame({
  view,
  nickname,
  avatar,
  onRollAvatar,
  problem,
  sent,
  onAnswer,
  onOneAnswer,
  onHelp,
  onPoll,
  onVote,
}: {
  view: View | null
  nickname: string
  /** A figura magja; ha nincs, a becenévből képzett. */
  avatar?: string
  onRollAvatar?: () => void
  problem: string | null
  sent: number | null
  /** Az osztály válasza (Phase A). */
  onAnswer: (attemptId: string, choice: number) => void
  /** A bajnok válasza (Phase B). */
  onOneAnswer: (attemptId: string, choice: number) => void
  /** Segítség kérése: kikérdezés, két tanácsadó, az osztállyal. */
  onHelp: (help: Help) => void
  /** Kikérdezésnél melyik válaszról kérdez. */
  onPoll: (choice: number) => void
  /** Szavazat a visszahozottakra. */
  onVote: (candidateId: string) => void
}) {
  const t = useT()
  const [polling, setPolling] = useState(false)
  const [left, setLeft] = useState(0)

  const question = view?.question ?? null
  const self = view?.self ?? null
  const phase = view?.phase ?? 'LOBBY'
  const reveal = question?.reveal ?? null

  const remaining = question?.remainingMs ?? null
  useEffect(() => {
    if (remaining === null) return
    setLeft(Math.ceil(remaining / 1000))
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [remaining])

  // A felfedés után a kikérdezés alapállapotba kerül.
  useEffect(() => {
    if (phase === 'REVEAL') setPolling(false)
  }, [phase])

  const isOne = self?.role === 'one'
  const correctIndex = reveal ? reveal.correct : null
  const myChoice = self?.myAnswer ?? null
  const answered = sent !== null || myChoice !== null

  const choices = question?.choices ?? null
  const prompt = question?.prompt ?? null

  const role = isOne
    ? t('game.champStudent.youAreOne')
    : self?.role === 'crowd'
      ? t('game.champStudent.youAreCrew')
      : t('game.champStudent.youAreClass')

  const canClassAnswer = phase === 'PHASE_A' && !!self?.eligible && !answered && !!choices
  const canOneAnswer = phase === 'PHASE_B' && !!isOne && !answered && !!choices

  const choose = (index: number) => {
    if (!question) return
    if (polling) {
      onPoll(index)
      setPolling(false)
      return
    }
    if (canOneAnswer) onOneAnswer(question.attemptId, index)
    else if (canClassAnswer) onAnswer(question.attemptId, index)
  }

  return (
    <div className="gq-stu">
      <TextSizeControl />
      <header className="gq-stu-bar">
        <AvatarPicker seed={avatar ?? nickname} size={26} inHeader onRoll={onRollAvatar ?? (() => undefined)} />
        <span className="gq-stu-name">{nickname}</span>
        <span className="gq-stu-role" data-one={isOne ? 'yes' : 'no'}>
          {role}
        </span>
        {self ? <span className="gq-stu-points">{t('game.student.points', { points: self.points })}</span> : null}
        {/* Ugyanaz az életjelző, mint a tanár színpadán: a diák a tenyerén is
            látja, hány hibalehetősége van még. */}
        {view?.game ? (
          <span
            className="gq-stu-hearts"
            aria-label={t('game.champion.strikes') + ': ' + view.game.strikes}
          >
            {Array.from({ length: Math.max(0, view.game.strikes) }, (_, index) => (
              <Heart key={`live-${index}`} used />
            ))}
            {Array.from({ length: Math.max(0, view.game.baseStrikes - view.game.strikes) }, (_, index) => (
              <Heart key={`lost-${index}`} />
            ))}
          </span>
        ) : null}
      </header>

      {view?.game ? (
        <p className="gq-stu-stats">
          {t('game.champStudent.stats', {
            pot: view.game.bank,
            strikes: view.game.strikes,
            round: view.game.ordinal,
          })}
        </p>
      ) : null}

      {phase === 'RESCUE' && view?.rescue ? (
        <section className="gq-stu-question">
          <h1 className="gq-stu-title">{t('game.champStudent.rescueTitle')}</h1>
          <p className="gq-hint">{t('game.champStudent.rescueHint')}</p>
          <div className="gq-stu-choices">
            {view.rescue.candidates.map((candidate, index) => {
              const mine = self?.rescueVote === candidate.id
              return (
                <button
                  key={candidate.id}
                  type="button"
                  className="gq-stu-choice"
                  data-tone={mine ? 'picked' : 'idle'}
                  style={{ ['--c' as string]: TINCTURES[index] ?? TINCTURES[0] }}
                  disabled={!!self?.rescueVote || view.rescue?.settled}
                  onClick={() => onVote(candidate.id)}
                >
                  <span className="gq-stu-letter">↑</span>
                  <span className="gq-stu-choice-words">
                    {candidate.nickname}
                    {candidate.votes > 0 ? ` · ${t('game.champStudent.votes', { count: candidate.votes })}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
          {self?.rescueVote ? <p className="gq-hint">{t('game.champStudent.voted')}</p> : null}
          {view.rescue.rescued ? (
            <p className="gq-stu-verdict" data-right="yes">
              {t('game.champStudent.rescued', { name: view.rescue.rescued.nickname })}
            </p>
          ) : null}
        </section>
      ) : null}

      {phase !== 'RESCUE' && prompt && choices ? (
        <section className="gq-stu-question">
          <div className="gq-stu-prompt">
            <StudentBlocks rich={question?.rich?.prompt} plain={prompt} />
          </div>
          {remaining !== null ? (
            <p className="gq-stu-clock" aria-live="off">
              {left} s
            </p>
          ) : null}

          <div className="gq-stu-choices">
            {choices.map((choice, index) => {
              const picked = sent === index || myChoice === index
              const tone = choiceTone({ index, correctIndexes: correctIndex === null ? null : [correctIndex], picked })
              return (
                <button
                  key={index}
                  type="button"
                  className="gq-stu-choice"
                  data-tone={tone}
                  style={{ ['--c' as string]: TINCTURES[index] ?? TINCTURES[0] }}
                  disabled={!canClassAnswer && !canOneAnswer && !polling}
                  onClick={() => choose(index)}
                >
                  <span className="gq-stu-letter">{'ABCD'[index] ?? index + 1}</span>
                  <span className="gq-stu-choice-words">
                    <StudentBlocks rich={question?.rich?.choices?.[index]} plain={choice} />
                  </span>
                </button>
              )
            })}
          </div>

          {polling ? <p className="gq-hint">{t('game.champStudent.pollPick')}</p> : null}

          {canOneAnswer && view?.game ? (
            <div className="gq-stu-helps">
              {(Object.keys(HELP_LABELS) as Help[]).map((help) => (
                <button
                  key={help}
                  type="button"
                  className="gq-stu-help"
                  disabled={!view?.game?.helpsAvailable[help] || question?.helpUsed !== null}
                  onClick={() => {
                    if (help === 'poll') {
                      setPolling(true)
                      return
                    }
                    onHelp(help)
                  }}
                >
                  {t(HELP_LABELS[help])}
                </button>
              ))}
            </div>
          ) : null}

          {question?.helpResult?.type === 'poll' ? (
            <p className="gq-stu-why">
              {t('game.champion.helpPollResult', {
                count: question.helpResult.count,
                total: question.helpResult.total,
              })}
            </p>
          ) : null}
          {question?.helpResult?.type === 'ask' ? (
            <p className="gq-stu-why">
              {question.helpResult.speakers.map((speaker) => speaker.nickname).join(' · ') || '—'}
            </p>
          ) : null}

          {reveal && correctIndex !== null ? (
            <p
              className="gq-stu-verdict"
              data-right={
                (isOne ? reveal.oneCorrect : myChoice === correctIndex) ? 'yes' : 'no'
              }
            >
              {isOne
                ? reveal.oneCorrect
                  ? t('game.champStudent.oneRight', { delta: reveal.bankDelta })
                  : t('game.champStudent.oneWrong')
                : myChoice === correctIndex
                  ? t('game.student.right')
                  : t('game.student.wrong', { letter: 'ABCD'[correctIndex] ?? '' })}
            </p>
          ) : null}
          {reveal && question?.rich?.explanation ? (
            <div className="gq-stu-why">
              <StudentBlocks rich={question.rich.explanation} plain={reveal.explanation ?? ''} />
            </div>
          ) : null}
        </section>
      ) : null}

      {phase !== 'RESCUE' && !prompt ? (
        <section className="gq-stu-card">
          <h1>{phase === 'ENDED' || phase === 'LEADERBOARD' ? t('game.student.over') : t('game.champStudent.waiting')}</h1>
          <p className="gq-hint">
            {phase === 'PHASE_A'
              ? t('game.champStudent.classOnly')
              : phase === 'PHASE_B'
                ? t('game.champStudent.oneOnly')
                : t('game.student.waitingHint')}
          </p>
          {phase === 'ENDED' || phase === 'LEADERBOARD' ? (
            <p className="gq-stu-result">{t('game.student.points', { points: self?.points ?? 0 })}</p>
          ) : null}
        </section>
      ) : null}

      {problem ? <p className="gq-stu-problem">{problem}</p> : null}
    </div>
  )
}
