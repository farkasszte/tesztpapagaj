import { standings, type Standing } from './engine';
import type { EndReason, GameResult, Help, HelpResult, Phase, Role, ScoreDelta, Session } from './types';
import { richShown, type RichQuestion } from './rich-text';

/**
 * What a screen is allowed to see. The projector gets the public view; each
 * student gets the public view plus their own seat. Neither ever gets the
 * correct answer before the reveal, and nobody sees the question on the big
 * screen while the class is answering (so The One can't peek).
 */

export type RosterEntry = {
  id: string;
  nickname: string;
  role: Role;
  points: number;
  connected: boolean;
  hasBeenOne: boolean;
};

export type View = {
  mode: 'champion';
  seq: number;
  code: string;
  setTitle: string;
  /** Played with no student devices: the teacher taps every choice. */
  noDevices: boolean;
  phase: Phase;
  paused: boolean;
  pauseReason: 'teacher' | 'one_disconnected' | null;
  roster: RosterEntry[];
  standings: Standing[];
  pendingNextOne: { id: string; nickname: string } | null;
  game: null | {
    ordinal: number;
    one: { id: string; nickname: string; connected: boolean };
    mobCount: number;
    crowdCount: number;
    strikes: number;
    baseStrikes: number;
    bank: number;
    deckSize: number;
    questionIndex: number;
    helpsAvailable: Record<Help, boolean>;
    momentum: null | { progress: number; threshold: number; awardedOnce: boolean };
    /** The Class Streak toward a Rescue, and Rescues earned and waiting for someone to bring back; null when Rescues are off. */
    classStreak: null | { count: number; length: number; saved: number };
    result: GameResult | null;
  };
  /** A Rescue vote, while it's on. */
  rescue: null | {
    candidates: { id: string; nickname: string; votes: number }[];
    voted: number;
    voters: number;
    /** Ms left to vote, measured when this view was made; null once voting has closed. */
    remainingMs: number | null;
    /** Who came back, once the vote is settled; null if nobody could. */
    rescued: { id: string; nickname: string } | null;
    settled: boolean;
  };
  question: null | {
    attemptId: string;
    index: number;
    /** No student devices only: the Champion is looking away and the class hasn't seen the question yet. */
    peeking: boolean;
    /** Hidden on the projector and from The One while the class answers. */
    prompt: string | null;
    choices: string[] | null;
    /** The words' Rich Text, when they have any; only while they're shown, with the explanation once revealed. */
    rich: RichQuestion | null;
    answered: number;
    eligible: number;
    /** Who has answered (never what they chose), for the crowd on the big screen. */
    answeredIds: string[];
    /** Ms left to answer, measured when this view was made. */
    remainingMs: number | null;
    helpUsed: Help | null;
    helpResult: HelpResult | null;
    oneAnswer: number | null;
    reveal: null | {
      correct: number;
      oneCorrect: boolean;
      counts: number[];
      explanation: string | null;
      demoted: string[];
      deltas: ScoreDelta[];
      bankDelta: number;
      momentumCredited: boolean;
      momentumFilled: boolean;
      /** No student devices only: the answer most of the class chose; null when it was skipped. */
      classMajority: number | null;
      /** Whether most of The Class got it right, and whether that earned a Rescue; null when Rescues are off. */
      classRight: boolean | null;
      rescueEarned: boolean;
    };
  };
  /** Only in a student's view. */
  self?: {
    id: string;
    nickname: string;
    role: Role;
    points: number;
    streak: number;
    rank: number;
    /** May answer the open Phase A question. */
    eligible: boolean;
    myAnswer: number | null;
    isSpeaker: boolean;
    delta: number;
    demoted: boolean;
    payout: number;
    /** In a Rescue: who this student voted to bring back. */
    rescueVote: string | null;
  };
  history: { ordinal: number; oneNickname: string; reason: EndReason; bankedByOne: number }[];
};

