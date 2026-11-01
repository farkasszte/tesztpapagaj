import { describe, expect, test } from 'bun:test';
import type { Column } from './types';
import type { Question } from '../types';
import { createPerilSession, PerilEngine } from './engine';
import type { PerilSettings } from './types';

const question = (id: string, correct = 1): Question => ({
  id,
  prompt: `Question ${id}`,
  choices: ['A', 'B', 'C'],
  correct,
});

/** Two Columns of two Tiles: a1 (100) a2 (200) | b1 (100) b2 (200). The right answer is always choice 1. */
function board(trove?: string): Column[] {
  return ['a', 'b'].map((c) => ({
    title: c.toUpperCase(),
    tiles: [1, 2].map((row) => ({
      value: row * 100,
      question: question(`${c}${row}`),
      treasureTrove: `${c}${row}` === trove,
    })),
  }));
}

function setup(names: string[], settings: Partial<PerilSettings> = {}) {
  let now = 1_000_000;
  let seed = 3;
  const clock = {
    now: () => now,
    random: () => (seed = (seed * 16807) % 2147483647) / 2147483647,
  };
  const engine = new PerilEngine(createPerilSession({ code: '123456', settings, clock }), clock);
  const ids = names.map((nickname) => {
    const joined = engine.join({ nickname });
    if (!joined.ok) throw new Error(joined.message);
    return joined.player.id;
  });
  const ok = (result: { ok: boolean; message?: string }) => expect(result).toEqual({ ok: true });
  return { engine, ids, ok, advance: (ms: number) => (now += ms) };
}

describe('Peril! Solo', () => {
  test('the player in Control picks a Tile; the first Buzz answers, and a right answer scores and takes Control', () => {
    const { engine, ids, ok } = setup(['Ana', 'Ben']);
    const [ana, ben] = ids;
    ok(engine.startBoard(board()));
    expect(engine.session.phase).toBe('BOARD');
    const control = engine.session.control!;
    const other = control === ana ? ben : ana;

    expect(engine.pickTile(0, 1, other).ok).toBe(false);
    ok(engine.pickTile(0, 1, control));
    expect(engine.session.phase).toBe('READING');
    expect(engine.buzz(other).ok).toBe(false); // buzzers aren't armed yet

    ok(engine.armBuzzers());
    ok(engine.buzz(other));
    expect(engine.buzz(control).ok).toBe(false); // too late
    expect(engine.session.phase).toBe('ANSWERING');
    ok(engine.answer(other, 1));
    expect(engine.session.phase).toBe('REVEAL');
    expect(engine.player(other)!.points).toBe(200);
    expect(engine.session.control).toBe(other);

    ok(engine.next());
    expect(engine.session.phase).toBe('BOARD');
    expect(engine.pickTile(0, 1).ok).toBe(false); // already played
  });

  test('a wrong answer loses the value and re-arms buzzers for everyone who hasn’t tried; when nobody is left, the answer shows', () => {
    const { engine, ids, ok } = setup(['Ana', 'Ben']);
    const [ana, ben] = ids;
    ok(engine.startBoard(board()));
    const control = engine.session.control!;
    ok(engine.pickTile(1, 0, control));
    ok(engine.armBuzzers());
    ok(engine.buzz(ana));
    ok(engine.answer(ana, 0));
    expect(engine.player(ana)!.points).toBe(-100);
    expect(engine.session.phase).toBe('BUZZING');
    expect(engine.buzz(ana).ok).toBe(false);
    ok(engine.buzz(ben));
    ok(engine.answer(ben, 2));
    expect(engine.player(ben)!.points).toBe(-100);
    expect(engine.session.phase).toBe('REVEAL');
    expect(engine.session.open!.result).toMatchObject({ correct: false });
    expect(engine.session.control).toBe(control);
  });

  test('without the penalty setting a wrong answer costs nothing', () => {
    const { engine, ids, ok } = setup(['Ana', 'Ben'], { wrongAnswerPenalty: false });
    ok(engine.startBoard(board()));
    ok(engine.pickTile(0, 0));
    ok(engine.armBuzzers());
    ok(engine.buzz(ids[0]));
    ok(engine.answer(ids[0], 0));
    expect(engine.player(ids[0])!.points).toBe(0);
  });

  test('when nobody buzzes in time the answer shows and Control stays; a slow answer counts as wrong', () => {
    const { engine, ids, ok, advance } = setup(['Ana', 'Ben']);
    ok(engine.startBoard(board()));
    const control = engine.session.control!;
    ok(engine.pickTile(0, 0));
    ok(engine.armBuzzers());
    advance(9_999);
    expect(engine.tick()).toBe(false);
    advance(1);
    expect(engine.tick()).toBe(true);
    expect(engine.session.phase).toBe('REVEAL');
    expect(engine.session.open!.result).toEqual({
      contender: null,
      choice: null,
      correct: false,
      points: 0,
    });
    expect(engine.session.control).toBe(control);

    ok(engine.next());
    ok(engine.pickTile(0, 1));
    ok(engine.armBuzzers());
    ok(engine.buzz(ids[1]));
    advance(10_000);
    expect(engine.tick()).toBe(true);
    expect(engine.player(ids[1])!.points).toBe(-200);
    expect(engine.session.phase).toBe('BUZZING'); // Ana may still try
  });

  test('after the last Tile the standings come up, and another board can follow with the same players', () => {
    const { engine, ids, ok } = setup(['Ana']);
    ok(engine.startBoard([{ title: 'Only', tiles: board()[0].tiles.slice(0, 1) }]));
    ok(engine.pickTile(0, 0));
    ok(engine.armBuzzers());
    ok(engine.buzz(ids[0]));
    ok(engine.answer(ids[0], 1));
    ok(engine.next());
    expect(engine.session.phase).toBe('FINAL');
    expect(engine.session.boardsPlayed).toBe(1);
    ok(engine.startBoard(board()));
    expect(engine.session.phase).toBe('BOARD');
    expect(engine.player(ids[0])!.points).toBe(100);
  });
});

