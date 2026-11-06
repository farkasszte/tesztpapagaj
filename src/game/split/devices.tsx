import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClassicEngine, createClassicSession } from '../classic/engine'
import type { ClassicSettings } from '../classic/types'
import { buildClassicView } from '../classic/views'
import type { PlayableWords } from '../projection'
import { newRoomCode } from '../room-protocol'
import { connectRoom, type RoomConnection } from '../room-client'
import type { Question } from '../types'
import { GameLobby } from '../lobby'
import { gameMessage } from '../messages'
import { useT } from '../../i18n/index'
import { SIDES, pairQuestions, sharedTimer, type Side } from './pair'
import { SplitStage } from './stage'

/**
 * Differenciált kvíz (tp#45): **egy szoba**, két motor.
 *
 * A diák a belépésnél választ oldalt (ez a „0. kérdés"), és onnantól csak a
 * saját oldala kérdéseit látja — a másik oldalét soha. A két oldal ugyanannyi
 * kérdést játszik (a hosszabbat a rövidebbre vágjuk), a kör és az idő közös, a
 * ponttábla pedig egy: a két motor játékosait a színpad fésüli össze.
 *
 * Azért ez az út a biztosabb a két szobás változatnál: a relay buta marad, egy
 * kód és egy QR van, és a diák kapcsolata nem szakad meg az oldalválasztáskor.
 */
export function SplitDevices({
  banks,
  settings,
  onExit,
}: {
  banks: { a: { name: string; questions: Question[]; words: Map<string, PlayableWords> }; b: { name: string; questions: Question[]; words: Map<string, PlayableWords> } }
  settings: Partial<ClassicSettings>
  onExit: () => void
}) {
  const t = useT()
  const [code] = useState(() => newRoomCode())
  const [engines] = useState(() => {
    const paired = pairQuestions(banks.a.questions, banks.b.questions)
    const timerSeconds = sharedTimer(settings.timerSeconds ?? 20, settings.timerSeconds ?? 20)
    const make = (questions: Question[], title: string) =>
      new ClassicEngine(
        createClassicSession({
          code,
          title,
          questions,
          settings: { scoring: true, ...settings, timerSeconds },
          noDevices: false,
        }),
      )
    return { a: make(paired.a, banks.a.name), b: make(paired.b, banks.b.name) }
  })
  const [, bump] = useReducer((count: number) => count + 1, 0)
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'denied'>('connecting')
  const [problem, setProblem] = useState<string | null>(null)

  const connection = useRef<RoomConnection | null>(null)
  /** relay-azonosító → { oldal, motor-játékos }. */
  const seats = useRef(new Map<string, { side: Side; playerId: string }>())
  const lastSeq = useRef({ a: -1, b: -1 })

  const sideOf = useCallback(
    (playerId: string): Side | null => {
      for (const side of SIDES) {
        if (engines[side].session.players.some((player) => player.id === playerId)) return side
      }
      return null
    },
    [engines],
  )

  const viewOf = useCallback(
    (playerId: string) => {
      const side = sideOf(playerId) ?? 'a'
      return buildClassicView(engines[side].session, { now: Date.now(), viewerId: playerId })
    },
    [engines, sideOf],
  )

  const broadcast = useCallback(() => {
    const live = connection.current
    if (!live?.open) return
    for (const [relayId, seat] of seats.current) {
      live.send({ kind: 'view', view: viewOf(seat.playerId) }, relayId)
    }
  }, [viewOf])

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
          const seat = seats.current.get(relayId)
          seats.current.delete(relayId)
          if (seat) engines[seat.side].setConnected(seat.playerId, false)
          bump()
        },
        reply: (from, payload) => {
          const message = payload as
            | { kind: 'join'; nickname: string; side?: Side; playerId?: string; secret?: string }
            | { kind: 'answer'; choice?: number; choices?: number[]; texts?: string[] }
          if (message?.kind === 'join') {
            const side: Side = message.side === 'b' ? 'b' : 'a'
            const result = engines[side].join({
              ...(message.playerId ? { playerId: message.playerId } : {}),
              ...(message.secret ? { secret: message.secret } : {}),
              nickname: message.nickname ?? '',
            })
            if (!result.ok) {
              live.send({ kind: 'refused', message: gameMessage(result.message) }, from)
              return
            }
            seats.current.set(from, { side, playerId: result.player.id })
            live.send(
              { kind: 'seat', playerId: result.player.id, secret: result.player.secret, nickname: result.player.nickname, side },
              from,
            )
            live.send({ kind: 'view', view: viewOf(result.player.id) }, from)
            bump()
            return
          }
          if (message?.kind === 'answer') {
            const seat = seats.current.get(from)
            if (!seat) return
            const engine = engines[seat.side]
            const result = message.texts
              ? engine.answerTexts(seat.playerId, message.texts)
              : engine.answerMany(seat.playerId, message.choices ?? [message.choice ?? -1])
            if (result.ok) bump()
          }
        },
      },
    })
    connection.current = live
    return () => live.leave()
  }, [broadcast, code, engines, t, viewOf])

  // A közös idő: a két motort ugyanabban az ütemben léptetjük.
  useEffect(() => {
    const timer = setInterval(() => {
      const a = engines.a.tick()
      const b = engines.b.tick()
      let changed = a || b
      for (const side of SIDES) {
        if (engines[side].session.seq !== lastSeq.current[side]) {
          lastSeq.current[side] = engines[side].session.seq
          changed = true
        }
      }
      if (changed) {
        broadcast()
        bump()
      }
    }, 400)
    return () => clearInterval(timer)
  }, [broadcast, bump, engines])

  const everyone = SIDES.flatMap((side) =>
    engines[side].session.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      connected: player.connected,
    })),
  )

  return (
    <>
      <GameLobby
        code={code}
        status={status}
        problem={problem}
        split
        players={everyone}
        onKick={(playerId) => {
          const side = sideOf(playerId)
          if (!side || !engines[side].kick(playerId).ok) return
          const entry = [...seats.current].find(([, seat]) => seat.playerId === playerId)
          if (entry) {
            connection.current?.send({ kind: 'refused', message: t('game.student.kicked') }, entry[0])
            seats.current.delete(entry[0])
          }
          bump()
        }}
        onStart={() => {
          engines.a.start()
          engines.b.start()
          broadcast()
          bump()
        }}
        onExit={onExit}
      />
      {engines.a.session.phase !== 'LOBBY' && engines.b.session.phase !== 'LOBBY'
        ? createPortal(
            <SplitStage
              engines={engines}
              names={{ a: banks.a.name, b: banks.b.name }}
              onExit={onExit}
            />,
            document.body,
          )
        : null}
    </>
  )
}
