import { describe, expect, test } from 'bun:test';
import { CLASS_ID, createSession, Engine, nicknameProblem } from './engine';
import { buildView } from './views';
import type { Question, Settings } from './types';

const questions: Question[] = Array.from({ length: 5 }, (_, i) => ({
  id: `q${i}`,
  prompt: `Question ${i}`,
  choices: ['A', 'B', 'C'],
  correct: 1,
}));

function setup(names = ['Ana', 'Ben', 'Cy', 'Dee']) {
  let now = 1_000_000;
  let seed = 1;
  const clock = {
    now: () => now,
    random: () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    },
  };
  const engine = new Engine(createSession({ code: 'ABC234', setTitle: 'Test', questions, clock }), clock);
  const ids = names.map((nickname) => {
    const joined = engine.join({ nickname });
    if (!joined.ok) throw new Error(joined.message);
    return joined.player.id;
  });
  return { engine, ids, advance: (ms: number) => (now += ms) };
}

function answerAll(engine: Engine, choices: Record<string, number>) {
  const active = engine.session.game!.active!;
  for (const [id, choice] of Object.entries(choices)) expect(engine.answer(id, active.id, choice).ok).toBe(true);
}

describe('Class Gauntlet engine', () => {
  test('One right: wrong Mob members join the Comeback Crew and fund the bank', () => {
    const { engine, ids } = setup();
    const [one, ben, cy, dee] = ids;
    expect(engine.startGame(one).ok).toBe(true);
    expect(engine.openQuestion().ok).toBe(true);
    expect(engine.session.phase).toBe('PHASE_A');
    answerAll(engine, { [ben]: 1, [cy]: 0, [dee]: 2 });
    expect(engine.session.phase).toBe('PHASE_A_LOCKED');
    expect(engine.showToOne().ok).toBe(true);
    const attempt = engine.session.game!.active!.id;
    expect(engine.oneAnswer(one, attempt, 1).ok).toBe(true);
    expect(engine.reveal().ok).toBe(true);
    const p = (id: string) => engine.player(id)!;
    expect(p(cy).role).toBe('crowd');
    expect(p(dee).role).toBe('crowd');
    expect(p(ben).role).toBe('mob');
    expect(p(ben).points).toBe(12); // 10 + streak bonus 2
    expect(engine.session.game!.bank).toBe(40);
    expect(p(one).points).toBe(10); // survival drip
    expect(engine.session.game!.result).toBeNull();
  });

  test('Mob emptied pays The One a jackpot', () => {
    const { engine, ids } = setup(['Ana', 'Ben']);
    const [one, ben] = ids;
    engine.startGame(one);
    engine.openQuestion();
    answerAll(engine, { [ben]: 0 });
    engine.showToOne();
    engine.oneAnswer(one, engine.session.game!.active!.id, 1);
    engine.reveal();
    const result = engine.session.game!.result!;
    expect(result.reason).toBe('mob_emptied');
    expect(result.bankedByOne).toBe(30); // 20 × 1.5
    expect(engine.next().ok).toBe(true);
    expect(engine.session.phase).toBe('LEADERBOARD');
    // The spotlight picks the next champion, so nobody is lined up.
    expect(engine.session.pendingNextOneId).toBeNull();
  });

  test('Flameout splits the bank among the surviving Mob', () => {
    const { engine, ids } = setup();
    const [one, ben, cy, dee] = ids;
    engine.startGame(one);
    // Q1: One right, Dee knocked out → bank 20.
    engine.openQuestion();
    answerAll(engine, { [ben]: 1, [cy]: 1, [dee]: 0 });
    engine.showToOne();
    engine.oneAnswer(one, engine.session.game!.active!.id, 1);
    engine.reveal();
    // Q2 and Q3: One wrong twice → flameout.
    for (let i = 0; i < 2; i++) {
      engine.next();
      answerAll(engine, { [ben]: 1, [cy]: 1, [dee]: 1 });
      engine.showToOne();
      engine.oneAnswer(one, engine.session.game!.active!.id, 0);
      engine.reveal();
    }
    const result = engine.session.game!.result!;
    expect(result.reason).toBe('flameout');
    expect(result.payouts).toEqual([
      { playerId: ben, points: 10 },
      { playerId: cy, points: 10 },
    ]);
  });

  test('Lifelines: poll counts, ask picks one right and one wrong, trust locks the plurality', () => {
    const { engine, ids } = setup();
    const [one, ben, cy, dee] = ids;
    engine.startGame(one);
    engine.openQuestion();
    answerAll(engine, { [ben]: 1, [cy]: 0, [dee]: 0 });
    engine.showToOne();
    expect(engine.helpPoll(one, 0).ok).toBe(true);
    expect(engine.session.game!.active!.helpResult).toEqual({ type: 'poll', choice: 0, count: 2, total: 3 });
    expect(engine.helpAsk(one).ok).toBe(false); // one lifeline per question
    engine.oneAnswer(one, engine.session.game!.active!.id, 1);
    engine.reveal();
    engine.next();
    answerAll(engine, { [ben]: 1, [cy]: 0, [dee]: 2 });
    engine.showToOne();
    expect(engine.helpAsk(one).ok).toBe(true);
    const ask = engine.session.game!.active!.helpResult;
    if (ask?.type !== 'ask') throw new Error('expected ask');
    expect(ask.speakers.map((s) => s.choice === 1).sort()).toEqual([false, true]);
    engine.oneAnswer(one, engine.session.game!.active!.id, 1);
    engine.reveal();
    engine.next();
    answerAll(engine, { [ben]: 2 });
    expect(engine.lock().ok).toBe(true);
    engine.showToOne();
    expect(engine.helpTrust(one).ok).toBe(true);
    expect(engine.session.phase).toBe('ONE_LOCKED');
    expect(engine.session.game!.active!.oneAnswer).toBe(2);
  });

  test('Timer locks Phase A, and pausing stops the clock', () => {
    const { engine, ids, advance } = setup();
    engine.startGame(ids[0]);
    engine.openQuestion();
    advance(5_000);
    engine.pause();
    advance(60_000);
    expect(engine.tick()).toBe(false);
    engine.resume();
    advance(14_000);
    expect(engine.tick()).toBe(false);
    advance(1_100);
    expect(engine.tick()).toBe(true);
    expect(engine.session.phase).toBe('PHASE_A_LOCKED');
  });

  test('Views hide the question from The One and the projector during Phase A, and the answer until reveal', () => {
    const { engine, ids } = setup();
    const [one, ben] = ids;
    engine.startGame(one);
    engine.openQuestion();
    const opts = { now: Date.now(), pauseReason: null };
    expect(buildView(engine.session, opts).question!.prompt).toBeNull();
    expect(buildView(engine.session, { ...opts, viewerId: one }).question!.prompt).toBeNull();
    const benView = buildView(engine.session, { ...opts, viewerId: ben });
    expect(benView.question!.prompt).toBe('Question 0');
    expect(JSON.stringify(benView)).not.toContain('"correct"');
  });

  test('Rejoining with the secret restores the seat; late joiners are Comeback Crew', () => {
    const { engine, ids } = setup();
    engine.startGame(ids[0]);
    const ben = engine.player(ids[1])!;
    engine.setConnected(ben.id, false);
    expect(engine.join({ playerId: ben.id, secret: 'nope', nickname: 'Ben' }).ok).toBe(false);
    const back = engine.join({ playerId: ben.id, secret: ben.secret, nickname: 'Ben' });
    expect(back.ok && back.rejoined).toBe(true);
    const late = engine.join({ nickname: 'Eve' });
    expect(late.ok && late.player.role).toBe('crowd');
  });

  test('One disconnecting during the Spotlight Round pauses the game until they return', () => {
    const { engine, ids } = setup();
    const [one, ben, cy, dee] = ids;
    engine.startGame(one);
    engine.openQuestion();
    answerAll(engine, { [ben]: 1, [cy]: 1, [dee]: 1 });
    engine.showToOne();
    engine.setConnected(one, false);
    expect(engine.session.paused).toBe(true);
    engine.setConnected(one, true);
    expect(engine.session.paused).toBe(false);
  });

  test('Skip discards the question: nobody is knocked out or scored, and the next question opens', () => {
    const { engine, ids } = setup();
    const [one, ben, cy, dee] = ids;
    engine.startGame(one);
    engine.openQuestion();
    answerAll(engine, { [ben]: 1 });
    expect(engine.skip().ok).toBe(true);
    expect(engine.session.phase).toBe('PHASE_A');
    expect(engine.session.game!.active!.index).toBe(2);
    expect(engine.session.game!.offset).toBe(1);
    expect(engine.session.game!.active!.answers).toEqual([]);
    expect(engine.showToOne().ok).toBe(false);
    for (const id of [ben, cy, dee]) expect(engine.player(id)).toMatchObject({ role: 'mob', points: 0, streak: 0 });
    expect(engine.player(one)!.points).toBe(0);
    expect(engine.session.game).toMatchObject({ bank: 0, strikes: 2, result: null });
  });

  test('Skipping the last question ends the round with The One banking the pot', () => {
    const { engine, ids } = setup(['Ana', 'Ben', 'Cy']);
    const [one, ben, cy] = ids;
    engine.updateSettings({ rescueStreak: 0 });
    engine.startGame(one);
    engine.openQuestion();
    answerAll(engine, { [ben]: 1, [cy]: 0 });
    engine.showToOne();
    engine.oneAnswer(one, engine.session.game!.active!.id, 1);
    engine.reveal();
    while (engine.session.game!.offset < engine.session.game!.deck.length - 1) {
      engine.next();
      answerAll(engine, { [ben]: 1, [cy]: 1 });
      engine.showToOne();
      engine.oneAnswer(one, engine.session.game!.active!.id, 1);
      engine.reveal();
    }
    const before = { one: engine.player(one)!.points, ben: engine.player(ben)!.points, cy: engine.player(cy)!.points };
    const bank = engine.session.game!.bank;
    expect(bank).toBeGreaterThan(0);
    engine.next();
    expect(engine.skip().ok).toBe(true);
    expect(engine.session.phase).toBe('LEADERBOARD');
    expect(engine.session.game!.result).toMatchObject({ reason: 'deck_survived', bank, bankedByOne: bank });
    expect(engine.player(one)!.points).toBe(before.one + bank);
    expect(engine.player(ben)!.points).toBe(before.ben + 15); // surviving Mob bonus
    expect(engine.player(cy)!.points).toBe(before.cy);
    expect(engine.session.history.at(-1)).toMatchObject({ reason: 'deck_survived', bankedByOne: bank });
  });

  test('Skip only works while the class is answering', () => {
    const { engine, ids } = setup();
    const [one, ben, cy, dee] = ids;
    engine.startGame(one);
    expect(engine.skip().ok).toBe(false);
    engine.openQuestion();
    answerAll(engine, { [ben]: 1, [cy]: 1, [dee]: 1 });
    expect(engine.skip().ok).toBe(false);
  });

  test('Nickname rules', () => {
    expect(nicknameProblem('', [])).not.toBeNull();
    expect(nicknameProblem('Ana', ['ana'])).toContain('Ana 2');
    expect(nicknameProblem('stupid head', [])).not.toBeNull();
    expect(nicknameProblem('Ana', [])).toBeNull();
  });
});

