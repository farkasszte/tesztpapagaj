import { useEffect, useRef, useState } from 'react'
import type { ClassicView } from './game/classic/views'
import type { View } from './game/views'
import type { PerilView } from './game/peril/views'
import type { Help } from './game/types'
import { cleanRoomCode, isRoomCode, type RoomCode } from './game/room-protocol'
import { connectRoom, type RoomConnection } from './game/room-client'
import { ClassicStudentGame } from './game-student-classic'
import { ChampionStudentGame } from './game-student-champion'
import { PerilStudentGame } from './game-peril-student'
import { useT } from './i18n'

/**
 * A diák telefonja: belépés a kóddal, majd a kérdés és a válasz.
 *
 * A diák nézete a tanár gépéről jön (`ClassicView` `me`-vel), így a helyes válasz
 * a felfedésig nem is szerepel a telefonon. A helyét a böngésző tárolója őrzi:
 * újratöltés vagy kiesett wifi után ugyanazzal a játékkal tér vissza.
 */

type Seat = { playerId: string; secret: string; nickname: string }

type StudentView = ClassicView | View | PerilView

function seatKey(code: RoomCode): string {
  return `testparrot.game-seat.${code}`
}

function readSeat(code: RoomCode): Seat | null {
  try {
    const raw = localStorage.getItem(seatKey(code))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Seat>
    if (typeof parsed.playerId !== 'string' || typeof parsed.secret !== 'string') return null
    return { playerId: parsed.playerId, secret: parsed.secret, nickname: parsed.nickname ?? '' }
  } catch {
    return null
  }
}

function writeSeat(code: RoomCode, seat: Seat): void {
  try {
    localStorage.setItem(seatKey(code), JSON.stringify(seat))
  } catch {
    // Magánböngészés: a játék ettől még megy, csak újratöltésnél nem tér vissza.
  }
}

