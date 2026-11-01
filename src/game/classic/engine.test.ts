import { describe, expect, test } from 'bun:test';
import type { Question } from '../types';
import { ClassicEngine, createClassicSession } from './engine';
import type { ClassicSettings } from './types';

const questions: Question[] = [
  { id: 'q1', prompt: '7 × 8?', choices: ['54', '56', '64'], correct: 1 },
  { id: 'q2', prompt: 'Closest planet?', choices: ['Venus', 'Mercury'], correct: 1 },
];

function setup(names: string[], settings: Partial<ClassicSettings> = {}) {
  let now = 1_000_000;
  let seed = 7;
  const clock = { now: () => now, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) };
  const engine = new ClassicEngine(createClassicSession({ code: '123456', title: 'Facts', questions, settings, clock }), clock);
  const ids = names.map((nickname) => {
    const joined = engine.join({ nickname });
    if (!joined.ok) throw new Error(joined.message);
    return joined.player.id;
  });
  const ok = (result: { ok: boolean; message?: string }) => expect(result).toEqual({ ok: true });
  return { engine, ids, ok, advance: (ms: number) => (now += ms) };
}

describe('Classic', () => {
  test('everyone answers each question; once all have answered the answer shows, then the next question, then the report', () => {
    const { engine, ids, ok } = setup(['Ana', 'Ben', 'Cy']);
    const [ana, ben, cy] = ids;
    ok(engine.start());
    expect(engine.session.phase).toBe('QUESTION');
    ok(engine.answer(ana, 1));
    expect(engine.answer(ana, 0).ok).toBe(false); // an answer is final
    ok(engine.answer(ben, 0));
    expect(engine.session.phase).toBe('QUESTION');
    ok(engine.answer(cy, 1));
    expect(engine.session.phase).toBe('REVEAL');
    ok(engine.next());
    ok(engine.answer(ana, 1));
    ok(engine.answer(ben, 1));
    ok(engine.answer(cy, 0));
    ok(engine.next());
    expect(engine.session.phase).toBe('REPORT');
    expect(engine.report()).toEqual({
      questions: [
        { prompt: '7 × 8?', correct: 2, answered: 3, counts: [1, 2, 0] },
        { prompt: 'Closest planet?', correct: 2, answered: 3, counts: [1, 2] },
      ],
      students: [
        { nickname: 'Ana', correct: 2, answered: 2, points: 0 },
        { nickname: 'Ben', correct: 1, answered: 2, points: 0 },
        { nickname: 'Cy', correct: 1, answered: 2, points: 0 },
      ],
    });
  });

  test('when time runs out the answer shows, and students who didn’t answer simply have no answer', () => {
    const { engine, ids, ok, advance } = setup(['Ana', 'Ben']);
    ok(engine.start());
    ok(engine.answer(ids[0], 1));
    advance(19_999);
    expect(engine.tick()).toBe(false);
    advance(1);
    expect(engine.tick()).toBe(true);
    expect(engine.session.phase).toBe('REVEAL');
    expect(engine.answer(ids[1], 1).ok).toBe(false);
    expect(engine.report().students.find((s) => s.nickname === 'Ben')).toEqual({ nickname: 'Ben', correct: 0, answered: 0, points: 0 });
  });

  test('without scoring nobody earns points; with it, a right answer earns 500 to 1000, more for a quicker one', () => {
    const plain = setup(['Ana']);
    plain.ok(plain.engine.start());
    plain.ok(plain.engine.answer(plain.ids[0], 1));
    expect(plain.engine.player(plain.ids[0])!.points).toBe(0);

    const { engine, ids, ok, advance } = setup(['Ana', 'Ben', 'Cy'], { scoring: true });
    ok(engine.start());
    ok(engine.answer(ids[0], 1)); // at once
    advance(10_000);
    ok(engine.answer(ids[1], 1)); // halfway through 20 seconds
    ok(engine.answer(ids[2], 0)); // wrong
    expect(ids.map((id) => engine.player(id)!.points)).toEqual([1000, 750, 0]);
  });

  test('a student who drops out doesn’t hold the question open; one who joins late answers from the next question', () => {
    const { engine, ids, ok } = setup(['Ana', 'Ben']);
    ok(engine.start());
    engine.setConnected(ids[1], false);
    ok(engine.answer(ids[0], 1));
    expect(engine.session.phase).toBe('REVEAL');
    const late = engine.join({ nickname: 'Cy' });
    if (!late.ok) throw new Error(late.message);
    ok(engine.next());
    ok(engine.answer(ids[0], 1));
    expect(engine.session.phase).toBe('QUESTION'); // still waiting for Cy
    ok(engine.answer(late.player.id, 1));
    expect(engine.session.phase).toBe('REVEAL');
  });

  test('the teacher can lock the answers early and change the rules only in the lobby', () => {
    const { engine, ok } = setup(['Ana']);
    ok(engine.updateSettings({ timerSeconds: 30, scoring: true }));
    expect(engine.session.settings).toMatchObject({ timerSeconds: 30, scoring: true });
    ok(engine.start());
    expect(engine.updateSettings({ timerSeconds: 10 }).ok).toBe(false);
    ok(engine.lock());
    expect(engine.session.phase).toBe('REVEAL');
  });
});

describe('Classic with no student devices', () => {
  test('starts with nobody joined, and only the teacher shows the answer', () => {
    let now = 1_000_000;
    const clock = { now: () => now, random: () => 0.5 };
    const engine = new ClassicEngine(createClassicSession({ code: '123456', title: 'Facts', questions, noDevices: true, clock }), clock);
    expect(engine.start()).toEqual({ ok: true });
    now += 120_000;
    expect(engine.tick()).toBe(false);
    expect(engine.session.phase).toBe('QUESTION');
    expect(engine.lock()).toEqual({ ok: true });
    expect(engine.next()).toEqual({ ok: true });
    expect(engine.lock()).toEqual({ ok: true });
    expect(engine.next()).toEqual({ ok: true });
    expect(engine.session.phase).toBe('REPORT');
  });
});
