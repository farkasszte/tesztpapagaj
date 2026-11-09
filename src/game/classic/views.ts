import { answerIsRight, reportOf } from './engine';
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
  /** Áll-e az óra: a távirányító ebből tudja, hogy szünet van. */
  paused: boolean;
  /** Played with no student devices, so there are no answers to count. */
  noDevices: boolean
  /** A futam és a szörny más játék: a telefonon nincs értelme pontot mutatni. */
  theme?: 'race' | 'boss';
  scoring: boolean;
  /** A tanár által választott avatar-készlet: csak ez töltődik a diákoknál. */
  avatarStyle?: string;
  roster: { id: string; nickname: string; connected: boolean; avatar?: string }[];
  question: null | {
    /** A kérdés azonosítója: a szavak (kép, matek) ezzel kereshetők ki. */
    id: string;
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
    /** Every right choice once the answer shows; a Multiple Answer question has several. */
    correctChoices: number[] | null;
    /** Several choices are right, so a student ticks more than one. */
    multi: boolean;
    /** The choices are a sequence to put in order. */
    ordered: boolean;
    /** The question pairs concepts (its prompts) with the choices. */
    matching: boolean;
    /** The concepts to match, in order. */
    prompts: string[] | null;
    /** The right pairing once the answer shows: which choice belongs to each concept. */
    matchAnswers: number[] | null;
    /** The right order once the answer shows: choice indices, in sequence. */
    correctOrder: number[] | null;
    /** The student types the answer instead of tapping a choice. */
    textEntry: boolean;
    /** How many places the student writes in: one for a short answer, one per gap. */
    gaps: number;
    /** The right text of each gap once the answer shows. */
    rightBlanks: string[] | null;
    /** What counts as a right short answer, once it shows. */
    accepted: string[] | null;
    counts: number[] | null;
    explanation: string | null;
  };
  report: ClassicReport | null;
  /** A kör eredménye a felfedés után: az első öt pontszerző, pont szerint.
   *  Csak a tanár nézetében van, és csak ha a beállítás kéri. */
  roundTop: { nickname: string; points: number; avatar?: string }[] | null;
  /** Only in a student's view. */
  me?: {
    id: string;
    nickname: string;
    canAnswer: boolean;
    answer: number | null;
    /** Every choice this student ticked; one for a single-answer question. */
    answers: number[] | null;
    /** What this student typed, when the question asks for words. */
    texts: string[] | null;
    /** Null until the answer shows. */
    right: boolean | null;
    correctSoFar: number;
    asked: number;
    points: number;
  };
};

export function buildClassicView(
  session: ClassicSession,
  options: { now: number; viewerId?: string; theme?: 'race' | 'boss' },
): ClassicView {
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
    paused: !!s.paused,
    noDevices: !!s.noDevices,
    ...(options.theme ? { theme: options.theme } : {}),
    scoring: s.settings.scoring,
    avatarStyle: s.settings.avatarStyle,
    // A távirányító nem kerül a táblára: nem játékos, csak a tanár keze.
    roster: s.players
      .filter((p) => !p.remote)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        connected: p.connected,
        ...(p.avatar ? { avatar: p.avatar } : {}),
      })),
    question:
      shown && question
        ? {
            id: question.id,
            number: s.index + 1,
            total: s.questions.length,
            prompt: question.prompt,
            choices: question.choices,
            rich: richShown(question, true, !!revealed),
            answered: answers.length,
            answering: s.players.filter(
              (p) => !p.remote && (p.connected || answers.some((a) => a.playerId === p.id)),
            ).length,
            remainingMs: s.phase === 'QUESTION' && s.deadline !== null ? Math.max(0, s.deadline - options.now) : null,
            // Sorrendnél és párosításnál nincs egyetlen helyes válasz: a válasz
            // maga a sorrend, illetve a párok. Ilyenkor nem adunk betűt, mert a
            // diák „A helyes válasz: C" szöveget kapna egy sorrendre.
            correct: revealed && !question.correctOrder && !question.matches ? question.correct : null,
            // Csak a kártyás kérdésnek van „ helyes válasza": sorrendnél a sorrend,
            // párosításnál a párok a válasz, ott egyik kártya sem jelölhető meg.
            correctChoices:
              revealed && !question.correctOrder && !question.matches
                ? (question.correctChoices ?? [question.correct])
                : null,
            multi: !!question.correctChoices,
            ordered: !!question.correctOrder,
            matching: !!question.matches,
            prompts: question.prompts ?? null,
            matchAnswers: revealed ? (question.matches ?? null) : null,
            correctOrder: revealed ? (question.correctOrder ?? null) : null,
            textEntry: !!question.blanks || !!question.accepted,
            gaps: question.blanks ? question.blanks.length : question.accepted ? 1 : 0,
            rightBlanks: revealed ? (question.blanks ?? null) : null,
            accepted: revealed ? (question.accepted ?? null) : null,
            // A megoszlás csak kártyás kérdésnél értelmes; sorrendnél és
            // párosításnál a válasz nem egy kiválasztott elem.
            counts:
              revealed && !question.correctOrder && !question.matches
                ? question.choices.map((_, c) => answers.filter((a) => a.choice === c).length)
                : null,
            explanation: revealed ? question.explanation?.trim() || null : null,
          }
        : null,
    report: null,
    roundTop: null,
  };
  const viewer = options.viewerId ? s.players.find((p) => p.id === options.viewerId) : undefined;
  // A kör eredménye a tanár színpadára megy, a diák a sajátját látja: a telefon
  // nem kaphat listát az egész osztály pontjairól.
  // A távirányító nem versenyző: a kör eredményében sem szerepel.
  const competitors = s.players.filter((p) => !p.remote)
  if (!viewer && revealed && s.settings.roundResults && competitors.length > 0) {
    view.roundTop = [...competitors]
      .sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname))
      .slice(0, 5)
      .map((player) => ({
        nickname: player.nickname,
        points: player.points,
        ...(player.avatar ? { avatar: player.avatar } : {}),
      }));
  }
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
    answer: shown && mine && mine.choice >= 0 ? mine.choice : null,
    answers:
      shown && mine && mine.choice >= 0 ? (mine.choices ?? [mine.choice]) : null,
    texts: shown ? (mine?.texts ?? null) : null,
    right: revealed && mine ? answerIsRight(question, mine.choices ?? [mine.choice], mine.texts ?? []) : null,
    // Minden típus a maga szabálya szerint számít: a több helyes válasz, a
    // sorrend, a párosítás és a beírt szöveg is.
    correctSoFar: results.filter(
      ({ answer, question: q }) =>
        !!answer && answerIsRight(q, answer.choices ?? [answer.choice], answer.texts ?? []),
    ).length,
    asked: results.length,
    points: viewer.points,
  };
  return view;
}
