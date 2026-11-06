import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClassicEngine, createClassicSession } from './classic/engine'
import type { ClassicSettings } from './classic/types'
import { buildClassicView } from './classic/views'
import { BossStage, RaceStage } from './mode-stages'
import { missedBy } from './classic/misses'
import { cardOf } from './flashcard'
import type { ReviewView } from './review-deck'
import type { PlayableWords } from './projection'
import { newRoomCode, spacedRoomCode } from './room-protocol'
import { connectRoom, type RoomConnection } from './room-client'
import type { Question } from './types'
import { GameLobby } from './lobby'
import { gameMessage } from './messages'
import { ClassicStage } from './stage'
import { useT } from '../i18n/index'

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
  stage = 'classic',
  bankId,
}: {
  title: string
  questions: Question[]
  words: Map<string, PlayableWords>
  settings: Partial<ClassicSettings>
  onExit: () => void
  /** Melyik bankból indult a játék — az eredmény innen visszakereshető. */
  bankId?: string
  /** Melyik színpadot rajzolja: a Klasszikusét, a futamét vagy a szörnyét. */
  stage?: 'classic' | 'race' | 'boss'
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

  /** Egy diák nézete: a körözés és az azonnali bemutatkozás is ezt használja. */
  const viewOf = useCallback((playerId: string) => buildClassicView(engine.session, {
    now: Date.now(),
    viewerId: playerId,
    ...(stage === 'classic' ? {} : { theme: stage }),
  }), [engine, stage])

  /** Mindenkinek a saját nézete; a tanár színpada a sajátját maga rajzolja. */
  const broadcast = useCallback(() => {
    const live = connection.current
    if (!live?.open) return
    // A játék végén a napló már tudja, ki mit rontott el: mindenki a saját
    // hibalistáját kapja, hogy a telefonján hét napig átnézhesse.
    const session = engine.session
    const closing = session.phase === 'REPORT' || session.phase === 'ENDED'
    const missed = closing ? missedBy(session) : null
    for (const [relayId, playerId] of seats.current) {
      // A tanár minden üzenete `kind`-del jelölt: a diák ebből tudja, hogy ez
      // játéknnézet és nem a helyét kiosztó válasz.
      live.send({ kind: 'view', view: viewOf(playerId) }, relayId)
      const wrong = missed?.get(playerId)
      if (!wrong?.length) continue
      const cards = wrong.map(cardOf).filter((card) => card.answers.length > 0)
      if (cards.length === 0) continue
      const review: ReviewView = {
        mode: 'review',
        // Egy játék egy pakli: újrajátszásnál ugyanez az azonosító írja felül.
        deckId: `${session.code}:${playerId}`,
        title: session.title,
        cards,
      }
      live.send({ kind: 'view', view: review }, relayId)
    }
  }, [engine, viewOf])

  /**
   * Összevont körözés.
   *
   * A relay-üzenet a Cloudflare ingyenes keretében **kérés**, és a tanár minden
   * válasz után eddig mindenkinek külön nézetet küldött: húsz diák húsz
   * válasza húsz teljes körözést jelentett, azaz diákonként négyzetes forgalmat.
   * A válasz viszont a diáknál helyben is megjelenik, a többieknek pedig csak a
   * felfedéskor kell új nézet — ezért a belépés és a válasz **legfeljebb 200
   * ms-onként egyszer** köröz, a fázisváltás (nyitás, felfedés, továbblépés)
   * viszont azonnal, mert ott mindenkinek látnia kell a váltást.
   */
  const pendingBroadcast = useRef(false)
  const broadcastTimer = useRef<number | null>(null)
  const broadcastSoon = useCallback(() => {
    if (broadcastTimer.current !== null) {
      pendingBroadcast.current = true
      return
    }
    broadcast()
    broadcastTimer.current = window.setTimeout(() => {
      broadcastTimer.current = null
      if (pendingBroadcast.current) {
        pendingBroadcast.current = false
        broadcastSoon()
      }
    }, 200)
  }, [broadcast])
  useEffect(() => () => {
    if (broadcastTimer.current !== null) window.clearTimeout(broadcastTimer.current)
  }, [])

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
            | { kind: 'answer'; choice?: number; choices?: number[]; texts?: string[] }
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
            // A belépő azonnal megkapja a saját nézetét (különben a kártyák egy
            // pillanatra szürkén állnak), a többiek a 200 ms-os körözéskor.
            live.send({ kind: 'view', view: viewOf(result.player.id) }, from)
            bump()
            broadcastSoon()
            return
          }
          if (message?.kind === 'answer') {
            const playerId = seats.current.get(from)
            if (!playerId) return
            const result = message.texts
              ? engine.answerTexts(playerId, message.texts)
              : engine.answerMany(playerId, message.choices ?? [message.choice ?? -1])
            if (!result.ok) return
            // A válasz nem köröz mindenkinek: a válaszoló a saját kártyáján
            // már látja, a többiek a felfedéskor kapják meg a nézetet. Ez a
            // válasz-utáni teljes körözést (diákszám négyzetesen) szünteti meg.
            bump()
          }
        },
      },
    })
    connection.current = live
    return () => live.leave()
  }, [broadcastSoon, code, engine, t, viewOf])

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
  }, [broadcast, engine, bump])

  const Stage = stage === 'race' ? RaceStage : stage === 'boss' ? BossStage : ClassicStage

  if (started) {
    return createPortal(
      <Stage
        title={title}
        questions={questions}
        words={words}
        settings={settings}
        onExit={onExit}
        bankId={bankId}
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
