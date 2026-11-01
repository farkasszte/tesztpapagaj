import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PerilEngine, createPerilSession } from './game/peril/engine'
import { buildPerilView } from './game/peril/views'
import { perilBoard } from './game/peril-board'
import type { PlayableWords } from './game/projection'
import { newRoomCode, spacedRoomCode } from './game/room-protocol'
import { connectRoom, type RoomConnection } from './game/room-client'
import type { Question } from './game/types'
import { PerilStage } from './game-peril-stage'
import { GameLobby } from './game-lobby'
import { useT } from './i18n'

/**
 * A Veszély! diák-eszközökkel: a tanár füle a tábla, a diákok a telefonjukon.
 *
 * A csapatok a lobliban alakulnak (a diákok maguk választanak), a mezőt a soron
 * lévő csapat koppintja a telefonján, a buzzert a diákok nyomják — és a tanár
 * gépe dönti el, ki nyomott előbb, mert a relay érkezési sorrendjében érkeznek
 * a jelzések. A szabályok a `game/peril/engine.ts`-ben vannak, itt csak a
 * szoba és a nézetek körözése.
 */

type Seat = { playerId: string; secret: string; nickname: string }

/** A lobliban ennyi csapat indul; a tanár a színpadon nem nevezi el őket. */
const TEAM_NAMES = ['Csapat 1', 'Csapat 2', 'Csapat 3', 'Csapat 4']

export function PerilDevices({
  title,
  questions,
  words,
  onExit,
}: {
  title: string
  questions: Question[]
  words: Map<string, PlayableWords>
  onExit: () => void
}) {
  const t = useT()
  const [code] = useState(() => newRoomCode())
  const [engine] = useState(
    () =>
      new PerilEngine(
        createPerilSession({
          code,
          settings: { teams: { names: TEAM_NAMES, assign: 'auto' } },
          noDevices: false,
        }),
      ),
  )
  const [, bump] = useReducer((count: number) => count + 1, 0)
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'denied'>('connecting')
  const [problem, setProblem] = useState<string | null>(null)
  const [started, setStarted] = useState(false)

  const connection = useRef<RoomConnection | null>(null)
  const seats = useRef(new Map<string, string>())
  const lastSeq = useRef(-1)

  const broadcast = useCallback(() => {
    const live = connection.current
    if (!live?.open) return
    for (const [relayId, playerId] of seats.current) {
      live.send(
        { kind: 'view', view: buildPerilView(engine.session, { now: Date.now(), viewerId: playerId }) },
        relayId,
      )
    }
  }, [engine])

  useEffect(() => {
    const live = connectRoom({
      code,
      role: 'host',
      handlers: {
        status: setStatus,
        denied: (reason) => setProblem(t(`game.devices.denied.${reason}` as never)),
        welcome: () => {
          setProblem(null)
          broadcast()
        },
        left: (relayId) => {
          const playerId = seats.current.get(relayId)
          seats.current.delete(relayId)
          if (playerId) engine.setConnected(playerId, false)
          bump()
        },
        reply: (from, payload) => {
          const message = payload as
            | { kind: 'join'; nickname: string; playerId?: string; secret?: string }
            | { kind: 'team'; teamId: string }
            | { kind: 'pick'; column: number; row: number }
            | { kind: 'buzz' }
            | { kind: 'wager'; amount: number }
            | { kind: 'answer'; choice: number }

          if (message?.kind === 'join') {
            const result = engine.join({
              ...(message.playerId ? { playerId: message.playerId } : {}),
              ...(message.secret ? { secret: message.secret } : {}),
              nickname: message.nickname ?? '',
            })
            if (!result.ok) {
              live.send({ kind: 'refused', message: result.message }, from)
              return
            }
            seats.current.set(from, result.player.id)
            const seat: Seat = {
              playerId: result.player.id,
              secret: result.player.secret,
              nickname: result.player.nickname,
            }
            live.send({ kind: 'seat', ...seat }, from)
            bump()
            broadcast()
            return
          }

          const playerId = seats.current.get(from)
          if (!playerId) return
          const result =
            message.kind === 'team'
              ? engine.chooseTeam(playerId, message.teamId)
              : message.kind === 'pick'
                ? engine.pickTile(message.column, message.row, playerId)
                : message.kind === 'buzz'
                  ? engine.buzz(playerId)
                  : message.kind === 'wager'
                    ? engine.wager(playerId, message.amount)
                    : message.kind === 'answer'
                      ? engine.answer(playerId, message.choice)
                      : null
          if (result && !result.ok) {
            // A buzzert elhibázó diák kapjon visszajelzést, ne csendet.
            if (message.kind === 'buzz' || message.kind === 'wager' || message.kind === 'answer') {
              live.send({ kind: 'note', message: result.message ?? '', at: Date.now() }, from)
            }
            return
          }
          bump()
          broadcast()
        },
      },
    })
    connection.current = live
    return () => live.leave()
  }, [broadcast, code, engine, t])

  useEffect(() => {
    const timer = setInterval(() => {
      if (engine.tick()) bump()
      if (engine.session.seq !== lastSeq.current) {
        lastSeq.current = engine.session.seq
        broadcast()
        bump()
      }
    }, 400)
    return () => clearInterval(timer)
  }, [broadcast, engine])

  if (started) {
    return createPortal(
      <PerilStage
        title={title}
        questions={questions}
        words={words}
        onExit={onExit}
        engine={engine}
        status={
          <>
            <span className="gq-pin">{spacedRoomCode(code)}</span>
            <span className="gq-players">
              {t('game.devices.joined', { count: engine.session.players.filter((p) => p.connected).length })}
            </span>
          </>
        }
      />,
      document.body,
    )
  }

  return (
    <GameLobby
      code={code}
      status={status}
      problem={problem}
      players={engine.session.players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        connected: player.connected,
      }))}
      onKick={(playerId) => {
        if (!engine.kick(playerId).ok) return
        const entry = [...seats.current].find(([, id]) => id === playerId)
        if (entry) {
          connection.current?.send({ kind: 'refused', message: t('game.student.kicked') }, entry[0])
          seats.current.delete(entry[0])
        }
        bump()
      }}
      onStart={() => {
        const board = perilBoard(questions, {
          untitled: (index) => t('game.peril.column', { n: index + 1 }),
          treasureTrove: true,
        })
        if (!engine.startBoard(board).ok) return
        setStarted(true)
        broadcast()
      }}
      onExit={onExit}
    />
  )
}
