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
