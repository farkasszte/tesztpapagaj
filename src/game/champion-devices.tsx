import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Engine, createSession } from './engine'
import type { Help, Settings } from './types'
import { buildView } from './views'
import type { PlayableWords } from './projection'
import { newRoomCode, spacedRoomCode } from './room-protocol'
import { connectRoom, type RoomConnection } from './room-client'
import type { Question } from './types'
import { ChampionStage } from './champion-stage'
import { GameLobby } from './lobby'
import { gameMessage } from './messages'
import { useT } from '../i18n/index'

/**
 * A Bajnok mód diák-eszközökkel: a tanár füle a szoba, a diákok a telefonjukon.
 *
 * A tanár böngészője marad az igazság — a motor itt fut, a relay csak továbbít.
 * A diákok a saját nézetüket kapják (`buildView` `viewerId`-vel), tehát a
 * bajnok a kérdést csak akkor látja, amikor már ő jön, az osztály pedig soha nem
 * látja a bajnok válaszát a felfedésig.
 *
 * A színpad ugyanaz, mint a kivetítésnél: a tanár gombjai viszik a játékot
 * (osztály válaszol → a bajnok elé → felfedés), a diákok nézete pedig minden
 * motor-lépés után körözik.
 */

type Seat = { playerId: string; secret: string; nickname: string }

export function ChampionDevices({
  title,
  questions,
  words,
  settings,
  onExit,
}: {
  title: string
  questions: Question[]
  words: Map<string, PlayableWords>
  settings: Partial<Settings>
  onExit: () => void
}) {
  const t = useT()
  const [code] = useState(() => newRoomCode())
  const [engine] = useState(() =>
    new Engine(createSession({ code, setTitle: title, questions, settings, noDevices: false })),
  )
  const [, bump] = useReducer((count: number) => count + 1, 0)
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'denied'>('connecting')
  const [problem, setProblem] = useState<string | null>(null)
  const [started, setStarted] = useState(false)

  const connection = useRef<RoomConnection | null>(null)
  /** relay-azonosító → a motor játékos-azonosítója. */
  const seats = useRef(new Map<string, string>())
  const lastSeq = useRef(-1)

  const broadcast = useCallback(() => {
    const live = connection.current
    if (!live?.open) return
    for (const [relayId, playerId] of seats.current) {
      live.send(
        { kind: 'view', view: buildView(engine.session, { now: Date.now(), pauseReason: null, viewerId: playerId }) },
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
            | { kind: 'answer'; attemptId: string; choice: number }
            | { kind: 'one'; attemptId: string; choice: number }
            | { kind: 'help'; help: Help }
            | { kind: 'poll'; choice: number }
            | { kind: 'vote'; candidateId: string }
          if (message?.kind === 'join') {
            const result = engine.join({
              ...(message.playerId ? { playerId: message.playerId } : {}),
              ...(message.secret ? { secret: message.secret } : {}),
              nickname: message.nickname ?? '',
            })
            if (!result.ok) {
              live.send({ kind: 'refused', message: gameMessage(result.message) }, from)
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
          const run = () => {
            switch (message.kind) {
              case 'answer':
                return engine.answer(playerId, message.attemptId, message.choice)
              case 'one':
                return engine.oneAnswer(playerId, message.attemptId, message.choice)
              case 'poll':
                return engine.helpPoll(playerId, message.choice)
              case 'help':
                return message.help === 'ask' ? engine.helpAsk(playerId) : engine.helpTrust(playerId)
              case 'vote':
                return engine.rescueVote(playerId, message.candidateId)
              default:
                return null
            }
          }
          const result = run()
          if (result && !result.ok) return
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
      <ChampionStage
        title={title}
        questions={questions}
        words={words}
        settings={settings}
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
      startDisabled={engine.session.players.filter((player) => player.connected).length < 2}
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
        if (engine.startGame().ok) {
          setStarted(true)
          broadcast()
        }
      }}
      onExit={onExit}
    />
  )
}
