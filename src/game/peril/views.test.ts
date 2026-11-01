import { expect, test } from 'bun:test';
import type { Column } from './types';
import { createPerilSession, PerilEngine } from './engine';
import { buildPerilView } from './views';

const board: Column[] = [
  {
    title: 'Fractions',
    tiles: [100, 200].map((value, row) => ({
      value,
      question: {
        id: `q${row}`,
        prompt: `Question ${row}`,
        choices: ['A', 'B', 'C'],
        correct: 2,
        explanation: 'Because.',
        rich: {
          prompt: [{ type: 'paragraph', content: [{ type: 'inline-math', source: `x_${row}` }] }],
          choices: ['A', 'B', 'C'].map((text) => [{ type: 'paragraph', content: [{ type: 'text', text }] }]),
          explanation: [{ type: 'block-image', asset: 'why' }],
        },
      },
      treasureTrove: row === 1,
    })),
  },
];

function teamGame() {
  let now = 0;
  let seed = 5;
  const clock = { now: () => now, random: () => (seed = (seed * 16807) % 2147483647) / 2147483647 };
  const engine = new PerilEngine(
    createPerilSession({
      code: '123456',
      settings: { teams: { names: ['Wyverns', 'Griffins'], assign: 'auto' } },
      clock,
    }),
    clock,
  );
  const ids = ['Ana', 'Ben', 'Cy', 'Dee'].map((nickname) => {
    const joined = engine.join({ nickname });
    if (!joined.ok) throw new Error(joined.message);
    return joined.player.id;
  });
  engine.startBoard(board);
  return {
    engine,
    ids,
    view: (viewerId?: string) => buildPerilView(engine.session, { now, viewerId }),
    advance: (ms: number) => (now += ms),
  };
}

test('nobody sees the right answer, or where the Treasure Trove hides, before the reveal', () => {
  const { engine, ids, view } = teamGame();
  const [ana, , cy] = ids; // Wyverns: Ana and Cy
  expect(JSON.stringify(view())).not.toContain('treasureTrove":true');
  engine.pickTile(0, 0);
  engine.armBuzzers();
  engine.buzz(ana);
  engine.answer(ana, 2);
  expect(view().open).toMatchObject({
    prompt: 'Question 0',
    choices: ['A', 'B', 'C'],
    correct: null,
    explanation: null,
  });
  expect(view(ana).open!.correct).toBeNull();
  expect(view(ana).open!.rich?.prompt).toEqual(board[0].tiles[0].question.rich!.prompt);
  expect(JSON.stringify(view(ana))).not.toContain('"why"');
  engine.answer(cy, 2);
  expect(view().open!.rich?.explanation).toEqual([{ type: 'block-image', asset: 'why' }]);
  expect(view().open).toMatchObject({
    correct: 2,
    explanation: 'Because.',
    result: { name: 'Wyverns', correct: true, points: 100 },
  });
});

test('a Treasure Trove’s rich words stay hidden while Wagers are set, like its plain words', () => {
  const { engine, view } = teamGame();
  engine.pickTile(0, 1);
  expect(view().open).toMatchObject({ prompt: null, rich: null });
});

test('a Team’s live tally and Wagers reach only its own members; others see how many have voted', () => {
  const { engine, ids, view } = teamGame();
  const [ana, ben, cy] = ids;
  engine.pickTile(0, 0);
  engine.armBuzzers();
  engine.buzz(ana);
  engine.answer(ana, 1);
  expect(view(cy).open!.tally).toEqual([0, 1, 0]);
  expect(view(ben).open!.tally).toBeNull();
  expect(view().open!.tally).toBeNull();
  expect(view().open).toMatchObject({ voted: 1, voters: 2, answering: 'Wyverns' });
  expect(view(cy).me).toMatchObject({ canAnswer: true, canBuzz: false, myVote: null });
  expect(view(ana).me!.myVote).toBe(1);
  expect(view(ben).me).toMatchObject({ canAnswer: false, canBuzz: false });
});

test('final standings rank Teams, with each student’s right votes and buzzes won', () => {
  const { engine, ids, view } = teamGame();
  const [, ben, , dee] = ids;
  engine.pickTile(0, 0);
  engine.armBuzzers();
  engine.buzz(ben);
  engine.answer(ben, 2);
  engine.answer(dee, 2);
  engine.next();
  engine.pickTile(0, 1);
  engine.wager(ben, 300);
  engine.wager(dee, 300);
  engine.answer(dee, 2);
  engine.answer(ben, 1);
  // A tie with no buzzer goes to the choice voted first: Dee's right answer.
  engine.next();
  expect(engine.session.phase).toBe('FINAL');
  expect(view().standings).toEqual([
    {
      rank: 1,
      name: 'Griffins',
      points: 400,
      members: [
        { nickname: 'Dee', rightVotes: 2, buzzesWon: 0 },
        { nickname: 'Ben', rightVotes: 1, buzzesWon: 1 },
      ],
    },
    {
      rank: 2,
      name: 'Wyverns',
      points: 0,
      members: [
        { nickname: 'Ana', rightVotes: 0, buzzesWon: 0 },
        { nickname: 'Cy', rightVotes: 0, buzzesWon: 0 },
      ],
    },
  ]);
});
