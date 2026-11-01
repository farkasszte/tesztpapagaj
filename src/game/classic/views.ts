import { reportOf } from './engine';
import type { ClassicPhase, ClassicReport, ClassicSession } from './types';
import { richShown, type RichQuestion } from '../rich-text';

/**
 * What a Classic screen may see. While the class answers, nobody gets the
 * right answer or anyone else's choice, only how many have answered. The
 * reveal shows how many chose each answer, never who. The Report goes to the
 * teacher's screen alone; each student sees only their own results.
 */

export type ClassicView = {
  mode: 'classic';
  seq: number;
  code: string;
  title: string;
  phase: ClassicPhase;
  /** Played with no student devices, so there are no answers to count. */
  noDevices: boolean;
  scoring: boolean;
  roster: { id: string; nickname: string; connected: boolean }[];
  question: null | {
    /** Counted from 1. */
    number: number;
    total: number;
    prompt: string;
    choices: string[];
    /** The words' Rich Text, when they have any; only while they're shown, with the explanation once revealed. */
    rich: RichQuestion | null;
    answered: number;
    /** Students who can answer it. */
    answering: number;
    remainingMs: number | null;
    correct: number | null;
    counts: number[] | null;
    explanation: string | null;
  };
  report: ClassicReport | null;
  /** Only in a student's view. */
  me?: {
    id: string;
    nickname: string;
    canAnswer: boolean;
    answer: number | null;
    /** Null until the answer shows. */
    right: boolean | null;
    correctSoFar: number;
    asked: number;
    points: number;
  };
};

export function buildClassicView(session: ClassicSession, options: { now: number; viewerId?: string }): ClassicView {
  const s = session;
  const question = s.questions[s.index];
  const answers = s.answers[s.index] ?? [];
  const shown = s.phase === 'QUESTION' || s.phase === 'REVEAL';
  const revealed = s.phase === 'REVEAL';
  const view: ClassicView = {
    mode: 'classic',
    seq: s.seq,
    code: s.code,
    title: s.title,
    phase: s.phase,
    noDevices: !!s.noDevices,
    scoring: s.settings.scoring,
    roster: s.players.map((p) => ({ id: p.id, nickname: p.nickname, connected: p.connected })),
    question:
      shown && question
        ? {
            number: s.index + 1,
            total: s.questions.length,
            prompt: question.prompt,
            choices: question.choices,
            rich: richShown(question, true, !!revealed),
            answered: answers.length,
            answering: s.players.filter((p) => p.connected || answers.some((a) => a.playerId === p.id)).length,
            remainingMs: s.phase === 'QUESTION' && s.deadline !== null ? Math.max(0, s.deadline - options.now) : null,
            correct: revealed ? question.correct : null,
            counts: revealed ? question.choices.map((_, c) => answers.filter((a) => a.choice === c).length) : null,
            explanation: revealed ? question.explanation?.trim() || null : null,
          }
        : null,
    report: null,
  };
  const viewer = options.viewerId ? s.players.find((p) => p.id === options.viewerId) : undefined;
  if (!viewer) {
    view.report = s.phase === 'REPORT' || s.phase === 'ENDED' ? reportOf(s) : null;
    return view;
  }
  const mine = answers.find((a) => a.playerId === viewer.id);
  const results = s.answers
    .map((list, i) => ({ answer: list.find((a) => a.playerId === viewer.id), question: s.questions[i], i }))
    // The open question doesn't count until its answer shows.
    .filter(({ i }) => !(s.phase === 'QUESTION' && i === s.index));
  view.me = {
    id: viewer.id,
    nickname: viewer.nickname,
    canAnswer: s.phase === 'QUESTION' && !mine,
    answer: shown ? (mine?.choice ?? null) : null,
    right: revealed && mine ? mine.choice === question.correct : null,
    correctSoFar: results.filter(({ answer, question: q }) => answer?.choice === q.correct).length,
    asked: results.length,
    points: viewer.points,
  };
  return view;
}
