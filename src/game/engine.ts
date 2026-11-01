import { momentumWindowMs, scoreNoDevicesReveal, scoreReveal, scoreSkippedLast } from './scoring';
import {
  DEFAULT_SETTINGS,
  type Attempt,
  type Help,
  type Player,
  type Question,
  type Session,
  type Settings,
} from './types';

/**
 * The rules of Class Gauntlet, run by the teacher's tab. Every command checks that it
 * is allowed right now, changes the session in place, and returns ok or a
 * message a person can read. The host saves and broadcasts after each change.
 *
 * A game, in order:
 *   LOBBY ─start→ BETWEEN ─open→ PHASE_A (class answers) ─timer/all in→ PHASE_A_LOCKED
 *   ─show to One→ PHASE_B (One answers, may use a lifeline) ─final answer→ ONE_LOCKED
 *   ─reveal→ REVEAL ─next→ PHASE_A … or, when the game is over, LEADERBOARD ─start→ BETWEEN …
 *
 * With no student devices nobody joins. The teacher names each Champion as their
 * round starts. In PHASE_A the Champion looks away, the teacher shows the
 * class the question (showToClass), the class votes by hand, and the teacher
 * taps the Class Majority. The Champion answers by tapping the screen. The
 * Class is one entry in the standings.
 */

export type Result = { ok: true } | { ok: false; message: string };
const ok: Result = { ok: true };
const no = (message: string): Result => ({ ok: false, message });

export const MAX_PLAYERS = 40;
/** The Class's entry in a Champion game with no student devices: it wins the pots the Champions lose. */
export const CLASS_ID = 'the-class';
export const NICKNAME_MAX = 24;
const DENYLIST = ['damn', 'idiot', 'stupid', 'hell', 'crap', 'sucks', 'loser', 'dumb'];

export type Clock = { now: () => number; random: () => number };
const systemClock: Clock = { now: () => Date.now(), random: () => Math.random() };

export function randomId(random = Math.random): string {
  let id = '';
  for (let i = 0; i < 16; i++) id += Math.floor(random() * 36).toString(36);
  return id;
}

