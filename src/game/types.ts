/**
 * Everything the game knows, as plain data. The teacher's tab owns one
 * `Session`, saves it to local storage after every change, and sends each
 * student only the slice they are allowed to see (see views.ts).
 */

import type { RichQuestion } from './rich-text';

export type Question = {
  id: string;
  prompt: string;
  /** Two to four answers. The original game used three. */
  choices: string[];
  /** Index into `choices`. For a question with several right answers, the first of them. */
  correct: number;
  /**
   * Every right choice, when more than one is (a Multiple Answer question). The
   * stage marks them all; `correct` stays the first so a single-answer screen
   * still has something to point at.
   */
  correctChoices?: number[];
  /**
   * A sorrendezés kérdés helyes sorrendje: a `choices` indexei abban a
   * sorrendben, ahogy a válasznak állnia kell. Ilyenkor a `choices` felkeverve
   * áll (a szerzői sorrend a megoldás), és a `correct` az első elem.
   */
  correctOrder?: number[];
  /**
   * Párosítás: a fogalmak (a kérdés szövegében), és a válaszok a `choices`-ban.
   * A `matches` a fogalmak sorrendjében mondja meg, melyik `choices` elem a párja.
   */
  prompts?: string[];
  matches?: number[];
  explanation?: string;
  /** Concepts the question covers; a Topic gathers questions across banks. */
  topics?: string[];
  /**
   * The same words with formatting, math or pictures, when they have any
   * (see rich/text.ts). The plain fields above are then their plain text.
   */
  rich?: RichQuestion;
};

export type QuestionBank = {
  id: string;
  title: string;
  questions: Question[];
  updatedAt: number;
};

/** The One sits in the spotlight; the Mob challenges them; the Crowd (Comeback Crew) keeps playing after a miss. */
export type Role = 'one' | 'mob' | 'crowd';

export type Player = {
  id: string;
  /** Proves a reconnecting device is the same student. Never sent to other students. */
  secret: string;
  nickname: string;
  role: Role;
  points: number;
  streak: number;
  hasBeenOne: boolean;
  joinedAt: number;
  connected: boolean;
};

export type Help = 'poll' | 'ask' | 'trust';

export type Settings = {
  /** How long the class has to answer (Phase A). */
  timerSeconds: number;
  /** Wrong answers The One can survive. */
  strikes: number;
  questionsPerGame: number;
  /** "On a Roll": fast, unaided correct answers by The One can earn back a strike. */
  momentumEnabled: boolean;
  momentumThreshold: number;
  shuffleQuestions: boolean;
  survivalDrip: number;
  bankPerElimination: number;
  jackpotMultiplier: number;
  bankKeepFractionOnFlameout: number;
  mobCorrectPoints: number;
  crowdCorrectPoints: number;
  streakBonusPerStep: number;
  deckSurvivedMobBonus: number;
  helpsPerGame: Record<Help, number>;
  askSpeakerBonus: number;
  momentumFastK: number;
  momentumWindowMinMs: number;
  momentumWindowMaxMs: number;
  /** With no student devices, what a right answer adds to the Prize Pot, and what it adds when the Class Majority was wrong. */
  noDevicesPot: number;
  noDevicesBeatClassPot: number;
  /** Questions in a row most of The Class must get right to earn a Rescue; 0 turns Rescues off. */
  rescueStreak: number;
  /** How long The Class has to vote in a Rescue. */
  rescueSeconds: number;
  /** Who picks each Champion: the spotlight, at random, or the teacher. */
  championPick: 'spotlight' | 'teacher';
  /** The spotlight passes over students who have been Champion, until everyone has. */
  championsOnce: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  timerSeconds: 20,
  strikes: 2,
  questionsPerGame: 12,
  momentumEnabled: false,
  momentumThreshold: 4,
  shuffleQuestions: false,
  survivalDrip: 10,
  bankPerElimination: 20,
  jackpotMultiplier: 1.5,
  bankKeepFractionOnFlameout: 0,
  mobCorrectPoints: 10,
  crowdCorrectPoints: 5,
  streakBonusPerStep: 2,
  deckSurvivedMobBonus: 15,
  helpsPerGame: { poll: 1, ask: 1, trust: 1 },
  askSpeakerBonus: 5,
  momentumFastK: 1.25,
  momentumWindowMinMs: 8_000,
  momentumWindowMaxMs: 20_000,
  noDevicesPot: 100,
  noDevicesBeatClassPot: 200,
  rescueStreak: 3,
  rescueSeconds: 15,
  championPick: 'spotlight',
  championsOnce: true,
};