describe('Peril! Teams', () => {
  const teams = (assign: 'auto' | 'manual', names = ['Iron Wyverns', 'Gilded Griffins']) => ({
    teams: { names, assign },
  });
  const sizes = (engine: PerilEngine) =>
    engine.session.teams.map(
      (team) => engine.session.players.filter((p) => p.teamId === team.id).length,
    );

  test('auto-assign spreads students evenly as they join, late joiners included', () => {
    const { engine, ok } = setup(['Ana', 'Ben', 'Cy'], teams('auto'));
    expect(engine.session.teams.map((team) => [team.name, team.points])).toEqual([
      ['Iron Wyverns', 0],
      ['Gilded Griffins', 0],
    ]);
    expect(sizes(engine)).toEqual([2, 1]);
    ok(engine.startBoard(board()));
    engine.join({ nickname: 'Dee' });
    expect(sizes(engine)).toEqual([2, 2]);
  });

  test('with auto-assign students don’t switch Teams themselves', () => {
    const { engine, ids } = setup(['Ana'], teams('auto'));
    expect(engine.chooseTeam(ids[0], engine.session.teams[1].id).ok).toBe(false);
  });

  test('with manual assignment students choose; the teacher can move them and shuffle; stragglers are placed at the start', () => {
    const { engine, ids, ok } = setup(['Ana', 'Ben', 'Cy', 'Dee', 'Eve'], teams('manual'));
    expect(sizes(engine)).toEqual([0, 0]);
    const [wyverns, griffins] = engine.session.teams.map((team) => team.id);
    for (const id of ids.slice(0, 3)) ok(engine.chooseTeam(id, wyverns));
    expect(sizes(engine)).toEqual([3, 0]);
    ok(engine.moveToTeam(ids[0], griffins));
    expect(sizes(engine)).toEqual([2, 1]);
    ok(engine.shuffleTeams());
    expect(sizes(engine).sort()).toEqual([2, 3]);

    const { engine: late, ids: lateIds, ok: lateOk } = setup(['Ana', 'Ben', 'Cy'], teams('manual'));
    lateOk(late.chooseTeam(lateIds[0], late.session.teams[0].id));
    lateOk(late.startBoard(board()));
    expect(sizes(late).sort()).toEqual([1, 2]);
    expect(late.chooseTeam(lateIds[0], late.session.teams[1].id).ok).toBe(false); // only in the lobby
  });

  /** Wyverns: Ana, Cy, Eve. Griffins: Ben, Dee. */
  function teamGame() {
    const game = setup(['Ana', 'Ben', 'Cy', 'Dee', 'Eve'], teams('auto'));
    const [wyverns, griffins] = game.engine.session.teams.map((team) => team.id);
    game.ok(game.engine.startBoard(board()));
    game.ok(game.engine.pickTile(0, 1));
    game.ok(game.engine.armBuzzers());
    return { ...game, wyverns, griffins };
  }

  test('any member buzzes for the Team; the most-voted choice is its answer, closing once everyone has voted', () => {
    const { engine, ids, ok, wyverns } = teamGame();
    const [ana, ben, cy, dee, eve] = ids;
    ok(engine.buzz(cy));
    expect(engine.session.open!.answering).toBe(wyverns);
    expect(engine.answer(ben, 1).ok).toBe(false); // not on the Team
    ok(engine.answer(ana, 1));
    ok(engine.answer(cy, 0));
    ok(engine.answer(ana, 0)); // a vote can change
    ok(engine.answer(ana, 1));
    expect(engine.session.phase).toBe('ANSWERING');
    ok(engine.answer(eve, 1));
    expect(engine.session.phase).toBe('REVEAL');
    expect(engine.session.teams[0].points).toBe(200);
    expect(engine.session.control).toBe(wyverns);
    expect([ana, cy, eve].map((id) => engine.player(id)!.rightVotes)).toEqual([1, 0, 1]);
    expect(engine.player(cy)!.buzzesWon).toBe(1);
    expect(engine.player(dee)!.rightVotes).toBe(0);
  });

  test('a tie goes to the buzzer’s choice; a wrong Team is locked out; a Team with no votes is wrong', () => {
    const { engine, ids, ok, advance, wyverns, griffins } = teamGame();
    const [ana, ben, cy, dee] = ids;
    ok(engine.buzz(ana));
    ok(engine.answer(cy, 1));
    ok(engine.answer(ana, 2));
    advance(15_000);
    engine.tick();
    expect(engine.session.open!.result).toMatchObject({
      contender: wyverns,
      choice: 2,
      correct: false,
    });
    expect(engine.session.phase).toBe('BUZZING');
    expect(engine.buzz(cy).ok).toBe(false);
    ok(engine.buzz(dee));
    advance(15_000);
    engine.tick();
    expect(engine.session.open!.result).toMatchObject({
      contender: griffins,
      choice: null,
      correct: false,
    });
    expect(engine.session.phase).toBe('REVEAL');
    expect(engine.session.teams.map((team) => team.points)).toEqual([-200, -200]);
    expect(engine.player(ben)!.rightVotes).toBe(0);
  });

  test('a tie the buzzer stayed out of goes to the choice voted for first', () => {
    const { engine, ids, ok, advance } = teamGame();
    const [, ben, , dee] = ids;
    ok(engine.buzz(ben));
    ok(engine.answer(dee, 1));
    advance(15_000);
    engine.tick();
    expect(engine.session.open!.result).toMatchObject({ choice: 1, correct: true });

    const tie = teamGame();
    const [ana, , cy, , eve] = tie.ids;
    tie.ok(tie.engine.buzz(eve));
    tie.ok(tie.engine.answer(ana, 0));
    tie.ok(tie.engine.answer(cy, 1));
    tie.advance(15_000);
    tie.engine.tick();
    expect(tie.engine.session.open!.result).toMatchObject({ choice: 0, correct: false });
  });
});