describe('Class Streak and Rescue', () => {
  const seven = ['Ana', 'Ben', 'Cy', 'Dee', 'Eve', 'Fay', 'Gus'];

  /** One question: the class answers as given, the champion answers right, and the answer is revealed. */
  function play(engine: Engine, one: string, choices: Record<string, number>) {
    expect(engine.next().ok).toBe(true);
    answerAll(engine, choices);
    if (engine.session.phase === 'PHASE_A') expect(engine.lock().ok).toBe(true);
    expect(engine.showToOne().ok).toBe(true);
    expect(engine.oneAnswer(one, engine.session.game!.active!.id, 1).ok).toBe(true);
    expect(engine.reveal().ok).toBe(true);
  }

  function started(names = seven) {
    const made = setup(names);
    expect(engine(made).startGame(made.ids[0]).ok).toBe(true);
    return made;
  }
  const engine = (made: ReturnType<typeof setup>) => made.engine;

  test('three right in a row for most of the class earns a Rescue; the class votes one of the Comeback Crew back', () => {
    const { engine, ids } = started();
    const [one, ben, cy, dee, eve, fay, gus] = ids;
    play(engine, one, { [ben]: 1, [cy]: 1, [dee]: 1, [eve]: 1, [fay]: 0, [gus]: 2 });
    expect(engine.player(fay)!.role).toBe('crowd');
    expect(engine.session.game!.classStreak).toBe(1);
    play(engine, one, { [ben]: 1, [cy]: 1, [dee]: 1, [eve]: 1 });
    play(engine, one, { [ben]: 1, [cy]: 1, [dee]: 1, [eve]: 0 });
    expect(engine.session.game!.reveal).toMatchObject({ classRight: true, rescueEarned: true });
    expect(buildView(engine.session, { now: 0, pauseReason: null }).question?.reveal?.rescueEarned).toBe(true);

    expect(engine.next().ok).toBe(true);
    expect(engine.session.phase).toBe('RESCUE');
    expect(engine.session.game!.rescue!.candidates.sort()).toEqual([eve, fay, gus].sort());
    expect(engine.rescueVote(fay, gus).ok).toBe(false); // the Comeback Crew doesn't vote
    expect(engine.rescueVote(ben, one).ok).toBe(false); // only the Comeback Crew can come back
    // The Class is Ben, Cy and Dee now (Eve missed the last one).
    expect(engine.rescueVote(ben, gus).ok).toBe(true);
    expect(engine.rescueVote(ben, fay).ok).toBe(true); // a vote can be changed
    expect(engine.rescueVote(cy, fay).ok).toBe(true);
    expect(engine.next().ok).toBe(false); // still voting
    const view = buildView(engine.session, { now: 0, pauseReason: null, viewerId: ben });
    expect(view.self?.rescueVote).toBe(fay);
    expect(view.rescue).toMatchObject({ voted: 2, voters: 3, settled: false, rescued: null });
    expect(view.rescue?.candidates.find((c) => c.id === fay)?.votes).toBe(2);

    // The last of The Class votes, and the vote closes itself.
    expect(engine.rescueVote(dee, gus).ok).toBe(true);
    expect(engine.session.game!.rescue!.rescuedId).toBe(fay);
    expect(engine.player(fay)!.role).toBe('mob');
    expect(engine.next().ok).toBe(true);
    expect(engine.session.phase).toBe('PHASE_A');
    expect(engine.session.game!.active!.eligible).toContain(fay);
    expect(engine.session.game!.rescuesEarned).toBe(0);
  });

  test('the vote closes once all of The Class has voted, and the streak keeps counting after a Rescue', () => {
    const { engine, ids } = started(['Ana', 'Ben', 'Cy', 'Dee', 'Eve']);
    const [one, ben, cy, dee, eve] = ids;
    play(engine, one, { [ben]: 1, [cy]: 1, [dee]: 1, [eve]: 0 });
    play(engine, one, { [ben]: 1, [cy]: 1, [dee]: 1 });
    play(engine, one, { [ben]: 1, [cy]: 1, [dee]: 1 });
    expect(engine.next().ok).toBe(true);
    for (const voter of [ben, cy, dee]) expect(engine.rescueVote(voter, eve).ok).toBe(true);
    expect(engine.session.game!.rescue!.rescuedId).toBe(eve);

    play(engine, one, { [ben]: 1, [cy]: 1, [dee]: 1, [eve]: 0 });
    expect(engine.session.game!.classStreak).toBe(4);
  });

  test('a missed question resets the streak; a Rescue earned with nobody to bring back is saved', () => {
    const { engine, ids, advance } = started(['Ana', 'Ben', 'Cy', 'Dee']);
    const [one, ben, cy, dee] = ids;
    play(engine, one, { [ben]: 1, [cy]: 0, [dee]: 0 });
    expect(engine.session.game!.classStreak).toBe(0);
    expect(engine.player(cy)!.role).toBe('crowd');
    // Cy and Dee are in the Comeback Crew; Ben alone is The Class now.
    for (let i = 0; i < 3; i++) play(engine, one, { [ben]: 1 });
    expect(engine.session.game!.rescuesEarned).toBe(1);
    expect(engine.next().ok).toBe(true);
    expect(engine.session.phase).toBe('RESCUE');
    advance(16_000);
    expect(engine.tick()).toBe(true);
    expect([cy, dee]).toContain(engine.session.game!.rescue!.rescuedId!);

    const fresh = started(['Ana', 'Ben', 'Cy']);
    const [a, b, c] = fresh.ids;
    for (let i = 0; i < 3; i++) play(fresh.engine, a, { [b]: 1, [c]: 1 });
    // Nobody to bring back: the game goes on, and the Rescue waits.
    expect(fresh.engine.next().ok).toBe(true);
    expect(fresh.engine.session.phase).toBe('PHASE_A');
    expect(fresh.engine.session.game!.rescuesEarned).toBe(1);
  });

  test('the teacher can pass on a Rescue, and Rescues can be turned off', () => {
    const { engine, ids } = started(['Ana', 'Ben', 'Cy', 'Dee']);
    const [one, ben, cy, dee] = ids;
    play(engine, one, { [ben]: 1, [cy]: 1, [dee]: 0 });
    play(engine, one, { [ben]: 1, [cy]: 1 });
    play(engine, one, { [ben]: 1, [cy]: 1 });
    expect(engine.next().ok).toBe(true);
    expect(engine.skipRescue().ok).toBe(true);
    expect(engine.session.phase).toBe('PHASE_A');
    expect(engine.player(dee)!.role).toBe('crowd');

    const off = setup(['Ana', 'Ben', 'Cy']);
    expect(off.engine.updateSettings({ rescueStreak: 0 }).ok).toBe(true);
    expect(off.engine.startGame(off.ids[0]).ok).toBe(true);
    play(off.engine, off.ids[0], { [off.ids[1]]: 1, [off.ids[2]]: 1 });
    expect(off.engine.session.game!.classStreak).toBe(0);
    expect(buildView(off.engine.session, { now: 0, pauseReason: null }).game?.classStreak).toBeNull();
  });
});