export type Phase =
  /** Students are joining. */
  | 'LOBBY'
  /** A game has started (or a question finished) and the next question is not open yet. */
  | 'BETWEEN'
  /** Everybody but The One answers on their own device. */
  | 'PHASE_A'
  /** The class has answered; the teacher is about to show the question to The One. */
  | 'PHASE_A_LOCKED'
  /** The One sees the question and may use a lifeline. */
  | 'PHASE_B'
  /** The One has locked a final answer; the teacher reveals it. */
  | 'ONE_LOCKED'
  /** The answer is on the board with points and role changes. */
  | 'REVEAL'
  /** Between questions: The Class votes to bring one of the Comeback Crew back. */
  | 'RESCUE'
  /** A game finished; standings are up and the teacher picks the next One. */
  | 'LEADERBOARD'
  | 'ENDED';

export type EndReason = 'flameout' | 'deck_survived' | 'mob_emptied';

export type Answer = { playerId: string; choice: number; ms: number };

export type HelpResult =
  | { type: 'poll'; choice: number; count: number; total: number }
  | {
      type: 'ask';
      speakers: { playerId: string; nickname: string; choice: number }[];
      bonusEach: number;
    }
  | { type: 'trust'; choice: number; counts: number[] }
  /** Poll the Class with no student devices: the Class Majority. */
  | { type: 'majority'; choice: number };

export type Attempt = {
  id: string;
  /** 1-based number of this question within the game. */
  index: number;
  question: Question;
  startedAt: number;
  /** Absolute time the class's answers lock; null while paused. */
  deadline: number | null;
  /** Remaining ms while paused in Phase A. */
  pausedRemainingMs: number | null;
  /** When the current pause began, so paused time doesn't count against anyone's speed. */
  pausedAt: number | null;
  eligible: string[];
  answers: Answer[];
  phaseBStartedAt: number | null;
  oneAnswer: number | null;
  oneMs: number | null;
  helpUsed: Help | null;
  helpResult: HelpResult | null;
  /** No student devices only: false while the Champion looks away and before the class sees the question. */
  classShown?: boolean;
  /** No student devices only: the Class Majority the teacher tapped, or null when they skipped it. */
  classMajority?: number | null;
};

export type ScoreDelta = { playerId: string; points: number; reason: string };

export type RevealResult = {
  correct: number;
  oneAnswer: number;
  oneCorrect: boolean;
  counts: number[];
  demoted: string[];
  deltas: ScoreDelta[];
  bankDelta: number;
  momentumCredited: boolean;
  momentumFilled: boolean;
  /** No student devices only. */
  classMajority?: number | null;
  /** Whether most of The Class got it right, and whether that earned a Rescue. */
  classRight?: boolean;
  rescueEarned?: boolean;
};

/** A Rescue vote: each of The Class picks one of the Comeback Crew to bring back. */
export type Rescue = {
  /** The Comeback Crew when the vote opened. */
  candidates: string[];
  /** Voter id → candidate id. */
  votes: Record<string, string>;
  /** When voting closes; null once it has. */
  deadline: number | null;
  /** Who came back, once the vote is settled. */
  rescuedId: string | null;
};

export type GameResult = {
  reason: EndReason;
  payouts: { playerId: string; points: number }[];
  bank: number;
  bankedByOne: number;
};

export type Game = {
  ordinal: number;
  oneId: string;
  /** Positions in the session deck this game uses. */
  deck: number[];
  offset: number;
  strikes: number;
  bank: number;
  helpsUsed: Record<Help, boolean>;
  momentum: { progress: number; awardedOnce: boolean };
  /** Questions in a row most of The Class got right, and Rescues earned but not yet used. Absent in older saves. */
  classStreak?: number;
  rescuesEarned?: number;
  rescue?: Rescue | null;
  active: Attempt | null;
  reveal: RevealResult | null;
  result: GameResult | null;
};

export type Session = {
  /** Absent in games saved before Peril! existed. */
  mode?: 'champion';
  version: 1;
  code: string;
  createdAt: number;
  setTitle: string;
  /** Played with no student devices: the teacher enters every choice, and nobody joins. */
  noDevices?: boolean;
  questions: Question[];
  /** Order the deck is played in (indexes into `questions`). */
  order: number[];
  /** Next unplayed position in `order`; wraps around when the deck runs out. */
  deckPos: number;
  settings: Settings;
  players: Player[];
  phase: Phase;
  /** When PAUSED, the phase to go back to. */
  paused: boolean;
  game: Game | null;
  pendingNextOneId: string | null;
  /** Game results so far, newest last. */
  history: { ordinal: number; oneId: string; reason: EndReason; bankedByOne: number }[];
  /** Bumped on every change, so viewers can ignore stale messages. */
  seq: number;
};
