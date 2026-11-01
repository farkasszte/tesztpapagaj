import { expect, test } from 'bun:test';
import { ClassicEngine, createClassicSession } from './engine';
import { buildClassicView } from './views';

const questions = [{ id: 'q1', prompt: '7 × 8?', choices: ['54', '56', '64'], correct: 1, explanation: 'Seven eights.' }];

function game() {
  let seed = 3;
  const clock = { now: () => 0, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) };
  const engine = new ClassicEngine(createClassicSession({ code: '123456', title: 'Facts', questions, clock }), clock);
  const ids = ['Ana', 'Ben'].map((nickname) => {
    const joined = engine.join({ nickname });
    if (!joined.ok) throw new Error(joined.message);
    return joined.player.id;
  });
  return { engine, ids, view: (viewerId?: string) => buildClassicView(engine.session, { now: 0, viewerId }) };
}

test('while the class answers, nobody sees the right answer or who chose what; screens see only how many have answered', () => {
  const { engine, ids, view } = game();
  engine.start();
  engine.answer(ids[0], 0);
  expect(view().question).toMatchObject({ number: 1, total: 1, prompt: '7 × 8?', choices: ['54', '56', '64'], answered: 1, answering: 2, correct: null, counts: null });
  expect(JSON.stringify(view())).not.toContain('"choice"');
  expect(view(ids[0]).me).toMatchObject({ answer: 0, right: null });
  expect(view(ids[1]).me).toMatchObject({ answer: null, canAnswer: true });
});

test('the reveal shows the answer and how many chose each, with no names; each student learns only their own result', () => {
  const { engine, ids, view } = game();
  engine.start();
  engine.answer(ids[0], 0);
  engine.answer(ids[1], 1);
  expect(view().question).toMatchObject({ correct: 1, counts: [1, 1, 0], explanation: 'Seven eights.' });
  expect(JSON.stringify(view().question)).not.toContain('Ana');
  expect(view(ids[0]).me).toMatchObject({ answer: 0, right: false });
  expect(view(ids[1]).me).toMatchObject({ answer: 1, right: true, correctSoFar: 1 });
});

test('the Report goes only to the teacher’s screen; a student sees just their own score', () => {
  const { engine, ids, view } = game();
  engine.start();
  engine.answer(ids[0], 1);
  engine.answer(ids[1], 0);
  engine.next();
  expect(view().report?.students.map((s) => s.nickname)).toEqual(['Ana', 'Ben']);
  expect(view(ids[1]).report).toBeNull();
  expect(view(ids[1]).me).toMatchObject({ correctSoFar: 0, asked: 1 });
});

test('sorrendnél és párosításnál nincs „egy helyes válasz": nincs betű, nincs megoszlás', () => {
  const ordering = [
    {
      id: 'o1',
      prompt: 'Tedd sorrendbe!',
      choices: ['Első', 'Második', 'Harmadik'],
      correct: 0,
      correctOrder: [1, 2, 0],
    },
  ];
  const matching = [
    {
      id: 'm1',
      prompt: 'Párosítsd!',
      choices: ['Cukor', 'Energia'],
      prompts: ['Fotoszintézis', 'Légzés'],
      matches: [0, 1],
      correct: 0,
    },
  ];

  const cases: [typeof ordering, number[]][] = [
    [ordering, [0, 1, 2]],
    [matching, [0, 1]],
  ];
  for (const [questions_, answer] of cases) {
    const clock = { now: () => 0, random: () => 0.5 };
    const engine = new ClassicEngine(
      createClassicSession({ code: '123456', title: 'Sorrend', questions: questions_ as never, clock }),
      clock,
    );
    const joined = engine.join({ nickname: 'Panni' });
    if (!joined.ok) throw new Error(joined.message);
    engine.start();
    expect(engine.answerMany(joined.player.id, answer).ok).toBe(true);
    engine.lock();

    const question = buildClassicView(engine.session, { now: 0 }).question!;
    // A válasz nem egy kiválasztott elem: se betű, se megoszlás.
    expect(question.correct).toBeNull();
    expect(question.counts).toBeNull();
    expect(question.correctChoices).toBeNull();
    // A sorrend viszont megvan, hogy a diák kiírhassa a helyeset.
    expect(question.correctOrder ?? question.matchAnswers).not.toBeNull();
  }
});