describe('Picking the champion', () => {
  test('the spotlight passes over past champions until everyone has been one, unless the rules say otherwise', () => {
    const { engine, ids } = setup(['Ana', 'Ben', 'Cy']);
    const champions: string[] = [];
    for (let round = 0; round < 3; round++) {
      expect(engine.startGame().ok).toBe(true);
      champions.push(engine.session.game!.oneId);
      expect(engine.endGame().ok).toBe(true);
      expect(engine.session.pendingNextOneId).toBeNull();
    }
    expect(champions.sort()).toEqual([...ids].sort());

    const again = setup(['Ana', 'Ben']);
    expect(again.engine.updateSettings({ championsOnce: false }).ok).toBe(true);
    const picks = new Set<string>();
    for (let round = 0; round < 12; round++) {
      expect(again.engine.startGame().ok).toBe(true);
      picks.add(again.engine.session.game!.oneId);
      again.engine.endGame();
    }
    expect(picks.size).toBe(2);
    expect(again.engine.player(again.ids[0])!.hasBeenOne && again.engine.player(again.ids[1])!.hasBeenOne).toBe(true);
  });

  test('when the teacher picks, a round won’t start until they do, and the next champion is suggested', () => {
    const { engine, ids } = setup(['Ana', 'Ben', 'Cy']);
    expect(engine.updateSettings({ championPick: 'teacher' }).ok).toBe(true);
    expect(engine.startGame()).toEqual({ ok: false, message: 'Pick a student to be the champion.' });
    expect(engine.chooseNextOne(ids[1]).ok).toBe(true);
    expect(engine.startGame().ok).toBe(true);
    expect(engine.session.game!.oneId).toBe(ids[1]);
    engine.endGame();
    expect(engine.session.pendingNextOneId).not.toBeNull();
    expect(engine.session.pendingNextOneId).not.toBe(ids[1]);
  });
});