export function GameStudent({ initialCode = '' }: { initialCode?: string }) {
  const t = useT()
  const [code, setCode] = useState<RoomCode>(() => cleanRoomCode(initialCode))
  const [typedCode, setTypedCode] = useState(initialCode)
  const [nickname, setNickname] = useState('')
  const [seat, setSeat] = useState<Seat | null>(null)
  const [view, setView] = useState<StudentView | null>(null)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'denied'>('idle')
  /** A relay nem válaszolt: a hálózat blokkolhatja. A „Kapcsolódás…" magában
   *  nem mondja meg, hogy itt nem lesz kapcsolat — ezt ki kell mondani. */
  const [unreachable, setUnreachable] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /** Amit már elküldtem: egy válasz, vagy több egy több helyes válaszos kérdésnél. */
  const [sent, setSent] = useState<number[] | null>(null)
  const connection = useRef<RoomConnection | null>(null)

  // Belépés: a kód ismeretében csatlakozunk, és vagy a régi helyünkre
  // jelentkezünk be, vagy új névvel kérünk helyet a tanártól.
  const join = (roomCode: RoomCode, name: string) => {
    if (!isRoomCode(roomCode)) {
      setProblem(t('game.student.badCode'))
      return
    }
    const stored = readSeat(roomCode)
    setSeat(stored)
    setStatus('connecting')
    setProblem(null)
    connection.current?.leave()
    const live = connectRoom({
      code: roomCode,
      role: 'player',
      handlers: {
        status: (next) => {
          if (next === 'open') {
            setStatus('open')
            setUnreachable(false)
          }
          if (next === 'connecting') setStatus((current) => (current === 'open' ? current : 'connecting'))
          if (next === 'closed') setUnreachable(true)
        },
        denied: (reason) => {
          setStatus('denied')
          setProblem(t(`game.devices.denied.${reason}` as never))
        },
        welcome: () => {
          // A tanár dönt a helyről: a meglévő jegyünkkel vagy új névvel kérjük.
          const mine = readSeat(roomCode)
          live.sendReply({
            kind: 'join',
            nickname: mine?.nickname || name,
            ...(mine ? { playerId: mine.playerId, secret: mine.secret } : {}),
          })
        },
        // A tanár üzenetei ugyanazon a csatornán jönnek: a hely, az elutasítás
        // és a játék nézete. A `kind` mondja meg, melyik melyik.
        view: (payload) => {
          const message = payload as
            | { kind: 'seat'; playerId: string; secret: string; nickname: string }
            | { kind: 'refused'; message: string }
            | { kind: 'note'; message: string }
            | { kind: 'view'; view: ClassicView | View | PerilView }
          if (message?.kind === 'seat') {
            const next: Seat = {
              playerId: message.playerId,
              secret: message.secret,
              nickname: message.nickname,
            }
            setSeat(next)
            setNickname(next.nickname)
            writeSeat(roomCode, next)
            setProblem(null)
            return
          }
          if (message?.kind === 'refused') {
            setProblem(message.message)
            // Kitették vagy lezárult a szoba: nincs értelme újrapróbálkozni.
            setStatus('denied')
            connection.current?.leave()
            return
          }
          if (message?.kind === 'note') {
            setProblem(message.message)
            return
          }
          if (message?.kind === 'view' && message.view) {
            setView(message.view)
            setSent(null)
          }
        },
      },
    })
    connection.current = live
  }

  useEffect(() => () => connection.current?.leave(), [])

  // A meglévő hely visszavétele (újratöltés, kiesett wifi): ez effekt, nem a
  // render mellékhatása — különben a szigorú mód kétszer nyitna kapcsolatot, és
  // a második azonnal el is zárná az elsőt.
  useEffect(() => {
    if (!isRoomCode(code)) return
    const stored = readSeat(code)
    if (!stored) return
    setNickname(stored.nickname)
    setSeat(stored)
    join(code, stored.nickname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // ── Belépő képernyők ────────────────────────────────────────────────────
  if (!isRoomCode(code)) {
    return (
      <div className="gq-stu">
        <form
          className="gq-stu-card"
          onSubmit={(event) => {
            event.preventDefault()
            const next = cleanRoomCode(typedCode)
            setCode(next)
            if (isRoomCode(next)) join(next, '')
          }}
        >
          <h1>{t('game.student.title')}</h1>
          <p className="gq-hint">{t('game.student.codeHint')}</p>
          <label className="gq-stu-field">
            {t('game.student.code')}
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={7}
              value={typedCode}
              onChange={(event) => setTypedCode(event.target.value)}
              placeholder="482 913"
            />
          </label>
          <button type="submit" className="primary-button">
            {t('game.student.continue')}
          </button>
          {problem ? <p className="gq-stu-problem">{problem}</p> : null}
        </form>
      </div>
    )
  }

  if (!seat || !nickname) {
    return (
      <div className="gq-stu">
        <form
          className="gq-stu-card"
          onSubmit={(event) => {
            event.preventDefault()
            const name = nickname.trim()
            if (name.length < 2) {
              setProblem(t('game.student.nameTooShort'))
              return
            }
            join(code, name)
          }}
        >
          <h1>{t('game.student.joinTitle')}</h1>
          <p className="gq-hint">{t('game.student.joinHint', { code: code.slice(0, 3) + ' ' + code.slice(3) })}</p>
          <label className="gq-stu-field">
            {t('game.student.nickname')}
            <input
              autoComplete="off"
              maxLength={24}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder={t('game.student.nicknamePlaceholder')}
            />
          </label>
          <button type="submit" className="primary-button">
            {t('game.student.join')}
          </button>
          {problem ? <p className="gq-stu-problem">{problem}</p> : null}
          {status === 'connecting' ? <p className="gq-hint">{t('game.student.connecting')}</p> : null}
          {unreachable && status !== 'open' ? (
            <p className="gq-stu-problem">{t('game.student.unreachable')}</p>
          ) : null}
        </form>
      </div>
    )
  }

  const reply = (payload: unknown) => connection.current?.sendReply(payload)

  if (view) {
    if (view.mode === 'champion') {
      return (
        <ChampionStudentGame
          view={view}
          nickname={nickname}
          problem={problem}
          sent={sent?.[0] ?? null}
          onAnswer={(attemptId, choice) => {
            setSent([choice])
            reply({ kind: 'answer', attemptId, choice })
          }}
          onOneAnswer={(attemptId, choice) => {
            setSent([choice])
            reply({ kind: 'one', attemptId, choice })
          }}
          onHelp={(help: Help) => reply({ kind: 'help', help })}
          onPoll={(choice) => reply({ kind: 'poll', choice })}
          onVote={(candidateId) => reply({ kind: 'vote', candidateId })}
        />
      )
    }
    if (view.mode === 'peril') {
      return (
        <PerilStudentGame
          view={view}
          nickname={nickname}
          problem={problem}
          sent={sent?.[0] ?? null}
          onChooseTeam={(teamId) => reply({ kind: 'team', teamId })}
          onPick={(column, row) => reply({ kind: 'pick', column, row })}
          onBuzz={() => reply({ kind: 'buzz' })}
          onWager={(amount) => reply({ kind: 'wager', amount })}
          onAnswer={(choice) => {
            setSent([choice])
            reply({ kind: 'answer', choice })
          }}
        />
      )
    }
    return (
      <ClassicStudentGame
        view={view}
        sent={sent}
        nickname={nickname}
        problem={problem}
        onAnswer={(choices, texts) => {
          setSent(choices)
          reply({
            kind: 'answer',
            choice: choices[0],
            choices,
            ...(texts ? { texts } : {}),
          })
        }}
      />
    )
  }

  return (
    <ClassicStudentGame
      view={null}
      sent={sent}
      nickname={nickname}
      problem={problem}
      onAnswer={() => undefined}
    />
  )
}
