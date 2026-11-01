import type { EndReason, Role, ScoreDelta, Settings } from './types';

/**
 * The scoring rules, ported unchanged from the original open-source server
 * (src/engine/one-v-100-scoring.ts in deadbeef101010/1v100-edtechathon).
 */

export type ScoringPlayer = { id: string; role: Role; points: number; streak: number };

export type ScoringResult = {
  players: ScoringPlayer[];
  demoted: string[];
  deltas: ScoreDelta[];
  payouts: { playerId: string; points: number }[];
  bankDelta: number;
  bank: number;
  strikes: number;
  endReason: EndReason | null;
  bankedByOne: number;
};

export function scoreReveal(input: {
  players: ScoringPlayer[];
  eligible: string[];
  answers: Map<string, number>;
  correct: number;
  oneId: string;
  oneCorrect: boolean;
  strikes: number;
  bank: number;
  questionNumber: number;
  deckSize: number;
  settings: Settings;
}): ScoringResult {
  const s = input.settings;
  const next = new Map(input.players.map((p) => [p.id, { ...p }]));
  const deltas: ScoreDelta[] = [];
  const add = (playerId: string, points: number, reason: string) => {
    if (points === 0) return;
    const player = next.get(playerId);
    if (!player) return;
    player.points += points;
    deltas.push({ playerId, points, reason });
  };

  // Everyone who could answer earns points for a right answer, with a growing streak bonus.
  for (const id of input.eligible) {
    const player = next.get(id);
    if (!player || player.role === 'one') continue;
    const correct = input.answers.get(id) === input.correct;
    player.streak = correct ? player.streak + 1 : 0;
    if (correct) {
      const base = player.role === 'mob' ? s.mobCorrectPoints : s.crowdCorrectPoints;
      add(id, base + s.streakBonusPerStep * player.streak, 'correct_answer');
    }
  }

  // When The One is right, every Mob member who missed joins the Comeback Crew
  // and their share goes into The One's bank.
  const demoted: string[] = [];
  let bankDelta = 0;
  if (input.oneCorrect) {
    for (const id of input.eligible) {
      const player = next.get(id);
      if (player?.role !== 'mob' || input.answers.get(id) === input.correct) continue;
      player.role = 'crowd';
      demoted.push(id);
    }
    bankDelta = s.bankPerElimination * demoted.length;
  }
  const bank = input.bank + bankDelta;
  const strikes = input.oneCorrect ? input.strikes : Math.max(0, input.strikes - 1);
  const survivingMob = [...next.values()].filter((p) => p.role === 'mob');
  const endReason: EndReason | null =
    strikes === 0
      ? 'flameout'
      : survivingMob.length === 0
        ? 'mob_emptied'
        : input.questionNumber >= input.deckSize
          ? 'deck_survived'
          : null;

  if (endReason !== 'flameout') add(input.oneId, s.survivalDrip, 'survival_drip');

  const payouts: { playerId: string; points: number }[] = [];
  const payout = (playerId: string, points: number, reason: string) => {
    if (points === 0 || !next.has(playerId)) return;
    add(playerId, points, reason);
    payouts.push({ playerId, points });
  };
  let bankedByOne = 0;
  if (endReason === 'flameout') {
    bankedByOne = Math.floor(bank * s.bankKeepFractionOnFlameout);
    payout(input.oneId, bankedByOne, 'flameout_keep');
    const share = survivingMob.length === 0 ? 0 : Math.floor((bank - bankedByOne) / survivingMob.length);
    for (const p of survivingMob) payout(p.id, share, 'flameout_split');
  } else if (endReason === 'deck_survived') {
    bankedByOne = bank;
    payout(input.oneId, bankedByOne, 'bank');
    for (const p of survivingMob) payout(p.id, s.deckSurvivedMobBonus, 'deck_survived');
  } else if (endReason === 'mob_emptied') {
    bankedByOne = Math.floor(bank * s.jackpotMultiplier);
    payout(input.oneId, bankedByOne, 'jackpot');
  }

  return {
    players: [...next.values()],
    demoted,
    deltas,
    payouts,
    bankDelta,
    bank,
    strikes,
    endReason,
    bankedByOne,
  };
}