describe('Champion with no student devices', () => {
  function noDevices(settings: Partial<Settings> = {}) {
    let now = 1_000_000;
    const clock = { now: () => now, random: () => 0.5 };
    const engine = new Engine(
      createSession({ code: 'ABC234', setTitle: 'Test', questions, settings: { questionsPerGame: 3, strikes: 2, ...settings }, noDevices: true, clock }),
      clock,
    );
    const ok = (result: { ok: boolean; message?: string }) => expect(result).toEqual({ ok: true });
    /** Plays one question: the champion looks away, the class votes, the champion answers. */
    const play = (classMajority: number | null, oneChoice: number) => {
      ok(engine.next());
      expect(buildView(engine.session, { now, pauseReason: null }).question?.prompt).toBeNull();
      ok(engine.showToClass());
      ok(classMajority === null ? engine.lock() : engine.classAnswer(classMajority));
      expect(engine.session.phase).toBe('PHASE_A_LOCKED');
      expect(buildView(engine.session, { now, pauseReason: null }).question?.prompt).toBeNull();
      ok(engine.showToOne());
      ok(engine.answerForOne(oneChoice));
      ok(engine.reveal());
    };
    return { engine, ok, play, advance: (ms: number) => (now += ms) };
  }

  test('a named champion plays the Class Majority: the pot grows more when the class was wrong', () => {
    const { engine, ok, play } = noDevices();
    ok(engine.startNamedRound('Ana'));
    expect(engine.session.players.map((p) => p.nickname)).toEqual(['The Class', 'Ana']);
    play(1, 1);
    expect(engine.session.game!.bank).toBe(100);
    play(0, 1);
    expect(engine.session.game!.bank).toBe(300);
    expect(engine.session.game!.reveal!.classMajority).toBe(0);
    play(null, 1);
    // Every question cleared: Ana banks the pot.
    expect(engine.session.game!.result).toMatchObject({ reason: 'deck_survived', bankedByOne: 400 });
    expect(engine.player(CLASS_ID)!.points).toBe(0);
    expect(engine.session.players.find((p) => p.nickname === 'Ana')!.points).toBe(400);
  });

  test('out of chances, The Class wins the pot; the next champion is named, and a name that returns keeps its points', () => {
    const { engine, ok, play } = noDevices();
    ok(engine.startNamedRound('Ana'));
    play(0, 1);
    play(1, 0);
    play(1, 2);
    expect(engine.session.game!.result).toMatchObject({ reason: 'flameout' });
    expect(engine.player(CLASS_ID)!.points).toBe(200);
    ok(engine.next());
    expect(engine.session.phase).toBe('LEADERBOARD');
    expect(engine.session.pendingNextOneId).toBeNull();
    ok(engine.startNamedRound('Ben'));
    expect(engine.session.players).toHaveLength(3);
    ok(engine.endGame());
    ok(engine.startNamedRound('ana'));
    expect(engine.session.players).toHaveLength(3);
    expect(engine.startNamedRound('  ').ok).toBe(false);
  });

  test('Skip discards the question: no chance lost, no pot, and the champion never sees it', () => {
    const { engine, ok } = noDevices();
    ok(engine.startNamedRound('Ana'));
    ok(engine.openQuestion());
    ok(engine.showToClass());
    ok(engine.skip());
    expect(engine.session.phase).toBe('PHASE_A');
    expect(engine.session.game).toMatchObject({ offset: 1, bank: 0, strikes: 2 });
    expect(engine.session.game!.active!.classShown).toBe(false);
    ok(engine.showToClass());
    ok(engine.classAnswer(0));
    ok(engine.showToOne());
    ok(engine.answerForOne(1));
    ok(engine.reveal());
    expect(engine.session.game!.bank).toBe(200);
    ok(engine.next());
    ok(engine.skip());
    // The last question skipped: Ana banks the pot and The Class gets nothing.
    expect(engine.session.phase).toBe('LEADERBOARD');
    expect(engine.session.game!.result).toMatchObject({ reason: 'deck_survived', bankedByOne: 200 });
    expect(engine.player(CLASS_ID)!.points).toBe(0);
    expect(engine.session.players.find((p) => p.nickname === 'Ana')!.points).toBe(200);
  });

  test('the timer is only a guide, and the class only votes once it has seen the question', () => {
    const { engine, ok, advance } = noDevices();
    ok(engine.startNamedRound('Ana'));
    ok(engine.openQuestion());
    expect(engine.session.game!.active!.deadline).toBeNull();
    expect(engine.classAnswer(1).ok).toBe(false);
    ok(engine.showToClass());
    advance(60_000);
    expect(engine.tick()).toBe(false);
    expect(engine.session.phase).toBe('PHASE_A');
  });

  test('lifelines: Poll shows the Class Majority, Go with the Class locks it in, Ask Two only marks itself used', () => {
    const { engine, ok } = noDevices();
    ok(engine.startNamedRound('Ana'));
    const one = engine.session.game!.oneId;
    const toChampion = (majority: number | null) => {
      ok(engine.showToClass());
      ok(majority === null ? engine.lock() : engine.classAnswer(majority));
      ok(engine.showToOne());
    };
    ok(engine.openQuestion());
    toChampion(2);
    ok(engine.helpPoll(one, 0));
    expect(engine.session.game!.active!.helpResult).toEqual({ type: 'majority', choice: 2 });
    ok(engine.answerForOne(1));
    ok(engine.reveal());
    ok(engine.next());
    toChampion(null);
    expect(engine.helpTrust(one).ok).toBe(false);
    ok(engine.helpAsk(one));
    expect(engine.session.game!.active!.helpResult).toEqual({ type: 'ask', speakers: [], bonusEach: 0 });
    expect(engine.session.game!.helpsUsed.ask).toBe(true);
    ok(engine.answerForOne(1));
    ok(engine.reveal());
    ok(engine.next());
    toChampion(0);
    ok(engine.helpTrust(one));
    expect(engine.session.game!.active!.oneAnswer).toBe(0);
    expect(engine.session.phase).toBe('ONE_LOCKED');
  });
});
