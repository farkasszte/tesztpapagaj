import { MAX_PLAYERS, nicknameProblem, normalizeNickname, randomId, type Clock, type Result } from '../engine';
import type { Question } from '../types';
import {
  DEFAULT_CLASSIC_SETTINGS,
  type ClassicPlayer,
  type ClassicReport,
  type ClassicSession,
  type ClassicSettings,
} from './types';

/**
 * The rules of Classic, run by the teacher's tab. Every command checks it is
 * allowed right now, changes the session in place, and returns ok or a
 * message a person can read.
 *
 *   LOBBY ─start→ QUESTION ─everyone in or time's up→ REVEAL ─next→ QUESTION … ─next after the last→ REPORT
 *
 * With no student devices nobody joins: the class answers on paper or by hand, and
 * only the teacher's lock shows the answer (the timer is a guide).
 */

const ok: Result = { ok: true };
const no = (message: string): Result => ({ ok: false, message });
const systemClock: Clock = { now: () => Date.now(), random: () => Math.random() };

export function createClassicSession(input: {
  code: string;
  title: string;
  questions: Question[];
  settings?: Partial<ClassicSettings>;
  noDevices?: boolean;
  clock?: Clock;
}): ClassicSession {
  const clock = input.clock ?? systemClock;
  const settings = { ...DEFAULT_CLASSIC_SETTINGS, ...input.settings };
  const questions = input.questions.map((q) => ({ ...q, choices: [...q.choices] }));
  if (settings.shuffleQuestions) {
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(clock.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  }
  return {
    mode: 'classic',
    version: 1,
    code: input.code,
    createdAt: clock.now(),
    ...(input.noDevices ? { noDevices: true } : {}),
    title: input.title,
    settings,
    questions,
    players: [],
    phase: 'LOBBY',
    index: 0,
    answers: [],
    openedAt: null,
    deadline: null,
    seq: 0,
  };
}

export class ClassicEngine {
  session: ClassicSession;
  readonly clock: Clock;
  readonly kicked = new Set<string>();

  constructor(session: ClassicSession, clock: Clock = systemClock) {
    this.session = session;
    this.clock = clock;
    for (const player of session.players) player.connected = false;
  }

  private changed(): Result {
    this.session.seq++;
    return ok;
  }

  player(id: string): ClassicPlayer | undefined {
    return this.session.players.find((p) => p.id === id);
  }

  get question(): Question | undefined {
    return this.session.questions[this.session.index];
  }

  // ── Joining ────────────────────────────────────────────────────────────

  join(input: {
    playerId?: string;
    secret?: string;
    nickname: string;
  }): { ok: true; player: ClassicPlayer; rejoined: boolean } | { ok: false; message: string } {
    const s = this.session;
    if (input.playerId && this.kicked.has(input.playerId)) return { ok: false, message: 'Your teacher removed you from this game.' };
    const existing = input.playerId ? this.player(input.playerId) : undefined;
    if (existing) {
      if (existing.secret !== input.secret) return { ok: false, message: 'That seat belongs to another device.' };
      existing.connected = true;
      this.changed();
      return { ok: true, player: existing, rejoined: true };
    }
    if (s.phase === 'ENDED') return { ok: false, message: 'This game has ended.' };
    if (s.players.length >= MAX_PLAYERS) return { ok: false, message: `This game is full (${MAX_PLAYERS} players).` };
    const nickname = normalizeNickname(input.nickname);
    const problem = nicknameProblem(
      nickname,
      s.players.map((p) => p.nickname),
    );
    if (problem) return { ok: false, message: problem };
    const player: ClassicPlayer = {
      id: randomId(this.clock.random),
      secret: randomId(this.clock.random),
      nickname,
      points: 0,
      joinedAt: this.clock.now(),
      connected: true,
    };
    s.players.push(player);
    this.changed();
    return { ok: true, player, rejoined: false };
  }

  setConnected(playerId: string, connected: boolean): void {
    const player = this.player(playerId);
    if (!player || player.connected === connected) return;
    player.connected = connected;
    this.changed();
  }

  kick(playerId: string): Result {
    const s = this.session;
    if (!this.player(playerId)) return no('That student has already left.');
    s.players = s.players.filter((p) => p.id !== playerId);
    this.kicked.add(playerId);
    if (s.phase === 'QUESTION') this.closeIfAllIn();
    return this.changed();
  }

  updateSettings(settings: Partial<Omit<ClassicSettings, 'shuffleQuestions'>>): Result {
    if (this.session.phase !== 'LOBBY') return no('Change the rules before the game starts.');
    this.session.settings = { ...this.session.settings, ...settings };
    return this.changed();
  }

  // ── Questions ──────────────────────────────────────────────────────────

  start(): Result {
    const s = this.session;
    if (s.phase !== 'LOBBY') return no('The game has already started.');
    if (!s.questions.length) return no('There are no questions.');
    if (!s.players.length && !s.noDevices) return no('Wait for a student to join.');
    return this.open(0);
  }

  private open(index: number): Result {
    const s = this.session;
    s.index = index;
    s.answers[index] = [];
    s.openedAt = this.clock.now();
    s.deadline = s.openedAt + s.settings.timerSeconds * 1000;
    s.phase = 'QUESTION';
    return this.changed();
  }

  answer(playerId: string, choice: number): Result {
    const s = this.session;
    const question = this.question;
    if (s.phase !== 'QUESTION' || !question) return no('Wait for the next question.');
    if (!this.player(playerId)) return no('Join the game first.');
    const answers = s.answers[s.index];
    if (answers.some((a) => a.playerId === playerId)) return no('You’ve already answered.');
    if (!Number.isInteger(choice) || choice < 0 || choice >= question.choices.length) return no('Pick one of the answers.');
    const ms = this.clock.now() - (s.openedAt ?? this.clock.now());
    answers.push({ playerId, choice, ms });
    // With scoring on, a right answer earns 1000 at once, falling to 500 as time runs out.
    if (s.settings.scoring && choice === question.correct) {
      const limit = s.settings.timerSeconds * 1000;
      this.player(playerId)!.points += Math.round(1000 - 500 * Math.min(1, ms / limit));
    }
    this.closeIfAllIn();
    return this.changed();
  }

  /** The answers lock once everyone still connected has answered. */
  private closeIfAllIn() {
    const s = this.session;
    const answered = new Set(s.answers[s.index].map((a) => a.playerId));
    if (s.players.filter((p) => p.connected).every((p) => answered.has(p.id))) this.reveal();
  }

  /** Locks the answers early, from the teacher's screen. */
  lock(): Result {
    if (this.session.phase !== 'QUESTION') return no('No question is open.');
    this.reveal();
    return this.changed();
  }

  private reveal() {
    const s = this.session;
    s.phase = 'REVEAL';
    s.deadline = null;
  }

  tick(): boolean {
    const s = this.session;
    if (s.noDevices || s.phase !== 'QUESTION' || s.deadline === null || this.clock.now() < s.deadline) return false;
    this.reveal();
    this.changed();
    return true;
  }

  next(): Result {
    const s = this.session;
    if (s.phase !== 'REVEAL') return no('Show the answer first.');
    if (s.index + 1 < s.questions.length) return this.open(s.index + 1);
    s.phase = 'REPORT';
    return this.changed();
  }

  endSession(): Result {
    this.session.phase = 'ENDED';
    this.session.deadline = null;
    return this.changed();
  }

  /** How the class did on each question asked, and how each student did. */
  report(): ClassicReport {
    return reportOf(this.session);
  }
}

/** How the class did on each question asked, and how each student did. */
export function reportOf(s: ClassicSession): ClassicReport {
  const asked = s.answers.map((answers, i) => ({ answers, question: s.questions[i] }));
  return {
    questions: asked.map(({ answers, question }) => ({
      prompt: question.prompt,
      correct: answers.filter((a) => a.choice === question.correct).length,
      answered: answers.length,
      counts: question.choices.map((_, c) => answers.filter((a) => a.choice === c).length),
    })),
    students: s.players
      .map((p) => {
        const mine = asked.flatMap(({ answers, question }) =>
          answers.filter((a) => a.playerId === p.id).map((a) => a.choice === question.correct),
        );
        return { nickname: p.nickname, correct: mine.filter(Boolean).length, answered: mine.length, points: p.points };
      })
      .sort((a, b) => b.points - a.points || b.correct - a.correct || a.nickname.localeCompare(b.nickname)),
  };
}
