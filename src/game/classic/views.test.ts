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

function gameWith(settings: { roundResults?: boolean }, nicknames: string[]) {
  let seed = 7;
  const clock = { now: () => 0, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) };
  const session = createClassicSession({ code: '123456', title: 'Facts', questions, settings, clock });
  const engine = new ClassicEngine(session, clock);
  const ids = nicknames.map((nickname) => {
    const joined = engine.join({ nickname });
    if (!joined.ok) throw new Error(joined.message);
    return joined.player.id;
  });
  return { engine, ids, view: (viewerId?: string) => buildClassicView(engine.session, { now: 0, viewerId }) };
}

test('a beállítással a felfedés az első ötöt mutatja a tanár színpadán, pont szerint', () => {
  const { engine, ids, view } = gameWith({ roundResults: true, scoring: true }, ['Ana', 'Ben', 'Cili', 'Dani', 'Emil', 'Feri']);
  engine.start();
  // Ketten jól válaszolnak, a többi rosszul: a sorrend a pontoké.
  engine.answer(ids[1], 1);
  engine.answer(ids[3], 1);
  for (const id of [ids[0], ids[2], ids[4], ids[5]]) engine.answer(id, 0);
  engine.lock();
  const top = view().roundTop!
  expect(top).toHaveLength(5)
  // Az élen a helyes válaszolók állnak, pontszámmal; a hatodik már nem fér rá.
  expect(top.map((player) => player.nickname)).toEqual(['Ben', 'Dani', 'Ana', 'Cili', 'Emil'])
  expect(top[0].points).toBeGreaterThan(0)
  expect(top.every((player) => typeof player.points === 'number')).toBe(true)
  expect(top.map((player) => player.nickname)).not.toContain('Feri')
});

test('a diák telefonja sose kapja meg az osztály rangsorát', () => {
  const { engine, ids, view } = gameWith({ roundResults: true, scoring: true }, ['Ana', 'Ben']);
  engine.start();
  engine.answer(ids[0], 1);
  engine.answer(ids[1], 0);
  engine.lock();
  expect(view().roundTop).toHaveLength(2)
  // A diák nézete csak a saját eredményét hordozza: rangsor nincs benne.
  expect(view(ids[0]).roundTop).toBeNull()
  expect(view(ids[0]).me).toMatchObject({ nickname: 'Ana', right: true })
});

test('kikapcsolva nincs köristrip, és a felfedés előtt sem', () => {
  const off = gameWith({}, ['Ana', 'Ben']);
  off.engine.start();
  off.engine.answer(off.ids[0], 1);
  off.engine.answer(off.ids[1], 0);
  off.engine.lock();
  expect(off.view().roundTop).toBeNull();

  const on = gameWith({ roundResults: true }, ['Ana', 'Ben']);
  on.engine.start();
  expect(on.view().roundTop).toBeNull();
});
