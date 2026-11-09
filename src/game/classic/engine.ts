import { MAX_PLAYERS, nicknameProblem, normalizeNickname, randomId, type Clock, type Result } from '../engine';
import type { Question } from '../types';
import { acceptedAnswersOf, textIsRight } from '../text-match';

/** Egy beírt válasz leghosszabb elfogadott hossza — a huzalon sem megy több. */
export const MAX_TEXT_LENGTH = 120;
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
    /** A diák figurájának magja; később a `setAvatar` állítja át. */
    avatar?: string;
    /** A tanár telefonja: játékos, de nem játszik (lásd `remote`). */
    remote?: boolean;
  }): { ok: true; player: ClassicPlayer; rejoined: boolean } | { ok: false; message: string } {
    const s = this.session;
    if (input.playerId && this.kicked.has(input.playerId)) return { ok: false, message: 'Your teacher removed you from this game.' };
    const existing = input.playerId ? this.player(input.playerId) : undefined;
    if (existing) {
      if (existing.secret !== input.secret) return { ok: false, message: 'That seat belongs to another device.' };
      existing.connected = true;
      if (input.avatar) existing.avatar = input.avatar;
      if (input.remote) existing.remote = true;
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
      ...(input.avatar ? { avatar: input.avatar } : {}),
      points: 0,
      joinedAt: this.clock.now(),
      connected: true,
      ...(input.remote ? { remote: true } : {}),
    };
    s.players.push(player);
    this.changed();
    return { ok: true, player, rejoined: false };
  }

  /** A várakozás alatt kért új figura: a tanár gépe tárolja a magot. */
  setAvatar(playerId: string, seed: string): void {
    const player = this.player(playerId);
    const clean = seed.trim().slice(0, 32);
    if (!player || !clean || player.avatar === clean) return;
    player.avatar = clean;
    this.changed();
  }

  /** A telefon a belépés után jelöli ki magát távirányítónak (vagy vissza). */
  setRemote(playerId: string, remote: boolean): void {
    const player = this.player(playerId);
    if (!player || player.remote === (remote ? true : undefined)) return;
    if (remote) player.remote = true;
    else delete player.remote;
    this.changed();
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
    if (!s.players.some((p) => !p.remote) && !s.noDevices) return no('Wait for a student to join.');
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

  /** One tap, one answer: the shape every single-answer screen uses. */
  answer(playerId: string, choice: number): Result {
    return this.answerMany(playerId, [choice])
  }

  /** Párosítás: fogalmanként a válasz indexe. */
  answerPairs(playerId: string, pairs: number[]): Result {
    return this.answerMany(playerId, pairs)
  }

  /** A sorrendezés kérdés: a válasz a felkínált elemek sorrendje. */
  answerOrder(playerId: string, order: number[]): Result {
    return this.answerMany(playerId, order)
  }

  /** A Multiple Answer question: every ticked choice, in the order they were tapped. */
  answerMany(playerId: string, choices: number[]): Result {
    return this.submit(playerId, choices, [])
  }

  /** Kiegészítés és rövid válasz: a beírt szöveg, hézagonként, sorrendben. */
  answerTexts(playerId: string, texts: string[]): Result {
    return this.submit(playerId, [], texts)
  }

  /** Egy válasz rögzítése: kártyaindexekkel vagy beírt szöveggel. */
  private submit(playerId: string, choices: number[], texts: string[]): Result {
    const s = this.session
    const question = this.question
    if (s.phase !== 'QUESTION' || !question) return no('Wait for the next question.')
    if (!this.player(playerId)) return no('Join the game first.')
    const answers = s.answers[s.index]
    if (answers.some((a) => a.playerId === playerId)) return no('You’ve already answered.')
    const ms = this.clock.now() - (s.openedAt ?? this.clock.now())

    // Szöveges válasznál hézagonként egy beírás számít, kártya nincs.
    if (question.blanks || question.accepted) {
      const wanted = question.blanks ? question.blanks.length : 1
      const given = texts.map((text) => text.slice(0, MAX_TEXT_LENGTH).trim())
      if (given.length !== wanted || given.some((text) => !text)) return no('Write your answer first.')
      answers.push({ playerId, choice: -1, texts: given, ms })
      if (s.settings.scoring && answerIsRight(question, [], given)) this.award(playerId, ms)
      this.closeIfAllIn()
      return this.changed()
    }

    // Sorrendnél és párosításnál a sorrend számít (fogalmanként egy válasz),
    // minden más kérdésnél a jelölés halmaz.
    const sequence = !!question.correctOrder || !!question.matches
    const picked = sequence ? [...choices] : [...new Set(choices)].sort((a, b) => a - b)
    if (picked.length === 0) return no('Pick one of the answers.')
    if (question.matches && picked.length !== question.matches.length)
      return no('Match every one of them.')
    if (picked.some((choice) => !Number.isInteger(choice) || choice < 0 || choice >= question.choices.length))
      return no('Pick one of the answers.');
    answers.push({ playerId, choice: picked[0]!, choices: picked, ms });
    if (s.settings.scoring && answerIsRight(question, picked)) this.award(playerId, ms)
    this.closeIfAllIn();
    return this.changed();
  }

  /** A helyes válasz pontja: 1000-ről 500-ra csökken, ahogy telik az idő. */
  private award(playerId: string, ms: number) {
    const limit = this.session.settings.timerSeconds * 1000
    this.player(playerId)!.points += Math.round(1000 - 500 * Math.min(1, ms / limit))
  }

  /** The answers lock once everyone still connected has answered. */
  private closeIfAllIn() {
    const s = this.session;
    const answered = new Set(s.answers[s.index].map((a) => a.playerId));
    // A távirányító nem válaszol, tehát nem tarthatja nyitva a kört.
    if (s.players.filter((p) => p.connected && !p.remote).every((p) => answered.has(p.id))) this.reveal();
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

  /**
   * Szünet: az óra megáll, a kör nem megy tovább. Akkor van értelme, amikor a
   * kérdés nyitva van és fut az időzítő (diák-eszközös mód); a válaszok a
   * szünet alatt is beérkeznek, de a felfedés nem indul el.
   */
  pause(): Result {
    const s = this.session;
    if (s.phase !== 'QUESTION' || s.deadline === null) return no('You can pause while a question is open.');
    s.pausedRemainingMs = Math.max(0, s.deadline - this.clock.now());
    s.deadline = null;
    s.paused = true;
    return this.changed();
  }

  /** Folytatás: legalább pár másodpercet visszaad, hogy senki ne csússzon le. */
  resume(): Result {
    const s = this.session;
    if (!s.paused) return no('The game isn’t paused.');
    const remaining = Math.max(3000, s.pausedRemainingMs ?? 0);
    s.deadline = s.phase === 'QUESTION' ? this.clock.now() + remaining : null;
    s.pausedRemainingMs = null;
    s.paused = false;
    return this.changed();
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
/**
 * Whether an answer got the question right: every right choice, and nothing else.
 * A Multiple Answer question is all or nothing — a half-right tick is wrong.
 */
export function answerIsRight(
  question: Question,
  choices: readonly number[],
  texts: readonly string[] = [],
): boolean {
  // Kiegészítés: minden hézag a maga válaszához mérve számít (és azon belül a
  // tanár válaszában felsorolt alakok bármelyike jó).
  if (question.blanks) {
    if (texts.length !== question.blanks.length) return false
    return question.blanks.every((blank, index) =>
      textIsRight(texts[index] ?? '', acceptedAnswersOf(blank)),
    )
  }
  // Rövid válasz: a tanár javasolt válaszából készült elfogadható alakok valamelyike.
  if (question.accepted) return textIsRight(texts[0] ?? '', question.accepted)
  // A párosítás és a sorrendezés válasza szekvencia: a hely számít.
  if (question.matches) {
    if (choices.length !== question.matches.length) return false
    return question.matches.every((match, index) => match === choices[index])
  }
  // A sorrendezés válasza maga a sorrend: nem halmaz, hanem szekvencia.
  if (question.correctOrder) {
    if (choices.length !== question.correctOrder.length) return false
    return question.correctOrder.every((choice, index) => choice === choices[index])
  }
  const right = question.correctChoices ?? [question.correct];
  const picked = [...new Set(choices)].sort((a, b) => a - b);
  const expected = [...new Set(right)].sort((a, b) => a - b);
  return picked.length === expected.length && picked.every((choice, index) => choice === expected[index]);
}

export function reportOf(s: ClassicSession): ClassicReport {
  const asked = s.answers.map((answers, i) => ({ answers, question: s.questions[i] }));
  return {
    questions: asked.map(({ answers, question }) => ({
      prompt: question.prompt,
      correct: answers.filter((a) => answerIsRight(question, a.choices ?? [a.choice], a.texts ?? []))
        .length,
      answered: answers.length,
      counts: question.choices.map(
        (_, c) => answers.filter((a) => (a.choices ?? [a.choice]).includes(c)).length,
      ),
    })),
    students: s.players
      .map((p) => {
        const mine = asked.flatMap(({ answers, question }) =>
          answers
            .filter((a) => a.playerId === p.id)
            .map((a) => answerIsRight(question, a.choices ?? [a.choice])),
        );
        return { nickname: p.nickname, correct: mine.filter(Boolean).length, answered: mine.length, points: p.points };
      })
      .sort((a, b) => b.points - a.points || b.correct - a.correct || a.nickname.localeCompare(b.nickname)),
  };
}
