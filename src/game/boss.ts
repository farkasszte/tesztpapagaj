import type { ClassicAnswer, ClassicSession } from './classic/types'
import { answerWasRight } from './classic/misses'

/**
 * Szörnytámadás — kooperatív osztályküldetés.
 *
 * A Klasszikus kör ugyanaz (kérdés, válaszok, felfedés), de a jelentése közös:
 * a helyes válaszok a **szörnyet** sebzik, a rosszak az osztály **pajzsát**
 * rágják. A végén vagy a szörny esik el, vagy a pajzs fogy el — a csapat
 * együtt nyer és együtt veszít, nincs egyéni ranglista.
 *
 * A Zsírkréta `GameModes/BossBattle/bossBattleUtils.ts` szelleme, a mi
 * naplónkra mérve: kérdésenként egy ütés, a többség dönt.
 */

export type BossKind = 'dragon' | 'golem' | 'minotaur' | 'hydra'

export type BossState = {
  kind: BossKind
  /** Hány életereje van a szörnynek (kérdésenként tíz). */
  maxHp: number
  hp: number
  /** Az osztály pajzsa: ennyi rossz többséget bír. */
  maxShield: number
  shield: number
  /** Hány kérdés talált (a többség jó választ adott). */
  hits: number
  /** Hány kérdésnél rágta a pajzsot a szörny. */
  bites: number
  /** A szörny dühöng, ha kevesebb mint a harmada maradt. */
  enraged: boolean
  outcome: 'win' | 'lose' | 'draw' | null
}

/** A szörnyek: más-más életerő és pajzs, hogy a nehézség választható legyen. */
const KINDS: Record<BossKind, { hp: number; shield: number }> = {
  dragon: { hp: 100, shield: 30 },
  golem: { hp: 140, shield: 20 },
  minotaur: { hp: 90, shield: 40 },
  hydra: { hp: 120, shield: 30 },
}

export const BOSS_KINDS: BossKind[] = ['dragon', 'golem', 'minotaur', 'hydra']

/**
 * Egy kérdés kimenetele: a többség helyes válasza ütés a szörnyre, a többség
 * rossz válasza a pajzsot rágja. Holtversenynél (vagy ha senki sem válaszolt)
 * nem történik semmi — a csapat nem büntethető azért, mert megosztott.
 */
export function bossAfter(
  kind: BossKind,
  answers: { right: number; wrong: number }[],
): BossState {
  const base = KINDS[kind]
  let hp = base.hp
  let shield = base.shield
  let hits = 0
  let bites = 0
  for (const question of answers) {
    if (question.right > question.wrong) {
      hits += 1
      hp = Math.max(0, hp - 10)
    } else if (question.wrong > question.right) {
      bites += 1
      shield = Math.max(0, shield - 10)
    }
  }
  const outcome: BossState['outcome'] =
    hp > 0 && shield > 0 ? null : hp === 0 && shield === 0 ? 'draw' : hp === 0 ? 'win' : 'lose'
  return {
    kind,
    maxHp: base.hp,
    hp,
    maxShield: base.shield,
    shield,
    hits,
    bites,
    enraged: hp > 0 && hp <= base.hp / 3,
    outcome,
  }
}

/** A napló állása: kérdésenként megszámoljuk, hányan találták el. */
export function bossOf(session: ClassicSession, kind: BossKind = 'dragon'): BossState {
  const answers = session.questions.map((question, index) => {
    const list = session.answers[index] ?? []
    let right = 0
    let wrong = 0
    for (const answer of list) {
      if (answerWasRight(question, answer)) right += 1
      else wrong += 1
    }
    return { right, wrong }
  })
  return bossAfter(kind, answers)
}

/** A szörny neve a felületre (a szótárból `game.boss.kind.<kind>`). */
export function bossNameKey(kind: BossKind): `game.boss.kind.${BossKind}` {
  return `game.boss.kind.${kind}`
}

/** A napló válaszlistájából az utolsó kérdés kimenetele, a színpad jelzéséhez. */
export function lastBite(session: ClassicSession): 'hit' | 'bite' | null {
  const question = session.questions[session.index]
  if (!question) return null
  const list: ClassicAnswer[] = session.answers[session.index] ?? []
  let right = 0
  let wrong = 0
  for (const answer of list) {
    if (answerWasRight(question, answer)) right += 1
    else wrong += 1
  }
  if (right > wrong) return 'hit'
  if (wrong > right) return 'bite'
  return null
}