export function normalizeNickname(nickname: string): string {
  return nickname.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function nicknameProblem(display: string, taken: Iterable<string>): string | null {
  if (display.length === 0) return 'Type a nickname.';
  if (display.length > NICKNAME_MAX) return `Keep your nickname to ${NICKNAME_MAX} letters.`;
  const words = display.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  if (DENYLIST.some((word) => words.includes(word))) return 'Please choose a different nickname.';
  const lower = display.toLowerCase();
  const takenSet = new Set([...taken].map((name) => name.toLowerCase()));
  if (takenSet.has(lower)) {
    for (let n = 2; n < 100; n++) {
      const suggestion = `${display.slice(0, NICKNAME_MAX - 3)} ${n}`;
      if (!takenSet.has(suggestion.toLowerCase()))
        return `Someone is already "${display}". Try "${suggestion}".`;
    }
    return 'That nickname is taken.';
  }
  return null;
}

function shuffled(length: number, random: () => number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function createSession(input: {
  code: string;
  setTitle: string;
  questions: Question[];
  settings?: Partial<Settings>;
  noDevices?: boolean;
  clock?: Clock;
}): Session {
  const clock = input.clock ?? systemClock;
  const settings = { ...DEFAULT_SETTINGS, ...input.settings };
  return {
    version: 1,
    code: input.code,
    createdAt: clock.now(),
    setTitle: input.setTitle,
    ...(input.noDevices ? { noDevices: true } : {}),
    questions: input.questions.map((q) => ({ ...q, choices: [...q.choices] })),
    order: settings.shuffleQuestions
      ? shuffled(input.questions.length, clock.random)
      : input.questions.map((_, i) => i),
    deckPos: 0,
    settings,
    players: [],
    phase: 'LOBBY',
    paused: false,
    game: null,
    pendingNextOneId: null,
    history: [],
    seq: 0,
  };
}

export type PauseReason = 'teacher' | 'one_disconnected';

/** The rules a teacher sets while hosting Champion, and this browser remembers. */
export type ChampionRule =
  | 'timerSeconds'
  | 'strikes'
  | 'questionsPerGame'
  | 'momentumEnabled'
  | 'shuffleQuestions'
  | 'rescueStreak'
  | 'championPick'
  | 'championsOnce';

export class Engine {
  session: Session;
  readonly clock: Clock;
  pauseReason: PauseReason | null = null;
  /** Players removed by the teacher; their device may not rejoin as the same player. */
  readonly kicked = new Set<string>();

  constructor(session: Session, clock: Clock = systemClock) {
    this.session = session;
    this.clock = clock;
    // A reload forgets who is online; everyone reconnects.
    for (const player of session.players) player.connected = false;
    if (session.paused) this.pauseReason = 'teacher';
  }

  private changed(): Result {
    this.session.seq++;
    return ok;
  }

  player(id: string): Player | undefined {
    return this.session.players.find((p) => p.id === id);
  }

  get one(): Player | undefined {
    const game = this.session.game;
    return game ? this.player(game.oneId) : undefined;
  }

  /** True between the first question of a game and its final reveal. */
  get gameLive(): boolean {
    return !['LOBBY', 'LEADERBOARD', 'ENDED'].includes(this.session.phase);
  }

  // ── Joining ────────────────────────────────────────────────────────────

  /**
   * A device introduces itself. A device that has been here before brings its
   * player id and secret and gets its seat (and points) back.
   */
  join(input: {
    playerId?: string;
    secret?: string;
    nickname: string;
  }): { ok: true; player: Player; rejoined: boolean } | { ok: false; message: string } {
    const s = this.session;
    if (input.playerId && this.kicked.has(input.playerId))
      return { ok: false, message: 'Your teacher removed you from this game.' };
    const existing = input.playerId ? this.player(input.playerId) : undefined;
    if (existing) {
      if (existing.secret !== input.secret) return { ok: false, message: 'That seat belongs to another device.' };
      existing.connected = true;
      this.onReconnect(existing);
      this.changed();
      return { ok: true, player: existing, rejoined: true };
    }
    if (s.phase === 'ENDED') return { ok: false, message: 'This game has ended.' };
    if (s.players.length >= MAX_PLAYERS)
      return { ok: false, message: `This game is full (${MAX_PLAYERS} players).` };
    const nickname = normalizeNickname(input.nickname);
    const problem = nicknameProblem(
      nickname,
      s.players.map((p) => p.nickname),
    );
    if (problem) return { ok: false, message: problem };
    // Late joiners play with the Comeback Crew until the next game starts.
    const player = this.newPlayer(nickname, s.phase === 'LOBBY' ? 'mob' : 'crowd');
    s.players.push(player);
    this.changed();
    return { ok: true, player, rejoined: false };
  }

  setConnected(playerId: string, connected: boolean): void {
    const player = this.player(playerId);
    if (!player || player.connected === connected) return;
    player.connected = connected;
    if (connected) this.onReconnect(player);
    else if (playerId === this.session.game?.oneId && this.session.phase === 'PHASE_B' && !this.session.paused) {
      // The One's device dropped mid-answer: hold the room until they are back.
      this.pause('one_disconnected');
    }
    this.changed();
  }

  private onReconnect(player: Player) {
    if (player.id === this.session.game?.oneId && this.pauseReason === 'one_disconnected') this.resume();
  }

  kick(playerId: string): Result {
    const s = this.session;
    if (playerId === s.game?.oneId && this.gameLive)
      return no('The One can’t be removed during their game. End the game first.');
    const index = s.players.findIndex((p) => p.id === playerId);
    if (index < 0) return no('That player already left.');
    s.players.splice(index, 1);
    this.kicked.add(playerId);
    if (s.pendingNextOneId === playerId) s.pendingNextOneId = null;
    const active = s.game?.active;
    if (active && s.phase === 'PHASE_A') {
      active.eligible = active.eligible.filter((id) => id !== playerId);
      active.answers = active.answers.filter((a) => a.playerId !== playerId);
      if (active.answers.length >= active.eligible.length) this.lock();
    }
    return this.changed();
  }

  // ── Settings ───────────────────────────────────────────────────────────

  updateSettings(
    patch: Partial<Pick<Settings, ChampionRule>>,
  ): Result {
    const next = { ...this.session.settings, ...patch };
    if (!Number.isInteger(next.timerSeconds) || next.timerSeconds < 5 || next.timerSeconds > 120)
      return no('Timer must be 5 to 120 seconds.');
    if (!Number.isInteger(next.strikes) || next.strikes < 1 || next.strikes > 5)
      return no('Strikes must be 1 to 5.');
    if (!Number.isInteger(next.questionsPerGame) || next.questionsPerGame < 1 || next.questionsPerGame > 50)
      return no('Questions per game must be 1 to 50.');
    if (!Number.isInteger(next.rescueStreak) || next.rescueStreak < 0 || next.rescueStreak > 10)
      return no('A Rescue takes 2 to 10 right in a row, or 0 for none.');
    if (next.rescueStreak === 1) return no('A Rescue takes at least 2 right in a row.');
    if (next.championPick !== 'spotlight' && next.championPick !== 'teacher') return no('Choose who picks the champion.');
    const s = this.session;
    if (next.shuffleQuestions !== s.settings.shuffleQuestions && s.deckPos === 0) {
      // Nothing has been played yet, so the whole deck can be reordered.
      s.order = next.shuffleQuestions ? shuffled(s.questions.length, this.clock.random) : s.questions.map((_, i) => i);
    }
    s.settings = next;
    return this.changed();
  }

  // ── Games ──────────────────────────────────────────────────────────────

  /** Who goes next if the teacher doesn't choose: the top scorer who hasn't had a turn. */
  suggestedOne(): Player | undefined {
    const s = this.session;
    const pool = s.players.filter((p) => !p.hasBeenOne);
    const candidates = pool.length > 0 ? pool : s.players;
    return [...candidates].sort(
      (a, b) =>
        Number(b.connected) - Number(a.connected) ||
        b.points - a.points ||
        a.joinedAt - b.joinedAt ||
        a.id.localeCompare(b.id),
    )[0];
  }

  /** The spotlight's pick: anyone here at random, passing over past Champions (until everyone has been one) when the rules say so. */
  randomOne(): Player | undefined {
    const s = this.session;
    const here = s.players.filter((p) => p.connected);
    const fresh = s.settings.championsOnce ? here.filter((p) => !p.hasBeenOne) : here;
    const list = fresh.length > 0 ? fresh : here.length > 0 ? here : s.players;
    return list[Math.floor(this.clock.random() * list.length)];
  }

  /** Who is lined up for the next round once one ends: nobody when the spotlight picks; a suggestion when the teacher does. */
  private nextOneByDefault(): string | null {
    const s = this.session;
    if (s.noDevices || s.settings.championPick === 'spotlight') return null;
    return this.suggestedOne()?.id ?? null;
  }

  chooseNextOne(playerId: string | null): Result {
    if (playerId !== null && !this.player(playerId)) return no('That player is not in this game.');
    this.session.pendingNextOneId = playerId;
    return this.changed();
  }

  startGame(oneId?: string): Result {
    const s = this.session;
    if (s.phase !== 'LOBBY' && s.phase !== 'LEADERBOARD') return no('Finish this game first.');
    if (s.questions.length === 0) return no('This question set is empty.');
    const one = oneId
      ? this.player(oneId)
      : s.pendingNextOneId
        ? this.player(s.pendingNextOneId)
        : s.settings.championPick === 'spotlight'
          ? this.randomOne()
          : undefined;
    if (!one) return no('Pick a student to be the champion.');
    if (s.players.length < 2) return no('You need at least two students to play.');
    return this.beginGame(one);
  }

  /** With no student devices: starts a round with the Champion the teacher named; a name that has played before keeps its points. */
  startNamedRound(name: string): Result {
    const s = this.session;
    if (!s.noDevices) return no('Students are playing on their devices.');
    if (s.phase !== 'LOBBY' && s.phase !== 'LEADERBOARD') return no('Finish this game first.');
    if (s.questions.length === 0) return no('This question set is empty.');
    const nickname = normalizeNickname(name).slice(0, NICKNAME_MAX);
    if (!nickname) return no('Type the champion’s name.');
    if (nickname.toLowerCase() === 'the class') return no('Give the champion a name of their own.');
    if (!this.player(CLASS_ID))
      s.players.push({ ...this.newPlayer('The Class', 'mob'), id: CLASS_ID, secret: '', connected: false });
    let one = s.players.find((p) => p.id !== CLASS_ID && p.nickname.toLowerCase() === nickname.toLowerCase());
    if (!one) {
      one = { ...this.newPlayer(nickname, 'one'), connected: false };
      s.players.push(one);
    }
    return this.beginGame(one);
  }

  private newPlayer(nickname: string, role: Player['role']): Player {
    return {
      id: randomId(this.clock.random),
      secret: randomId(this.clock.random),
      nickname,
      role,
      points: 0,
      streak: 0,
      hasBeenOne: false,
      joinedAt: this.clock.now(),
      connected: true,
    };
  }

  private beginGame(one: Player): Result {
    const s = this.session;
    const size = Math.min(s.settings.questionsPerGame, s.questions.length);
    const deck: number[] = [];
    for (let i = 0; i < size; i++) {
      if (s.deckPos >= s.order.length) {
        // Out of questions: go round the deck again, reshuffled if asked.
        s.order = s.settings.shuffleQuestions ? shuffled(s.questions.length, this.clock.random) : s.order;
        s.deckPos = 0;
      }
      deck.push(s.order[s.deckPos++]);
    }
    for (const p of s.players) {
      p.role = p.id === one.id ? 'one' : 'mob';
      p.streak = 0;
    }
    one.hasBeenOne = true;
    s.game = {
      ordinal: (s.game?.ordinal ?? 0) + 1,
      oneId: one.id,
      deck,
      offset: 0,
      strikes: s.settings.strikes,
      bank: 0,
      helpsUsed: { poll: false, ask: false, trust: false },
      momentum: { progress: 0, awardedOnce: false },
      classStreak: 0,
      rescuesEarned: 0,
      rescue: null,
      active: null,
      reveal: null,
      result: null,
    };
    s.pendingNextOneId = null;
    s.phase = 'BETWEEN';
    s.paused = false;
    this.pauseReason = null;
    return this.changed();
  }

  /** Opens the next question to everyone except The One. */
  openQuestion(): Result {
    const s = this.session;
    const game = s.game;
    if (!game || (s.phase !== 'BETWEEN' && s.phase !== 'REVEAL' && s.phase !== 'RESCUE')) return no('There is no question to open right now.');
    if (game.result) return no('This game is over.');
    const position = game.deck[game.offset];
    const question = position === undefined ? undefined : s.questions[position];
    if (!question) return no('No question is ready.');
    const now = this.clock.now();
    const eligible = s.players.filter((p) => p.role !== 'one' && p.connected).map((p) => p.id);
    game.active = {
      id: randomId(this.clock.random),
      index: game.offset + 1,
      question,
      startedAt: now,
      // With no student devices the clock starts once the class sees the question.
      deadline: s.noDevices ? null : now + s.settings.timerSeconds * 1000,
      ...(s.noDevices ? { classShown: false } : {}),
      pausedRemainingMs: null,
      pausedAt: null,
      eligible,
      answers: [],
      phaseBStartedAt: null,
      oneAnswer: null,
      oneMs: null,
      helpUsed: null,
      helpResult: null,
    };
    game.reveal = null;
    s.phase = 'PHASE_A';
    if (eligible.length === 0 && !s.noDevices) s.phase = 'PHASE_A_LOCKED';
    return this.changed();
  }

  answer(playerId: string, attemptId: string, choice: number): Result {
    const s = this.session;
    const active = s.game?.active;
    if (!active || s.phase !== 'PHASE_A' || s.paused) return no('Answers are closed.');
    if (active.id !== attemptId) return no('That question has already closed.');
    if (!active.eligible.includes(playerId)) return no('You’ll jump in on the next question.');
    if (!Number.isInteger(choice) || choice < 0 || choice >= active.question.choices.length)
      return no('Choose one of the answers shown.');
    if (active.deadline !== null && this.clock.now() >= active.deadline) return no('Time is up.');
    if (active.answers.some((a) => a.playerId === playerId)) return no('Your answer is already locked.');
    active.answers.push({ playerId, choice, ms: this.clock.now() - active.startedAt });
    if (active.answers.length >= active.eligible.length) this.lock();
    return this.changed();
  }

  /** With no student devices: the Champion has looked away, so the class may see the question. */
  showToClass(): Result {
    const s = this.session;
    const active = s.game?.active;
    if (!s.noDevices || !active || s.phase !== 'PHASE_A' || active.classShown) return no('The class can already see the question.');
    const now = this.clock.now();
    active.classShown = true;
    active.startedAt = now;
    active.deadline = s.paused ? null : now + s.settings.timerSeconds * 1000;
    active.pausedRemainingMs = s.paused ? s.settings.timerSeconds * 1000 : null;
    return this.changed();
  }

  /** With no student devices: the answer most of the class chose, as the teacher taps it. */
  classAnswer(choice: number): Result {
    const s = this.session;
    const active = s.game?.active;
    if (!s.noDevices) return no('The class answers on their devices.');
    if (!active || s.phase !== 'PHASE_A' || !active.classShown) return no('The class isn’t answering right now.');
    if (!Number.isInteger(choice) || choice < 0 || choice >= active.question.choices.length) return no('Pick an answer.');
    active.classMajority = choice;
    return this.lock();
  }

  /** Locks the class's answers early (or when the timer runs out). With no student devices, skips the class's vote. */
  lock(): Result {
    const s = this.session;
    const active = s.game?.active;
    if (!active || s.phase !== 'PHASE_A') return no('Answers are not open.');
    if (s.noDevices) active.classMajority ??= null;
    active.deadline = null;
    active.pausedRemainingMs = null;
    active.pausedAt = null;
    s.paused = false;
    this.pauseReason = null;
    s.phase = 'PHASE_A_LOCKED';
    return this.changed();
  }

  /**
   * Discards the open question unscored: nobody's answer counts, The One never
   * sees it, and the round goes on one question shorter. Skipping the last
   * question ends the round with The One banking the pot.
   */
  skip(): Result {
    const s = this.session;
    const game = s.game;
    const active = game?.active;
    if (!game || !active || s.phase !== 'PHASE_A') return no('There is no question to skip right now.');
    game.offset = active.index;
    game.active = null;
    game.reveal = null;
    s.paused = false;
    this.pauseReason = null;
    if (game.offset < game.deck.length) {
      s.phase = 'BETWEEN';
      return this.openQuestion();
    }
    const scored = scoreSkippedLast({ players: s.players, oneId: game.oneId, bank: game.bank, noDevices: !!s.noDevices, settings: s.settings });
    const byId = new Map(scored.players.map((p) => [p.id, p]));
    for (const p of s.players) p.points = byId.get(p.id)?.points ?? p.points;
    game.result = { reason: 'deck_survived', payouts: scored.payouts, bank: game.bank, bankedByOne: scored.bankedByOne };
    s.history.push({ ordinal: game.ordinal, oneId: game.oneId, reason: 'deck_survived', bankedByOne: scored.bankedByOne });
    s.phase = 'LEADERBOARD';
    s.pendingNextOneId = this.nextOneByDefault();
    return this.changed();
  }

  /** Call often; locks Phase A when its timer runs out. Returns true if anything changed. With no student devices the timer is only a guide. */
  tick(): boolean {
    const s = this.session;
    if (s.noDevices) return false;
    const rescue = s.game?.rescue;
    if (s.phase === 'RESCUE' && rescue?.deadline != null && this.clock.now() >= rescue.deadline) {
      this.closeRescue();
      return true;
    }
    const active = s.game?.active;
    if (s.phase === 'PHASE_A' && !s.paused && active?.deadline != null && this.clock.now() >= active.deadline) {
      this.lock();
      return true;
    }
    return false;
  }

  /** The class is locked in; now The One sees the question. */
  showToOne(): Result {
    const s = this.session;
    const active = s.game?.active;
    if (!active || s.phase !== 'PHASE_A_LOCKED') return no('The class is still answering.');
    active.phaseBStartedAt = this.clock.now();
    s.phase = 'PHASE_B';
    if (!s.noDevices && !this.one?.connected) this.pause('one_disconnected');
    return this.changed();
  }

  private helpCheck(playerId: string, help: Help): { ok: false; message: string } | { ok: true; active: Attempt } {
    const s = this.session;
    const game = s.game;
    const active = game?.active;
    if (!game || !active || s.phase !== 'PHASE_B' || s.paused) return { ok: false, message: 'Lifelines are only for the Spotlight Round.' };
    if (game.oneId !== playerId) return { ok: false, message: 'Only The One can use a lifeline.' };
    if (s.settings.helpsPerGame[help] <= 0 || game.helpsUsed[help]) return { ok: false, message: 'That lifeline is already used.' };
    if (active.helpUsed) return { ok: false, message: 'You already used a lifeline on this question.' };
    return { ok: true, active };
  }

  /** Poll the Class: The One picks an answer and sees how many classmates chose it. With no student devices, it shows the Class Majority. */
  helpPoll(playerId: string, choice: number): Result {
    const check = this.helpCheck(playerId, 'poll');
    if (!check.ok) return check;
    const { active } = check;
    if (this.session.noDevices) {
      if (active.classMajority == null) return no('The class didn’t vote on this one. Try another lifeline!');
      active.helpUsed = 'poll';
      active.helpResult = { type: 'majority', choice: active.classMajority };
      this.session.game!.helpsUsed.poll = true;
      return this.changed();
    }
    if (!Number.isInteger(choice) || choice < 0 || choice >= active.question.choices.length)
      return no('Choose one of the answers shown.');
    active.helpUsed = 'poll';
    active.helpResult = {
      type: 'poll',
      choice,
      count: active.answers.filter((a) => a.choice === choice).length,
      total: active.answers.length,
    };
    this.session.game!.helpsUsed.poll = true;
    return this.changed();
  }

  /** Ask Two: one classmate who got it right and one who didn't explain their thinking out loud. With no student devices the teacher chooses them, so this only marks it used. */
  helpAsk(playerId: string): Result {
    const check = this.helpCheck(playerId, 'ask');
    if (!check.ok) return check;
    const { active } = check;
    if (this.session.noDevices) {
      active.helpUsed = 'ask';
      active.helpResult = { type: 'ask', speakers: [], bonusEach: 0 };
      this.session.game!.helpsUsed.ask = true;
      return this.changed();
    }
    const here = active.answers.filter((a) => this.player(a.playerId)?.connected);
    const right = here.filter((a) => a.choice === active.question.correct);
    const wrong = here.filter((a) => a.choice !== active.question.correct);
    if (right.length === 0 || wrong.length === 0)
      return no('Ask Two needs classmates with different answers this time. Try another lifeline!');
    const pick = <T>(list: T[]) => list[Math.floor(this.clock.random() * list.length)];
    const chosen = [pick(right), pick(wrong)];
    if (this.clock.random() < 0.5) chosen.reverse();
    const bonus = this.session.settings.askSpeakerBonus;
    for (const a of chosen) {
      const p = this.player(a.playerId);
      if (p) p.points += bonus;
    }
    active.helpUsed = 'ask';
    active.helpResult = {
      type: 'ask',
      speakers: chosen.map((a) => ({ playerId: a.playerId, nickname: this.player(a.playerId)?.nickname ?? 'Classmate', choice: a.choice })),
      bonusEach: bonus,
    };
    this.session.game!.helpsUsed.ask = true;
    return this.changed();
  }

  /** Go with the Class: lock in the class's most popular answer (with no student devices, the Class Majority). */
  helpTrust(playerId: string): Result {
    const check = this.helpCheck(playerId, 'trust');
    if (!check.ok) return check;
    const { active } = check;
    if (this.session.noDevices) {
      if (active.classMajority == null) return no('The class didn’t vote on this one. Try another lifeline!');
      active.helpUsed = 'trust';
      active.helpResult = { type: 'trust', choice: active.classMajority, counts: [] };
      this.session.game!.helpsUsed.trust = true;
      return this.lockOne(active, active.classMajority);
    }
    if (active.answers.length === 0) return no('Nobody in the class answered this one.');
    const counts = active.question.choices.map((_, i) => active.answers.filter((a) => a.choice === i).length);
    const top = Math.max(...counts);
    const tied = counts.flatMap((count, i) => (count === top ? [i] : []));
    const choice = tied[Math.floor(this.clock.random() * tied.length)];
    active.helpUsed = 'trust';
    active.helpResult = { type: 'trust', choice, counts };
    this.session.game!.helpsUsed.trust = true;
    return this.lockOne(active, choice);
  }

  oneAnswer(playerId: string, attemptId: string, choice: number): Result {
    const s = this.session;
    const active = s.game?.active;
    if (!active || s.phase !== 'PHASE_B' || s.paused) return no('It isn’t your turn to answer.');
    if (s.game!.oneId !== playerId) return no('Only The One answers now.');
    if (active.id !== attemptId) return no('That question has already closed.');
    if (!Number.isInteger(choice) || choice < 0 || choice >= active.question.choices.length)
      return no('Choose one of the answers shown.');
    return this.lockOne(active, choice);
  }

  /** When The One's device is gone, the teacher can enter their spoken answer. */
  answerForOne(choice: number): Result {
    const s = this.session;
    const active = s.game?.active;
    if (!active || s.phase !== 'PHASE_B') return no('The One isn’t answering right now.');
    if (!Number.isInteger(choice) || choice < 0 || choice >= active.question.choices.length) return no('Pick an answer.');
    s.paused = false;
    this.pauseReason = null;
    return this.lockOne(active, choice);
  }

  private lockOne(active: Attempt, choice: number): Result {
    active.oneAnswer = choice;
    active.oneMs = this.clock.now() - (active.phaseBStartedAt ?? this.clock.now());
    this.session.phase = 'ONE_LOCKED';
    return this.changed();
  }

  /** Shows the right answer, scores everyone, and decides whether the game is over. */
  reveal(): Result {
    const s = this.session;
    const game = s.game;
    const active = game?.active;
    if (!game || !active || s.phase !== 'ONE_LOCKED' || active.oneAnswer === null) return no('The One hasn’t locked an answer yet.');
    const correct = active.question.correct;
    const oneCorrect = active.oneAnswer === correct;
    const shared = {
      players: s.players.map((p) => ({ id: p.id, role: p.role, points: p.points, streak: p.streak })),
      correct,
      oneId: game.oneId,
      oneCorrect,
      strikes: game.strikes,
      bank: game.bank,
      questionNumber: active.index,
      deckSize: game.deck.length,
      settings: s.settings,
    };
    const scored = s.noDevices
      ? scoreNoDevicesReveal({ ...shared, classId: CLASS_ID, classMajority: active.classMajority ?? null })
      : scoreReveal({ ...shared, eligible: active.eligible, answers: new Map(active.answers.map((a) => [a.playerId, a.choice])) });

    // On a Roll: fast, unaided right answers fill a meter that restores one strike, once per game.
    let strikes = scored.strikes;
    let momentumCredited = false;
    let momentumFilled = false;
    if (s.settings.momentumEnabled && oneCorrect && active.helpUsed === null && active.oneMs !== null) {
      const roles = new Map(s.players.map((p) => [p.id, p.role]));
      const window = momentumWindowMs(
        active.answers.map((a) => ({ choice: a.choice, ms: a.ms, role: roles.get(a.playerId) ?? 'crowd' })),
        correct,
        s.settings,
      );
      if (active.oneMs <= window) {
        momentumCredited = true;
        game.momentum.progress++;
        if (!game.momentum.awardedOnce && game.momentum.progress >= s.settings.momentumThreshold) {
          game.momentum.awardedOnce = true;
          momentumFilled = true;
          strikes++;
        }
      }
    }

    // The Class Streak: questions in a row most of The Class (as it stood) got right. Every few earn a Rescue.
    let classRight: boolean | undefined;
    let rescueEarned = false;
    if (!s.noDevices && s.settings.rescueStreak > 0) {
      const theClass = active.eligible.filter((id) => this.player(id)?.role === 'mob');
      const right = active.answers.filter((a) => a.choice === correct && theClass.includes(a.playerId)).length;
      classRight = theClass.length > 0 && right * 2 > theClass.length;
      game.classStreak = classRight ? (game.classStreak ?? 0) + 1 : 0;
      if (classRight && game.classStreak % s.settings.rescueStreak === 0) {
        game.rescuesEarned = (game.rescuesEarned ?? 0) + 1;
        rescueEarned = true;
      }
    }

    const byId = new Map(scored.players.map((p) => [p.id, p]));
    for (const p of s.players) {
      const next = byId.get(p.id);
      if (!next) continue;
      p.points = next.points;
      p.streak = next.streak;
      p.role = next.role;
    }
    game.strikes = strikes;
    game.bank = scored.bank;
    game.offset = active.index;
    game.reveal = {
      correct,
      oneAnswer: active.oneAnswer,
      oneCorrect,
      counts: active.question.choices.map((_, i) => active.answers.filter((a) => a.choice === i).length),
      demoted: scored.demoted,
      deltas: scored.deltas,
      bankDelta: scored.bankDelta,
      momentumCredited,
      momentumFilled,
      ...(s.noDevices ? { classMajority: active.classMajority ?? null } : {}),
      ...(classRight === undefined ? {} : { classRight, rescueEarned }),
    };
    if (scored.endReason) {
      game.result = { reason: scored.endReason, payouts: scored.payouts, bank: scored.bank, bankedByOne: scored.bankedByOne };
      s.history.push({ ordinal: game.ordinal, oneId: game.oneId, reason: scored.endReason, bankedByOne: scored.bankedByOne });
    }
    s.phase = 'REVEAL';
    return this.changed();
  }

  /** From the reveal: a Rescue if The Class has one to spend, the next question, or the leaderboard if the game is over. */
  next(): Result {
    const s = this.session;
    if (s.phase === 'BETWEEN') return this.openQuestion();
    if (s.phase === 'RESCUE') {
      if (s.game?.rescue?.rescuedId === null) return no('The Class is still voting.');
      if (s.game) s.game.rescue = null;
      return this.openQuestion();
    }
    if (s.phase !== 'REVEAL' || !s.game) return no('Reveal the answer first.');
    if (s.game.result) {
      s.phase = 'LEADERBOARD';
      s.pendingNextOneId = this.nextOneByDefault();
      return this.changed();
    }
    const crew = s.players.filter((p) => p.role === 'crowd').map((p) => p.id);
    // A Rescue waits for someone to bring back.
    if ((s.game.rescuesEarned ?? 0) > 0 && crew.length > 0) {
      s.game.rescuesEarned!--;
      s.game.rescue = { candidates: crew, votes: {}, deadline: this.clock.now() + s.settings.rescueSeconds * 1000, rescuedId: null };
      s.phase = 'RESCUE';
      return this.changed();
    }
    return this.openQuestion();
  }

  /** A vote in a Rescue, from one of The Class for one of the Comeback Crew; it can be changed until voting closes. */
  rescueVote(playerId: string, candidateId: string): Result {
    const s = this.session;
    const rescue = s.game?.rescue;
    if (s.phase !== 'RESCUE' || !rescue || rescue.deadline === null) return no('There’s no Rescue vote open.');
    if (this.player(playerId)?.role !== 'mob') return no('Only The Class votes in a Rescue.');
    if (!rescue.candidates.includes(candidateId)) return no('Vote for one of the Comeback Crew.');
    rescue.votes[playerId] = candidateId;
    const voters = s.players.filter((p) => p.role === 'mob' && p.connected);
    if (voters.every((p) => rescue.votes[p.id])) return this.closeRescue();
    return this.changed();
  }

  /** Closes a Rescue vote: the most votes comes back to The Class, a tie (or no votes) settled at random. */
  closeRescue(): Result {
    const s = this.session;
    const rescue = s.game?.rescue;
    if (s.phase !== 'RESCUE' || !rescue || rescue.deadline === null) return no('There’s no Rescue vote open.');
    const still = rescue.candidates.filter((id) => this.player(id)?.role === 'crowd');
    rescue.deadline = null;
    if (!still.length) {
      rescue.rescuedId = '';
      return this.changed();
    }
    const tally = new Map(still.map((id) => [id, 0]));
    for (const id of Object.values(rescue.votes)) if (tally.has(id)) tally.set(id, tally.get(id)! + 1);
    const most = Math.max(...tally.values());
    const tied = still.filter((id) => tally.get(id) === most);
    const rescued = this.player(tied[Math.floor(this.clock.random() * tied.length)])!;
    rescued.role = 'mob';
    rescue.rescuedId = rescued.id;
    return this.changed();
  }

  /** The teacher passes on a Rescue: nobody comes back, and the game goes on. */
  skipRescue(): Result {
    const s = this.session;
    if (s.phase !== 'RESCUE' || !s.game) return no('There’s no Rescue vote open.');
    s.game.rescue = null;
    return this.openQuestion();
  }

  pause(reason: PauseReason = 'teacher'): Result {
    const s = this.session;
    const active = s.game?.active;
    if (!active || (s.phase !== 'PHASE_A' && s.phase !== 'PHASE_B')) return no('You can pause while a question is open.');
    if (s.paused) return ok;
    const now = this.clock.now();
    if (s.phase === 'PHASE_A' && active.deadline !== null) {
      active.pausedRemainingMs = Math.max(0, active.deadline - now);
      active.deadline = null;
    }
    active.pausedAt = now;
    s.paused = true;
    this.pauseReason = reason;
    return this.changed();
  }

  resume(): Result {
    const s = this.session;
    const active = s.game?.active;
    if (!s.paused || !active) return no('The game isn’t paused.');
    const now = this.clock.now();
    const pausedFor = active.pausedAt === null ? 0 : now - active.pausedAt;
    if (s.phase === 'PHASE_A' && active.pausedRemainingMs !== null) {
      // Give at least a few seconds back so nobody is cut off mid-tap.
      active.deadline = now + Math.max(3000, active.pausedRemainingMs);
      active.startedAt += pausedFor;
      active.pausedRemainingMs = null;
    }
    if (s.phase === 'PHASE_B' && active.phaseBStartedAt !== null) active.phaseBStartedAt += pausedFor;
    active.pausedAt = null;
    s.paused = false;
    this.pauseReason = null;
    return this.changed();
  }

  /** Stops the current game without a winner and goes to the leaderboard. */
  endGame(): Result {
    const s = this.session;
    if (!s.game || !this.gameLive) return no('No game is running.');
    s.game.active = null;
    s.game.reveal = null;
    s.game.rescue = null;
    s.paused = false;
    this.pauseReason = null;
    s.phase = 'LEADERBOARD';
    s.pendingNextOneId = this.nextOneByDefault();
    return this.changed();
  }

  endSession(): Result {
    const s = this.session;
    if (s.phase === 'ENDED') return ok;
    s.phase = 'ENDED';
    s.paused = false;
    this.pauseReason = null;
    if (s.game) s.game.active = null;
    return this.changed();
  }
}

export type Standing = { rank: number; playerId: string; nickname: string; points: number; hasBeenOne: boolean; role: Player['role'] };

export function standings(players: Player[]): Standing[] {
  const sorted = [...players].sort((a, b) => b.points - a.points || a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  let rank = 0;
  let previous: number | undefined;
  return sorted.map((p, i) => {
    if (p.points !== previous) rank = i + 1;
    previous = p.points;
    return { rank, playerId: p.id, nickname: p.nickname, points: p.points, hasBeenOne: p.hasBeenOne, role: p.role };
  });
}