describe('Peril! Treasure Trove', () => {
  test('Solo: whoever picks it wagers between 5 and their score (or 500), then answers alone', () => {
    const { engine, ids, ok } = setup(['Ana', 'Ben'], { wrongAnswerPenalty: false });
    ok(engine.startBoard(board('a2')));
    const control = engine.session.control!;
    const other = ids.find((id) => id !== control)!;
    ok(engine.pickTile(0, 1, control));
    expect(engine.session.phase).toBe('WAGERING');
    expect(engine.wager(other, 100).ok).toBe(false);
    ok(engine.wager(control, 9_999));
    expect(engine.session.open!.wager).toBe(500);
    expect(engine.session.phase).toBe('ANSWERING');
    expect(engine.answer(other, 1).ok).toBe(false);
    ok(engine.answer(control, 0));
    expect(engine.player(control)!.points).toBe(-500); // a lost Wager costs even without the penalty
    expect(engine.session.phase).toBe('REVEAL'); // nobody else may buzz
  });

  test('Teams: every member enters a number and the Wager is their median, then the Team votes', () => {
    const { engine, ids, ok, advance } = setup(['Ana', 'Ben', 'Cy', 'Dee', 'Eve'], {
      teams: { names: ['W', 'G'], assign: 'auto' },
    });
    const [ana, ben, cy, , eve] = ids;
    ok(engine.startBoard(board('b2')));
    const wyverns = engine.session.teams[0];
    engine.session.control = wyverns.id;
    ok(engine.pickTile(1, 1));
    expect(engine.wager(ben, 300).ok).toBe(false);
    ok(engine.wager(ana, 1));
    ok(engine.wager(cy, 400));
    advance(15_000);
    engine.tick();
    expect(engine.session.open!.wager).toBe(202); // 5 and 400 → 202.5, rounded down
    expect(engine.session.phase).toBe('ANSWERING');
    ok(engine.answer(eve, 1));
    advance(15_000);
    engine.tick();
    expect(wyverns.points).toBe(202);
  });

  test('a Team that enters no numbers wagers 5', () => {
    const { engine, ok, advance } = setup(['Ana', 'Ben'], {
      teams: { names: ['W', 'G'], assign: 'auto' },
    });
    ok(engine.startBoard(board('a2')));
    engine.session.control = engine.session.teams[0].id;
    ok(engine.pickTile(0, 1));
    advance(15_000);
    engine.tick();
    expect(engine.session.open!.wager).toBe(5);
  });
});

