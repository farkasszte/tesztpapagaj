/**
 * A Kahoot quiz, read for a link the teacher pastes.
 *
 * Kahoot's own API is not open to a browser: `play.kahoot.it/rest/kahoots/{id}`
 * sends no `Access-Control-Allow-Origin`, so a page cannot read it however it
 * asks (measured on every host Kahoot serves it from). This function is the
 * one step that cannot happen in the page, so it happens here: it asks Kahoot
 * for the quiz and hands the answer back with the header a browser needs.
 *
 * It stores nothing, keeps no key, and reads one public quiz per call.
 */

export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

/** A Kahoot id: the UUID a share link carries. */
const KAHOOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function answer(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'GET') return answer({ error: 'Only GET is supported.' }, 405)

  const id = new URL(request.url).searchParams.get('id')?.trim() ?? ''
  if (!KAHOOT_ID.test(id)) return answer({ error: 'That is not a Kahoot id.' }, 400)

  try {
    const upstream = await fetch(`https://play.kahoot.it/rest/kahoots/${id}`, {
      headers: { accept: 'application/json' },
    })
    if (upstream.status === 404) return answer({ error: 'No Kahoot has that id.' }, 404)
    // A private or restricted quiz answers 403 with its own error body: the
    // page says so in the teacher's words rather than passing Kahoot's on.
    if (upstream.status === 403) return answer({ error: 'That Kahoot is not public.' }, 403)
    if (!upstream.ok) return answer({ error: `Kahoot answered ${upstream.status}.` }, 502)
    return answer(await upstream.json(), 200)
  } catch {
    return answer({ error: 'Kahoot could not be reached.' }, 502)
  }
}
