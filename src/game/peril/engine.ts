import {
  MAX_PLAYERS,
  nicknameProblem,
  normalizeNickname,
  randomId,
  type Clock,
  type Result,
} from '../engine';
import {
  DEFAULT_PERIL_SETTINGS,
  type Column,
  type PerilPlayer,
  type PerilSession,
  type PerilSettings,
  type Tile,
} from './types';

/**
 * The rules of Peril!, run by the teacher's tab. Like Champion's Engine,
 * every command checks it is allowed right now, changes the session in
 * place, and returns ok or a message a person can read.
 *
 *   LOBBY ─startBoard→ BOARD ─pickTile→ READING ─armBuzzers→ BUZZING ─buzz→ ANSWERING ─answer→ REVEAL ─next→ BOARD …
 *   A Treasure Trove goes BOARD ─pickTile→ WAGERING ─wagers in→ ANSWERING.
 *   When every Tile is played, REVEAL ─next→ FINAL ─startBoard→ BOARD …
 *
 * With no student devices the Teams have no members: the teacher taps the Team that
 * buzzed (buzzFor), the choice it gave (answerFor) and a Treasure Trove's
 * Wager (wagerFor). Only the Buzz has a clock.
 */

const ok: Result = { ok: true };
const no = (message: string): Result => ({ ok: false, message });

const systemClock: Clock = { now: () => Date.now(), random: () => Math.random() };

export function createPerilSession(input: {
  code: string;
  settings?: Partial<PerilSettings>;
  noDevices?: boolean;
  clock?: Clock;
}): PerilSession {
  const clock = input.clock ?? systemClock;
  const settings = { ...DEFAULT_PERIL_SETTINGS, ...input.settings };
  return {
    mode: 'peril',
    version: 1,
    code: input.code,
    createdAt: clock.now(),
    ...(input.noDevices ? { noDevices: true } : {}),
    settings,
    players: [],
    teams: (settings.teams?.names ?? []).map((name) => ({
      id: randomId(clock.random),
      name,
      points: 0,
    })),
    phase: 'LOBBY',
    board: [],
    played: [],
    control: null,
    open: null,
    boardsPlayed: 0,
    draft: null,
    seq: 0,
  };
}

export class PerilEngine {
  session: PerilSession;
  readonly clock: Clock;
  readonly kicked = new Set<string>();

  constructor(session: PerilSession, clock: Clock = systemClock) {
    this.session = session;
    this.clock = clock;
    for (const player of session.players) player.connected = false;
  }

  private changed(): Result {
    this.session.seq++;
    return ok;
  }

  player(id: string): PerilPlayer | undefined {
    return this.session.players.find((p) => p.id === id);
  }

  /** Who scores for a student: the student in Solo, their Team in Teams. */
  contenderOf(playerId: string): string | null {
    const player = this.player(playerId);
    if (!player) return null;
    return this.session.settings.teams ? player.teamId : player.id;
  }

  /** Every contender who can play: each student in Solo, each Team with a member in Teams, every Team with no student devices. */
  contenders(): string[] {
    const s = this.session;
    if (!s.settings.teams) return s.players.map((p) => p.id);
    if (s.noDevices) return s.teams.map((team) => team.id);
    return s.teams
      .filter((team) => s.players.some((p) => p.teamId === team.id))
      .map((team) => team.id);
  }

  tileAt(column: number, row: number): Tile | undefined {
    return this.session.board[column]?.tiles[row];
  }

  get openTile(): Tile | undefined {
    const open = this.session.open;
    return open ? this.tileAt(open.column, open.row) : undefined;
  }

  // ── Joining ────────────────────────────────────────────────────────────

