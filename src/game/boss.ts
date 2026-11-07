import type { ClassicAnswer, ClassicSession } from './classic/types'
import { answerWasRight } from './classic/misses'

/**
 * Sárkányok völgye — kooperatív osztályküldetés.
 *
 * A tanár játssza a kvízt, a diákok a telefonjukon válaszolnak:
 * - A sárkány életereje (HP) a nehézségi kategóriához és a kérdésszámhoz igazodik:
 *   - Békés: a kérdések 40%-a szükséges a legyőzéséhez (zöld)
 *   - Harcias: a kérdések 60%-a szükséges a legyőzéséhez (kék)
 *   - Legendás: a kérdések 80%-a szükséges a legyőzéséhez (vörös)
 * - Találat: ha az osztály többsége eltalálja a kérdést, a sárkány 10 HP-t veszít.
 * - Pajzs: CSAK AKKOR veszik el, ha az egész osztályból SENKI nem nyom a jóra!
 *   Ha akár egyetlen diák is eltalálja, a pajzs megvédi az osztályt.
 * - Lezárás: a sárkány elestével azonnali győzelem; a pajzs eltörésével azonnali vereség.
 */

export type BossTier = 'peaceful' | 'fierce' | 'legendary'
export type BossKind = BossTier | 'dragon' | 'golem' | 'minotaur' | 'hydra'

export const BOSS_TIERS: BossTier[] = ['peaceful', 'fierce', 'legendary']

export const TIER_RATIOS: Record<BossTier, number> = {
  peaceful: 0.4,
  fierce: 0.6,
  legendary: 0.8,
}

export type BossState = {
  tier: BossTier
  kind: 'dragon'
  /** Hány életereje van a sárkánynak a nehézség és a kérdésszám szerint. */
  maxHp: number
  hp: number
  /** Az osztály pajzsa: 3 védelmi pont (30 pont). */
  maxShield: number
  shield: number
  /** Hány kérdésnél talált az osztály (többség jó választ adott). */
  hits: number
  /** Hány kérdésnél rágta a pajzsot a sárkány (senki nem adott jó választ). */
  bites: number
  /** A sárkány dühöng, ha életereje a harmadára vagy az alá esik. */
  enraged: boolean
  outcome: 'win' | 'lose' | 'draw' | 'survived' | null
}

export function normalizeTier(kindOrTier?: string): BossTier {
  if (kindOrTier === 'peaceful' || kindOrTier === 'fierce' || kindOrTier === 'legendary') {
    return kindOrTier
  }
  return 'legendary'
}

/**
 * Egy kérdéssorozat kimenetele és a harc állása.
 */
export function bossAfter(
  tierOrKind: BossKind = 'legendary',
  answers: { right: number; wrong: number }[],
  totalQuestions?: number,
): BossState {
  const tier = normalizeTier(tierOrKind)
  const ratio = TIER_RATIOS[tier] ?? 0.8
  const qCount = totalQuestions ?? Math.max(answers.length, 10)
  const neededHits = Math.max(1, Math.round(qCount * ratio))
  const maxHp = neededHits * 10
  const maxShield = 30 // 3 pipetta
  let hp = maxHp
  let shield = maxShield
  let hits = 0
  let bites = 0

  for (const question of answers) {
    // Ha a harc már eldőlt, a későbbi kérdések nem módosíthatják az eredményt
    if (hp <= 0 || shield <= 0) break

    const totalAnswered = question.right + question.wrong
    if (totalAnswered === 0) continue

    if (question.right === 0) {
      // Pajzs csak akkor veszik el, ha senki nem nyom a jóra.
      bites += 1
      shield = Math.max(0, shield - 10)
    } else if (question.right > question.wrong) {
      // Az osztály többsége eltalálta -> találat a sárkányra!
      hits += 1
      hp = Math.max(0, hp - 10)
    }
  }

  const outcome: BossState['outcome'] =
    hp === 0
      ? 'win'
      : shield === 0
        ? 'lose'
        : totalQuestions !== undefined && answers.length >= totalQuestions
          ? 'survived'
          : null

  return {
    tier,
    kind: 'dragon',
    maxHp,
    hp,
    maxShield,
    shield,
    hits,
    bites,
    enraged: hp > 0 && hp <= maxHp / 3,
    outcome,
  }
}

/** A napló állása a munkamenetből. */
export function bossOf(session: ClassicSession, kindOrTier?: BossKind): BossState {
  const tier = normalizeTier(kindOrTier ?? session.settings.bossTier)
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
  return bossAfter(tier, answers, session.questions.length)
}

/** A sárkány neve a felületre. */
export function bossNameKey(tierOrKind: BossKind): `game.boss.name.${BossTier}` {
  const tier = normalizeTier(tierOrKind)
  return `game.boss.name.${tier}`
}

/** Az utolsó kérdés kimenetele a színpad jelzéséhez. */
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
  if (right === 0 && wrong > 0) return 'bite'
  if (right > wrong) return 'hit'
  return null
}