/**
 * Champion with no student devices, where the Champion plays against the Class
 * Majority instead of each classmate. A right answer grows the Prize Pot, by
 * more when the Class Majority was wrong; a wrong one costs a chance. Out of
 * chances, The Class wins the pot; clear every question and the Champion banks it.
 */
export function scoreNoDevicesReveal(input: {
  players: ScoringPlayer[];
  classId: string;
  /** Null when the teacher skipped the class's vote. */
  classMajority: number | null;
  correct: number;
  oneId: string;
  oneCorrect: boolean;
  strikes: number;
  bank: number;
  questionNumber: number;
  deckSize: number;
  settings: Settings;
}): ScoringResult {
  const s = input.settings;
  const next = new Map(input.players.map((p) => [p.id, { ...p }]));
  const deltas: ScoreDelta[] = [];
  const payouts: { playerId: string; points: number }[] = [];
  const payout = (playerId: string, points: number, reason: string) => {
    const player = next.get(playerId);
    if (points === 0 || !player) return;
    player.points += points;
    deltas.push({ playerId, points, reason });
    payouts.push({ playerId, points });
  };

  const classWrong = input.classMajority !== null && input.classMajority !== input.correct;
  const bankDelta = input.oneCorrect ? (classWrong ? s.noDevicesBeatClassPot : s.noDevicesPot) : 0;
  const bank = input.bank + bankDelta;
  const strikes = input.oneCorrect ? input.strikes : Math.max(0, input.strikes - 1);
  const endReason: EndReason | null =
    strikes === 0 ? 'flameout' : input.questionNumber >= input.deckSize ? 'deck_survived' : null;

  let bankedByOne = 0;
  if (endReason === 'flameout') {
    bankedByOne = Math.floor(bank * s.bankKeepFractionOnFlameout);
    payout(input.oneId, bankedByOne, 'flameout_keep');
    payout(input.classId, bank - bankedByOne, 'flameout_split');
  } else if (endReason === 'deck_survived') {
    bankedByOne = bank;
    payout(input.oneId, bankedByOne, 'bank');
  }

  return { players: [...next.values()], demoted: [], deltas, payouts, bankDelta, bank, strikes, endReason, bankedByOne };
}

/**
 * The teacher skipped the last question, so nobody's answer counts and the
 * Champion has survived the deck: they bank the pot, and with student devices
 * each surviving Mob member earns the deck bonus.
 */
export function scoreSkippedLast(input: {
  players: ScoringPlayer[];
  oneId: string;
  bank: number;
  noDevices: boolean;
  settings: Settings;
}): Pick<ScoringResult, 'players' | 'payouts' | 'bankedByOne'> {
  const next = new Map(input.players.map((p) => [p.id, { ...p }]));
  const payouts: { playerId: string; points: number }[] = [];
  const payout = (playerId: string, points: number) => {
    const player = next.get(playerId);
    if (points === 0 || !player) return;
    player.points += points;
    payouts.push({ playerId, points });
  };
  payout(input.oneId, input.bank);
  if (!input.noDevices) for (const p of input.players) if (p.role === 'mob') payout(p.id, input.settings.deckSurvivedMobBonus);
  return { players: [...next.values()], payouts, bankedByOne: input.bank };
}

/**
 * "On a Roll": The One is fast when they answer within 1.25× the average time
 * of the faster half of the Mob members who got it right (clamped to 8–20s;
 * 20s when nobody in the Mob was right).
 */
export function momentumWindowMs(
  answers: { choice: number; ms: number; role: Role }[],
  correct: number,
  s: Pick<Settings, 'momentumFastK' | 'momentumWindowMinMs' | 'momentumWindowMaxMs'>,
): number {
  const times = answers
    .filter((a) => a.role === 'mob' && a.choice === correct)
    .map((a) => a.ms)
    .sort((a, b) => a - b);
  const selected = times.slice(0, Math.ceil(times.length / 2));
  if (selected.length === 0) return 20_000;
  const mean = selected.reduce((t, ms) => t + ms, 0) / selected.length;
  return Math.min(s.momentumWindowMaxMs, Math.max(s.momentumWindowMinMs, s.momentumFastK * mean));
}