  join(input: {
    playerId?: string;
    secret?: string;
    nickname: string;
  }): { ok: true; player: PerilPlayer; rejoined: boolean } | { ok: false; message: string } {
    const s = this.session;
    if (input.playerId && this.kicked.has(input.playerId))
      return { ok: false, message: 'Your teacher removed you from this game.' };
    const existing = input.playerId ? this.player(input.playerId) : undefined;
    if (existing) {
      if (existing.secret !== input.secret)
        return { ok: false, message: 'That seat belongs to another device.' };
      existing.connected = true;
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
    const player: PerilPlayer = {
      id: randomId(this.clock.random),
      secret: randomId(this.clock.random),
      nickname,
      teamId: null,
      points: 0,
      rightVotes: 0,
      buzzesWon: 0,
      joinedAt: this.clock.now(),
      connected: true,
    };
    s.players.push(player);
    if (s.settings.teams?.assign === 'auto') player.teamId = this.smallestTeam();
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
    return this.changed();
  }

  endSession(): Result {
    this.session.phase = 'ENDED';
    this.session.open = null;
    return this.changed();
  }

  /** The rules can change in the lobby and between boards. Teams are set when the room opens. */
  updateSettings(settings: Partial<Omit<PerilSettings, 'teams'>>): Result {
    const s = this.session;
    if (s.phase !== 'LOBBY' && s.phase !== 'FINAL') return no('Change the rules between boards.');
    const { teams, ...rules } = settings as Partial<PerilSettings>;
    // Teams are set when the room opens, never by a rules change.
    void teams;
    s.settings = { ...s.settings, ...rules };
    return this.changed();
  }

    // ── Teams ──────────────────────────────────────────────────────────────

  private smallestTeam(): string | null {
    const s = this.session;
    let smallest: string | null = null;
    let fewest = Infinity;
    for (const team of s.teams) {
      const members = s.players.filter((p) => p.teamId === team.id).length;
      if (members < fewest) [smallest, fewest] = [team.id, members];
    }
    return smallest;
  }

  /** Where students choose: a student picks their Team in the lobby, or when they arrive late without one. */
  chooseTeam(playerId: string, teamId: string): Result {
    const player = this.player(playerId);
    if (!player) return no('Join the game first.');
    if (this.session.settings.teams?.assign !== 'manual') return no('Your teacher sets the teams.');
    if (this.session.phase !== 'LOBBY' && player.teamId) return no('Teams are set for this board.');
    return this.moveToTeam(playerId, teamId);
  }

  /** The teacher moves a student to another Team. */
  moveToTeam(playerId: string, teamId: string): Result {
    const player = this.player(playerId);
    if (!player || !this.session.teams.some((team) => team.id === teamId))
      return no('There’s no such team.');
    player.teamId = teamId;
    return this.changed();
  }

  renameTeam(teamId: string, name: string): Result {
    const team = this.session.teams.find((t) => t.id === teamId);
    const clean = normalizeNickname(name);
    if (!team || !clean) return no('Give the team a name.');
    team.name = clean.slice(0, 40);
    return this.changed();
  }

  /** The teacher configures teams before the board starts. */
  configureTeams(config: { names: string[]; assign: 'auto' | 'manual' }): Result {
    const s = this.session;
    const cleanNames = config.names.map((n) => normalizeNickname(n)).filter(Boolean);
    if (cleanNames.length < 2) return no('At least two teams are required.');
    s.settings.teams = { names: cleanNames, assign: config.assign };
    s.teams = cleanNames.map((name, i) => {
      const existing = s.teams[i];
      return existing ? { ...existing, name } : { id: randomId(this.clock.random), name, points: 0 };
    });
    const validTeamIds = new Set(s.teams.map((t) => t.id));
    for (const player of s.players) {
      if (!player.teamId || !validTeamIds.has(player.teamId)) {
        player.teamId = config.assign === 'auto' ? this.smallestTeam() : null;
      }
    }
    return this.changed();
  }

  /** Deals every student into the Teams again, as evenly as they go. */
  shuffleTeams(): Result {
    const s = this.session;
    if (!s.teams.length) return no('This game is played solo.');
    const players = [...s.players];
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(this.clock.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
    }
    players.forEach((player, i) => (player.teamId = s.teams[i % s.teams.length].id));
    return this.changed();
  }

  // ── The board ──────────────────────────────────────────────────────────

  /** Deals a Board and gives Control to a random contender. */
  startBoard(board: Column[]): Result {
    const s = this.session;
    if (s.phase !== 'LOBBY' && s.phase !== 'FINAL') return no('A board is already being played.');
    if (!board.some((column) => column.tiles.length)) return no('The board has no questions.');
    for (const player of s.players)
      if (s.teams.length && !player.teamId) player.teamId = this.smallestTeam();
    const contenders = this.contenders();
    if (!contenders.length) return no('Wait for a student to join.');
    s.board = board;
    s.played = [];
    s.open = null;
    s.control = contenders[Math.floor(this.clock.random() * contenders.length)];
    s.phase = 'BOARD';
    return this.changed();
  }

  /** The student with Control picks a Tile, or the teacher does (no `playerId`). */
  pickTile(column: number, row: number, playerId?: string): Result {
    const s = this.session;
    if (s.phase !== 'BOARD') return no('Wait for the board.');
    if (playerId !== undefined && this.contenderOf(playerId) !== s.control)
      return no('It’s not your pick.');
    const tile = this.tileAt(column, row);
    if (!tile || s.played.includes(`${column}:${row}`)) return no('That tile has been played.');
    s.open = {
      column,
      row,
      answering: null,
      buzzer: null,
      lockedOut: [],
      votes: [],
      wagers: [],
      wager: null,
      deadline: null,
      result: null,
    };
    if (!tile.treasureTrove) {
      s.phase = 'READING';
      return this.changed();
    }
    // A Treasure Trove belongs to whoever found it: no buzzers.
    s.open.answering = s.control;
    s.open.buzzer = s.settings.teams ? null : s.control;
    s.open.deadline = s.noDevices ? null : this.clock.now() + s.settings.wagerSeconds * 1000;
    s.phase = 'WAGERING';
    return this.changed();
  }

  /** The most a contender may wager: their score, or 500 if that's more. */
  maxWager(contender: string): number {
    const holder =
      this.session.teams.find((team) => team.id === contender) ?? this.player(contender);
    return Math.max(holder?.points ?? 0, 500);
  }

  /** In Teams every member enters a number; the Wager is their median. */
  wager(playerId: string, amount: number): Result {
    const s = this.session;
    const open = s.open;
    if (s.phase !== 'WAGERING' || !open) return no('There’s nothing to wager on.');
    if (this.contenderOf(playerId) !== open.answering)
      return no('This Treasure Trove isn’t yours.');
    if (!Number.isFinite(amount)) return no('Enter a number of points.');
    const clamped = Math.min(this.maxWager(open.answering!), Math.max(5, Math.floor(amount)));
    open.wagers = open.wagers.filter((w) => w.playerId !== playerId);
    open.wagers.push({ playerId, amount: clamped });
    const members = s.players.filter(
      (p) => p.connected && this.contenderOf(p.id) === open.answering,
    );
    if (members.every((p) => open.wagers.some((w) => w.playerId === p.id)))
      return this.settleWager();
    return this.changed();
  }

  private settleWager(): Result {
    const s = this.session;
    const open = s.open!;
    const amounts = open.wagers.map((w) => w.amount).sort((a, b) => a - b);
    const middle = amounts.length >> 1;
    open.wager = !amounts.length
      ? 5
      : amounts.length % 2
        ? amounts[middle]
        : Math.floor((amounts[middle - 1] + amounts[middle]) / 2);
    open.deadline = s.noDevices
      ? null
      : this.clock.now() +
        (s.settings.teams ? s.settings.voteSeconds : s.settings.answerSeconds) * 1000;
    s.phase = 'ANSWERING';
    return this.changed();
  }

  /** With no student devices: the Wager the Team with the Treasure Trove says out loud. */
  wagerFor(amount: number): Result {
    const s = this.session;
    const open = s.open;
    if (!s.noDevices) return no('Students wager on their devices.');
    if (s.phase !== 'WAGERING' || !open?.answering) return no('There’s nothing to wager on.');
    if (!Number.isFinite(amount)) return no('Enter a number of points.');
    const clamped = Math.min(this.maxWager(open.answering), Math.max(5, Math.floor(amount)));
    open.wagers = [{ playerId: open.answering, amount: clamped }];
    return this.settleWager();
  }

  armBuzzers(): Result {
    const s = this.session;
    if (s.phase !== 'READING') return no('There’s no tile waiting for buzzers.');
    return this.arm();
  }

  private arm(): Result {
    const s = this.session;
    s.phase = 'BUZZING';
    s.open!.deadline = this.clock.now() + s.settings.buzzSeconds * 1000;
    return this.changed();
  }

  buzz(playerId: string): Result {
    const s = this.session;
    const open = s.open;
    if (s.phase !== 'BUZZING' || !open)
      return no(s.phase === 'READING' ? 'Wait for the buzzers.' : 'Too late!');
    const contender = this.contenderOf(playerId);
    if (!contender) return no('Join a team first.');
    if (open.lockedOut.includes(contender)) return no('You’ve had your try at this one.');
    open.answering = contender;
    open.buzzer = playerId;
    open.votes = [];
    open.deadline =
      this.clock.now() +
      (s.settings.teams ? s.settings.voteSeconds : s.settings.answerSeconds) * 1000;
    s.phase = 'ANSWERING';
    return this.changed();
  }

  /** With no student devices: the Team that buzzed first, as the teacher saw it. */
  buzzFor(contender: string): Result {
    const s = this.session;
    const open = s.open;
    if (!s.noDevices) return no('Students buzz on their devices.');
    if (s.phase !== 'BUZZING' || !open) return no('The buzzers aren’t armed.');
    if (!this.contenders().includes(contender)) return no('There’s no such team.');
    if (open.lockedOut.includes(contender)) return no('That team has had its try at this one.');
    open.answering = contender;
    open.buzzer = null;
    open.votes = [];
    open.deadline = null;
    s.phase = 'ANSWERING';
    return this.changed();
  }

  /** With no student devices: the answer the Team gave out loud. */
  answerFor(choice: number): Result {
    const s = this.session;
    const open = s.open;
    const tile = this.openTile;
    if (!s.noDevices) return no('Students answer on their devices.');
    if (s.phase !== 'ANSWERING' || !open?.answering || !tile) return no('There’s nothing to answer.');
    if (!Number.isInteger(choice) || choice < 0 || choice >= tile.question.choices.length)
      return no('Pick one of the answers.');
    open.votes = [{ playerId: open.answering, choice, at: this.clock.now() }];
    return this.settle();
  }

  answer(playerId: string, choice: number): Result {
    const s = this.session;
    const open = s.open;
    const tile = this.openTile;
    if (s.phase !== 'ANSWERING' || !open || !tile) return no('There’s nothing to answer.');
    const answering = s.settings.teams
      ? this.contenderOf(playerId) === open.answering
      : open.buzzer === playerId;
    if (!answering) return no('It’s not your turn to answer.');
    if (!Number.isInteger(choice) || choice < 0 || choice >= tile.question.choices.length)
      return no('Pick one of the answers.');
    open.votes = open.votes.filter((vote) => vote.playerId !== playerId);
    open.votes.push({ playerId, choice, at: this.clock.now() });
    const voters = s.players.filter(
      (p) => p.connected && this.contenderOf(p.id) === open.answering,
    );
    if (voters.every((p) => open.votes.some((vote) => vote.playerId === p.id)))
      return this.settle();
    return this.changed();
  }

  /**
   * The answer the votes settle on: the most votes, a tie going to the
   * buzzer's choice, or else to the tied choice voted for first.
   */
  private chosen(): number | null {
    const open = this.session.open!;
    const counts = new Map<number, number>();
    for (const vote of open.votes) counts.set(vote.choice, (counts.get(vote.choice) ?? 0) + 1);
    const most = Math.max(0, ...counts.values());
    const tied = open.votes
      .filter((vote) => counts.get(vote.choice) === most)
      .sort((a, b) => a.at - b.at);
    return (tied.find((vote) => vote.playerId === open.buzzer) ?? tied[0])?.choice ?? null;
  }

  private addPoints(contender: string, points: number) {
    const holder =
      this.session.teams.find((team) => team.id === contender) ?? this.player(contender);
    if (holder) holder.points += points;
  }

  /**
   * Scores the answer in. A right answer takes the Tile and Control. A wrong
   * one may cost the Tile's value, and buzzers re-arm for whoever hasn't
   * tried yet; when nobody is left, the answer shows.
   */
  private settle(): Result {
    const s = this.session;
    const open = s.open!;
    const tile = this.openTile!;
    const contender = open.answering!;
    const choice = this.chosen();
    const correct = choice === tile.question.correct;
    const stake = open.wager ?? tile.value;
    const points = correct
      ? stake
      : open.wager !== null || s.settings.wrongAnswerPenalty
        ? -stake
        : 0;
    this.addPoints(contender, points);
    open.result = { contender, choice, correct, points };
    if (correct) {
      s.control = contender;
      const buzzer = open.buzzer && this.player(open.buzzer);
      if (buzzer) buzzer.buzzesWon++;
      for (const vote of open.votes) {
        const voter = vote.choice === choice && this.player(vote.playerId);
        if (voter) voter.rightVotes++;
      }
    } else {
      open.lockedOut.push(contender);
      open.answering = null;
      open.buzzer = null;
      if (open.wager === null && this.contenders().some((c) => !open.lockedOut.includes(c)))
        return this.arm();
    }
    return this.reveal();
  }

  private reveal(): Result {
    const s = this.session;
    s.open!.deadline = null;
    s.phase = 'REVEAL';
    return this.changed();
  }

  /** Runs out whatever clock is running. True when something changed. */
  tick(): boolean {
    const s = this.session;
    const open = s.open;
    if (!open?.deadline || this.clock.now() < open.deadline) return false;
    if (s.phase === 'BUZZING') {
      open.result = { contender: null, choice: null, correct: false, points: 0 };
      this.reveal();
    } else if (s.phase === 'ANSWERING') this.settle();
    else if (s.phase === 'WAGERING') this.settleWager();
    else return false;
    return true;
  }

  next(): Result {
    const s = this.session;
    if (s.phase !== 'REVEAL' || !s.open) return no('Finish this tile first.');
    s.played.push(`${s.open.column}:${s.open.row}`);
    s.open = null;
    const tiles = s.board.reduce((n, column) => n + column.tiles.length, 0);
    if (s.played.length < tiles) s.phase = 'BOARD';
    else {
      s.phase = 'FINAL';
      s.boardsPlayed++;
    }
    return this.changed();
  }
}