describe('Peril! room', () => {
  test('a removed student can’t come back, and an ended game takes nobody new', () => {
    const { engine, ids, ok } = setup(['Ana', 'Ben']);
    const ana = engine.player(ids[0])!;
    ok(engine.kick(ana.id));
    expect(engine.session.players.map((p) => p.nickname)).toEqual(['Ben']);
    expect(engine.join({ nickname: 'Ana', playerId: ana.id, secret: ana.secret }).ok).toBe(false);
    ok(engine.endSession());
    expect(engine.session.phase).toBe('ENDED');
    expect(engine.join({ nickname: 'Cy' }).ok).toBe(false);
  });
});

describe('Peril! rules', () => {
  test('the teacher can change the rules between boards, but not while one is being played', () => {
    const { engine, ok } = setup(['Ana']);
    ok(engine.updateSettings({ wrongAnswerPenalty: false, buzzSeconds: 5 }));
    expect(engine.session.settings).toMatchObject({ wrongAnswerPenalty: false, buzzSeconds: 5 });
    ok(engine.startBoard(board()));
    expect(engine.updateSettings({ treasureTrove: false }).ok).toBe(false);
  });
});

describe('Peril! with no student devices', () => {
  function noDevices() {
    let now = 1_000_000;
    let seed = 3;
    const clock = { now: () => now, random: () => (seed = (seed * 16807) % 2147483647) / 2147483647 };
    const engine = new PerilEngine(
      createPerilSession({ code: '123456', settings: { teams: { names: ['Red', 'Blue'], assign: 'auto' } }, noDevices: true, clock }),
      clock,
    );
    const ok = (result: { ok: boolean; message?: string }) => expect(result).toEqual({ ok: true });
    const [red, blue] = engine.session.teams.map((t) => t.id);
    return { engine, ok, red, blue, advance: (ms: number) => (now += ms) };
  }

  test('Teams with nobody in them play: the teacher taps who buzzed and what they answered', () => {
    const { engine, ok, red, blue } = noDevices();
    ok(engine.startBoard(board()));
    expect(engine.session.control).not.toBeNull();
    ok(engine.pickTile(0, 0));
    ok(engine.armBuzzers());
    ok(engine.buzzFor(blue));
    expect(engine.session.open!.deadline).toBeNull();
    ok(engine.answerFor(0));
    // Wrong: Blue is out and the buzzers re-arm for Red.
    expect(engine.session.phase).toBe('BUZZING');
    expect(engine.buzzFor(blue).ok).toBe(false);
    ok(engine.buzzFor(red));
    ok(engine.answerFor(1));
    expect(engine.session.phase).toBe('REVEAL');
    expect(engine.session.teams.map((t) => t.points)).toEqual([100, -100]);
    expect(engine.session.control).toBe(red);
  });

  test('nobody buzzing still runs out the clock', () => {
    const { engine, ok, advance } = noDevices();
    ok(engine.startBoard(board()));
    ok(engine.pickTile(0, 0));
    ok(engine.armBuzzers());
    advance(60_000);
    expect(engine.tick()).toBe(true);
    expect(engine.session.phase).toBe('REVEAL');
  });

  test('a Treasure Trove takes the Wager the teacher enters, with no clock', () => {
    const { engine, ok, advance } = noDevices();
    ok(engine.startBoard(board('a1')));
    const holder = engine.session.control;
    ok(engine.pickTile(0, 0));
    expect(engine.session.phase).toBe('WAGERING');
    advance(60_000);
    expect(engine.tick()).toBe(false);
    ok(engine.wagerFor(10_000));
    expect(engine.session.open!.wager).toBe(500);
    expect(engine.session.open!.deadline).toBeNull();
    ok(engine.answerFor(1));
    expect(engine.session.teams.find((t) => t.id === holder)!.points).toBe(500);
  });
});