export function buildView(
  session: Session,
  options: { now: number; pauseReason: View['pauseReason']; viewerId?: string },
): View {
  const s = session;
  const game = s.game;
  const active = game?.active ?? null;
  const name = (id: string) => s.players.find((p) => p.id === id)?.nickname ?? 'Someone';
  const one = game ? s.players.find((p) => p.id === game.oneId) : undefined;
  const viewer = options.viewerId ? s.players.find((p) => p.id === options.viewerId) : undefined;
  const table = standings(s.players);
  const questionPhases: Phase[] = ['PHASE_A', 'PHASE_A_LOCKED', 'PHASE_B', 'ONE_LOCKED', 'REVEAL'];
  const showQuestion = active && questionPhases.includes(s.phase);
  const classPhase = s.phase === 'PHASE_A' || s.phase === 'PHASE_A_LOCKED';
  const viewerAnswersNow = !!viewer && !!active && active.eligible.includes(viewer.id);
  // With no student devices the class reads the question off the screen while the
  // Champion looks away; it hides again while the Champion turns back.
  const peeking = !!s.noDevices && s.phase === 'PHASE_A' && !active?.classShown;
  const promptVisible = s.noDevices
    ? s.phase !== 'PHASE_A_LOCKED' && !peeking
    : !classPhase || (viewerAnswersNow && viewer?.role !== 'one');
  const revealed = s.phase === 'REVEAL' ? (game?.reveal ?? null) : null;

  const view: View = {
    mode: 'champion',
    seq: s.seq,
    code: s.code,
    setTitle: s.setTitle,
    noDevices: !!s.noDevices,
    phase: s.phase,
    paused: s.paused,
    pauseReason: s.paused ? options.pauseReason : null,
    roster: s.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      role: p.role,
      points: p.points,
      connected: p.connected,
      hasBeenOne: p.hasBeenOne,
    })),
    standings: table,
    pendingNextOne: s.pendingNextOneId ? { id: s.pendingNextOneId, nickname: name(s.pendingNextOneId) } : null,
    game: game
      ? {
          ordinal: game.ordinal,
          one: { id: game.oneId, nickname: one?.nickname ?? 'The One', connected: one?.connected ?? false },
          mobCount: s.players.filter((p) => p.role === 'mob').length,
          crowdCount: s.players.filter((p) => p.role === 'crowd').length,
          strikes: game.strikes,
          baseStrikes: s.settings.strikes,
          bank: game.bank,
          deckSize: game.deck.length,
          questionIndex: active?.index ?? game.offset,
          helpsAvailable: {
            poll: s.settings.helpsPerGame.poll > 0 && !game.helpsUsed.poll,
            ask: s.settings.helpsPerGame.ask > 0 && !game.helpsUsed.ask,
            trust: s.settings.helpsPerGame.trust > 0 && !game.helpsUsed.trust,
          },
          momentum: s.settings.momentumEnabled
            ? { progress: game.momentum.progress, threshold: s.settings.momentumThreshold, awardedOnce: game.momentum.awardedOnce }
            : null,
          classStreak:
            s.noDevices || s.settings.rescueStreak <= 0
              ? null
              : { count: game.classStreak ?? 0, length: s.settings.rescueStreak, saved: game.rescuesEarned ?? 0 },
          result: s.phase === 'REVEAL' || s.phase === 'LEADERBOARD' ? game.result : null,
        }
      : null,
    rescue:
      s.phase === 'RESCUE' && game?.rescue
        ? {
            candidates: game.rescue.candidates.map((id) => ({
              id,
              nickname: name(id),
              votes: Object.values(game.rescue!.votes).filter((v) => v === id).length,
            })),
            voted: Object.keys(game.rescue.votes).length,
            voters: s.players.filter((p) => p.role === 'mob' && p.connected).length,
            remainingMs: game.rescue.deadline === null ? null : Math.max(0, game.rescue.deadline - options.now),
            rescued: game.rescue.rescuedId ? { id: game.rescue.rescuedId, nickname: name(game.rescue.rescuedId) } : null,
            settled: game.rescue.deadline === null,
          }
        : null,
    question:
      showQuestion && active
        ? {
            attemptId: active.id,
            index: active.index,
            peeking,
            prompt: promptVisible ? active.question.prompt : null,
            choices: promptVisible ? active.question.choices : null,
            rich: richShown(active.question, promptVisible, !!revealed),
            answered: active.answers.length,
            eligible: active.eligible.length,
            answeredIds: active.answers.map((a) => a.playerId),
            remainingMs:
              s.phase !== 'PHASE_A'
                ? null
                : s.paused
                  ? active.pausedRemainingMs
                  : active.deadline === null
                    ? null
                    : Math.max(0, active.deadline - options.now),
            helpUsed: active.helpUsed,
            helpResult: active.helpResult,
            oneAnswer: s.phase === 'ONE_LOCKED' || s.phase === 'REVEAL' ? active.oneAnswer : null,
            reveal: revealed
              ? {
                  correct: revealed.correct,
                  oneCorrect: revealed.oneCorrect,
                  counts: revealed.counts,
                  explanation: active.question.explanation?.trim() || null,
                  demoted: revealed.demoted,
                  deltas: revealed.deltas,
                  bankDelta: revealed.bankDelta,
                  momentumCredited: revealed.momentumCredited,
                  momentumFilled: revealed.momentumFilled,
                  classMajority: revealed.classMajority ?? null,
                  classRight: revealed.classRight ?? null,
                  rescueEarned: !!revealed.rescueEarned,
                }
              : null,
          }
        : null,
    history: s.history.map((h) => ({ ordinal: h.ordinal, oneNickname: name(h.oneId), reason: h.reason, bankedByOne: h.bankedByOne })),
  };

  if (viewer) {
    const mine = active?.answers.find((a) => a.playerId === viewer.id)?.choice ?? null;
    const delta = revealed ? revealed.deltas.filter((d) => d.playerId === viewer.id).reduce((t, d) => t + d.points, 0) : 0;
    const payout = s.phase === 'REVEAL' || s.phase === 'LEADERBOARD' ? (game?.result?.payouts.find((p) => p.playerId === viewer.id)?.points ?? 0) : 0;
    view.self = {
      id: viewer.id,
      nickname: viewer.nickname,
      role: viewer.role,
      points: viewer.points,
      streak: viewer.streak,
      rank: table.find((row) => row.playerId === viewer.id)?.rank ?? 0,
      eligible: viewerAnswersNow,
      myAnswer: viewer.id === game?.oneId ? (active?.oneAnswer ?? null) : mine,
      isSpeaker:
        active?.helpResult?.type === 'ask' && active.helpResult.speakers.some((sp) => sp.playerId === viewer.id),
      delta,
      demoted: !!revealed?.demoted.includes(viewer.id),
      payout,
      rescueVote: (s.phase === 'RESCUE' && game?.rescue?.votes[viewer.id]) || null,
    };
  }
  return view;
}
