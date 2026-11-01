import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClassicEngine, createClassicSession } from './game/classic/engine'
import type { ClassicSettings } from './game/classic/types'
import { buildClassicView } from './game/classic/views'
import type { PlayableWords } from './game/projection'
import { newRoomCode, spacedRoomCode } from './game/room-protocol'
import { connectRoom, type RoomConnection } from './game/room-client'
import type { Question } from './game/types'
import { GameLobby } from './game-lobby'
import { ClassicStage } from './game-stage'
import { useT } from './i18n'

/**
 * A Klasszikus mód diák-eszközökkel: a tanár füle a szoba, a diákok a telefonjukon.
 *
 * A tanár böngészője marad az igazság — a szabályok a motorból jönnek, a relay
 * csak továbbít. A lobbi a szobakódot és a QR-t mutatja; a játék közben minden
 * diák a saját nézetét kapja (`buildClassicView` `viewerId`-vel), tehát a helyes
 * válasz a felfedésig senki telefonjára nem megy ki.
 *
 * A motor minden lépése (`seq`) kivált egy körözést: a tanár színpadán ugyanaz a
 * példány fut, a diákokhoz pedig a friss nézet megy — így a két felület sosem
 * csúszik el egymástól.
 */

type Seat = { playerId: string; secret: string; nickname: string }

export function ClassicDevices({
  title,
  questions,
  words,
  settings,
  onExit,
}: {
  title: string
  questions: Question[]
  words: Map<string, PlayableWords>
  settings: Partial<ClassicSettings>
  onExit: () => void
}) {
  const t = useT()
  const [code] = useState(() => newRoomCode())
  const [engine] = useState(() =>
    new ClassicEngine(
      // Eszközön pont is gyűlik: ezért van a telefonon pontszám.
      createClassicSession({
        code,
        title,
        questions,
        settings: { scoring: true, ...settings },
        noDevices: false,
      }),
    ),
  )
  const [, bump] = useReducer((count: number) => count + 1, 0)
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'denied'>('connecting')
  const [problem, setProblem] = useState<string | null>(null)
  const [started, setStarted] = useState(false)

  const connection = useRef<RoomConnection | null>(null)
  /** relay-azonosító → a motor játékos-azonosítója. */
  const seats = useRef(new Map<string, string>())
  const lastSeq = useRef(-1)

  /** Mindenkinek a saját nézete; a tanár színpada a sajátját maga rajzolja. */
  const broadcast = useCallback(() => {
    const live = connection.current
    if (!live?.open) return
    for (const [relayId, playerId] of seats.current) {
      // A tanár minden üzenete `kind`-del jelölt: a diák ebből tudja, hogy ez
      // játéknnézet és nem a helyét kiosztó válasz.
      live.send({ kind: 'view', view: buildClassicView(engine.session, { now: Date.now(), viewerId: playerId }) }, relayId)
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
          // Újracsatlakozás után minden diák a saját nézetét kapja újra.
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
          if (message?.kind === 'answer') {
            const playerId = seats.current.get(from)
            if (!playerId) return
            const result = engine.answer(playerId, message.choice)
            if (!result.ok) return
            bump()
            broadcast()
          }
        },
      },
    })
    connection.current = live
    return () => live.leave()
  }, [broadcast, code, engine, t])

  // A motor bármely lépése (új kérdés, zárás, válasz) köröz: a diákok friss
  // nézetet kapnak, a tanár színpada pedig újrarajzolódik. Az óra lejártát is
  // itt vesszük észre, hogy a válaszok lezáródjanak.
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
      <ClassicStage
        title={title}
        questions={questions}
        words={words}
        settings={settings}
        onExit={onExit}
        engine={engine}
        hint={t('game.devices.stageHint')}
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
        if (engine.start().ok) {
          setStarted(true)
          broadcast()
        }
      }}
      onExit={onExit}
    />
  )
}
