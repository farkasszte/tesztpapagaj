import { afterEach, describe, expect, test } from 'bun:test'
import { inspectKahootLink, kahootIdIn, KahootLinkError } from './kahoot-link'

/** A quiz as the link reader hands it over: what `api/kahoot` returns. */
const quiz = {
  title: 'Európa röpdolgozat',
  questions: [
    {
      type: 'quiz',
      question: 'Mi Magyarország fővárosa?',
      choices: [
        { answer: 'Bécs', correct: false },
        { answer: 'Budapest', correct: true },
      ],
    },
    {
      type: 'true_false',
      question: 'A Balaton a legnagyobb tavunk.',
      choices: [
        { answer: 'True', correct: true },
        { answer: 'False', correct: false },
      ],
    },
    { type: 'word_cloud', question: 'Egy szó Európáról', choices: [] },
  ],
}

const realFetch = globalThis.fetch

function answerWith(body: unknown, init: { status?: number; type?: string } = {}) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': init.type ?? 'application/json' },
  })) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('a Kahoot link behozatala', () => {
  test('a linkből kész javaslat lesz, a kimaradó kérdés megjegyzésével', async () => {
    answerWith(quiz)
    const proposal = await inspectKahootLink('https://create.kahoot.it/share/europa/61071306-187d-4e92-82d7-2c11f2779298')
    const bank = proposal.banks[0]!
    expect(bank.record.bank.name).toBe('Európa röpdolgozat')
    expect(bank.record.bank.questions).toHaveLength(2)
    expect(proposal.reading?.format).toBe('kahoot')
    expect(proposal.reading?.found).toBe(3)
    expect(proposal.reading?.issues.map((issue) => issue.code)).toContain('kahoot-unsupported')
  })

  test('nem Kahoot linkre magyar hibaüzenet jön', async () => {
    await expect(inspectKahootLink('https://example.com/valami')).rejects.toThrow(KahootLinkError)
  })

  test('a nem nyilvános kahoot külön üzenetet kap', async () => {
    answerWith({ error: 'That Kahoot is not public.' }, { status: 403 })
    await expect(inspectKahootLink('61071306-187d-4e92-82d7-2c11f2779298'))
      .rejects.toThrow(/nem nyilvános/)
  })

  test('ha a link olvasója nem fut, arról szól az üzenet', async () => {
    answerWith('<html></html>', { type: 'text/html' })
    await expect(inspectKahootLink('61071306-187d-4e92-82d7-2c11f2779298'))
      .rejects.toThrow(/nem fut/)
  })

  test('az azonosító kiolvasása a linkből', () => {
    expect(kahootIdIn('https://create.kahoot.it/share/x/61071306-187d-4e92-82d7-2c11f2779298'))
      .toBe('61071306-187d-4e92-82d7-2c11f2779298')
  })
})
