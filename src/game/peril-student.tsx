import { RemoteButton } from './remote-control'
import { useEffect, useState } from 'react'
import type { PerilView } from './peril/views'
import { StudentBlocks } from './student-blocks'
import { choiceTone } from './student-tone'
import { useT } from '../i18n/index'
import { TextSizeControl } from './text-size'
import { AvatarPicker } from './avatar-picker'

/**
 * A Veszély! diák-nézete: csapatválasztás, mezőválasztás, buzzer, tét, válasz.
 *
 * A szabályok a tanár gépén futnak; itt csak az látszik, amit a saját nézet
 * (`me.canPick`, `me.canBuzz`, `me.canWager`, `me.canAnswer`) megenged. A
 * buzzerre koppintás sorrendje a tanár gépén dől el (a relay érkezési
 * sorrendje), nem a telefonokon — így nincs „ki nyomott előbb” vita.
 */
export function PerilStudentGame({
  view,
  nickname,
  avatar,
  onRollAvatar,
  onOpenRemote,
  problem,
  sent,
  onChooseTeam,
  onPick,
  onBuzz,
  onWager,
  onAnswer,
}: {
  view: PerilView | null
  nickname: string
  /** A figura magja; ha nincs, a becenévből képzett. */
  avatar?: string
  onRollAvatar?: () => void
  /** Ezzel lesz a telefonból távirányító (a tanár saját eszköze). */
  onOpenRemote?: () => void
  problem: string | null
  sent: number | null
  onChooseTeam: (teamId: string) => void
  onPick: (column: number, row: number) => void
  onBuzz: () => void
  onWager: (amount: number) => void
  onAnswer: (choice: number) => void
}) {
  const t = useT()
  const [wagerText, setWagerText] = useState('')
  const [left, setLeft] = useState(0)

  const me = view?.me ?? null
  const phase = view?.phase ?? 'LOBBY'
  const open = view?.open ?? null
  const myTeam = view?.teams.find((team) => team.id === me?.teamId) ?? null

  const remaining = open?.remainingMs ?? null
  useEffect(() => {
    if (remaining === null) return
    setLeft(Math.ceil(remaining / 1000))
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [remaining])

  const revealed = phase === 'REVEAL'
  const correctIndex = open?.correct ?? null

  return (
    <div className="gq-stu">
      <TextSizeControl />
      <header className="gq-stu-bar">
        <AvatarPicker seed={avatar ?? nickname} size={26} inHeader onRoll={onRollAvatar ?? (() => undefined)} />
        <span className="gq-stu-name">{nickname}</span>
        {onOpenRemote ? <RemoteButton onOpen={onOpenRemote} /> : null}
        {myTeam ? <span className="gq-stu-role">{myTeam.name}</span> : null}
        {me ? <span className="gq-stu-points">{t('game.student.points', { points: me.points })}</span> : null}
      </header>

      {phase === 'LOBBY' ? (
        <section className="gq-stu-card">
          <h1>{t('game.perilStu.teamTitle')}</h1>
          <p className="gq-hint">{t('game.perilStu.teamHint')}</p>
          <div className="gq-stu-choices">
            {(view?.teams ?? []).map((team) => (
              <button
                key={team.id}
                type="button"
                className="gq-stu-choice"
                data-tone={me?.teamId === team.id ? 'picked' : 'idle'}
                onClick={() => onChooseTeam(team.id)}
              >
                <span className="gq-stu-letter">⚑</span>
                <span className="gq-stu-choice-words">
                  {team.name}
                  <small className="gq-stu-team-members">
                    {team.members.map((member) => member.nickname).join(' · ') || '—'}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {problem ? <p className="gq-stu-problem">{problem}</p> : null}
        </section>
      ) : null}

      {phase === 'BOARD' ? (
        <section className="gq-stu-question">
          <h1 className="gq-stu-title">{t('game.perilStu.boardTitle')}</h1>
          {me?.canPick ? (
            <p className="gq-hint">{t('game.perilStu.pickHint')}</p>
          ) : (
            <p className="gq-hint">{t('game.perilStu.controlOther', { name: view?.control?.name ?? '' })}</p>
          )}
          <div className="gq-stu-board">
            {(view?.board ?? []).map((column, columnIndex) => (
              <div key={columnIndex} className="gq-stu-column">
                <span className="gq-stu-column-title">{column.title}</span>
                {column.tiles.map((tile, rowIndex) => (
                  <button
                    key={rowIndex}
                    type="button"
                    className="gq-stu-tile"
                    data-played={tile.played ? 'yes' : 'no'}
                    disabled={tile.played || !me?.canPick}
                    onClick={() => onPick(columnIndex, rowIndex)}
                  >
                    {tile.played ? '·' : tile.value}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {phase === 'READING' && open ? (
        <section className="gq-stu-card">
          <h1>{t('game.perilStu.reading', { value: open.value })}</h1>
          <p className="gq-hint">{t('game.perilStu.readingHint')}</p>
        </section>
      ) : null}

      {phase === 'BUZZING' ? (
        <section className="gq-stu-card">
          <h1>{t('game.perilStu.buzzTitle')}</h1>
          {me?.canBuzz ? (
            <button type="button" className="gq-stu-buzz" onClick={onBuzz}>
              {t('game.perilStu.buzz')}
            </button>
          ) : (
            <p className="gq-hint">{t('game.perilStu.buzzWaiting')}</p>
          )}
          {remaining !== null ? (
            <p className="gq-stu-clock" aria-live="off">
              {left} s
            </p>
          ) : null}
          {open?.lockedOut.length ? (
            <p className="gq-hint">{t('game.perilStu.lockedOut', { names: open.lockedOut.join(', ') })}</p>
          ) : null}
        </section>
      ) : null}

      {phase === 'WAGERING' && open ? (
        <section className="gq-stu-card">
          <h1>{t('game.perilStu.wagerTitle')}</h1>
          <p className="gq-hint">{t('game.perilStu.wagerHint', { max: me?.maxWager ?? 0 })}</p>
          {me?.canWager ? (
            <form
              className="gq-stu-wager"
              onSubmit={(event) => {
                event.preventDefault()
                const amount = Number(wagerText)
                if (!Number.isFinite(amount)) return
                onWager(Math.max(0, Math.min(me?.maxWager ?? 0, Math.round(amount))))
                setWagerText('')
              }}
            >
              <input
                inputMode="numeric"
                value={wagerText}
                onChange={(event) => setWagerText(event.target.value)}
                placeholder={String(me?.maxWager ?? 0)}
                aria-label={t('game.perilStu.wagerTitle')}
              />
              <button type="submit" className="primary-button">
                {t('game.peril.wagerGo')}
              </button>
            </form>
          ) : me?.myWager != null ? (
            <p className="gq-stu-result">{t('game.perilStu.myWager', { amount: me.myWager })}</p>
          ) : (
            <p className="gq-hint">{t('game.perilStu.waitWager')}</p>
          )}
          {open.teamWagers?.length ? (
            <ul className="gq-stu-wagers">
              {open.teamWagers.map((entry) => (
                <li key={entry.nickname}>
                  {entry.nickname}: {entry.amount}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {(phase === 'ANSWERING' || phase === 'REVEAL') && open ? (
        <section className="gq-stu-question">
          <div className="gq-stu-prompt">
            <StudentBlocks rich={open.rich?.prompt} plain={open.prompt ?? ''} />
          </div>
          <p className="gq-stu-answering">{t('game.peril.answering', { name: open.answering ?? '' })}</p>
          <div className="gq-stu-choices">
            {(open.choices ?? []).map((choice, index) => {
              const picked = sent === index || me?.myVote === index
              const tone = choiceTone({ index, correctIndexes: correctIndex === null ? null : [correctIndex], picked })
              return (
                <button
                  key={index}
                  type="button"
                  className="gq-stu-choice"
                  data-tone={tone}
                  disabled={!me?.canAnswer || sent !== null}
                  onClick={() => onAnswer(index)}
                >
                  <span className="gq-stu-letter">{'ABCD'[index] ?? index + 1}</span>
                  <span className="gq-stu-choice-words">
                    <StudentBlocks rich={open.rich?.choices?.[index]} plain={choice} />
                  </span>
                </button>
              )
            })}
          </div>
          {open.tally ? (
            <p className="gq-hint">
              {open.tally.map((count, index) => `${'ABCD'[index]}: ${count}`).join(' · ')}
              {` — ${open.voted}/${open.voters}`}
            </p>
          ) : null}
          {revealed && open.result ? (
            <p className="gq-stu-verdict" data-right={open.result.correct ? 'yes' : 'no'}>
              {open.result.correct
                ? t('game.perilStu.right', { points: open.result.points })
                : t('game.perilStu.wrong', { letter: correctIndex === null ? '' : ('ABCD'[correctIndex] ?? '') })}
            </p>
          ) : null}
          {revealed && open.rich?.explanation ? (
            <div className="gq-stu-why">
              <StudentBlocks rich={open.rich.explanation} plain={open.explanation ?? ''} />
            </div>
          ) : null}
        </section>
      ) : null}

      {phase === 'FINAL' || phase === 'ENDED' ? (
        <section className="gq-stu-card">
          <h1>{t('game.student.over')}</h1>
          <ul className="gq-stu-wagers">
            {(view?.standings ?? []).map((standing) => (
              <li key={standing.rank}>
                {standing.name}: {standing.points}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {problem ? <p className="gq-stu-problem">{problem}</p> : null}
    </div>
  )
}
