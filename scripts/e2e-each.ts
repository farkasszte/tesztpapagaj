// Every e2e spec on its own, one after another.
//
// Why one at a time: a single run of the whole suite gives one exit code for
// forty files, and a file that hangs (or a dev server that dies) swallows the
// rest of the run — minutes or hours of work with nothing to show. Run apart,
// each file reports its own verdict in a minute or two, and one bad file costs
// only itself.
//
// Usage:
//   bun run test:e2e:each                 every spec
//   bun run test:e2e:each question-bank   only files whose name matches

import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const filter = process.argv[2] ?? ''
const files = readdirSync('scripts')
  .filter((name) => name.endsWith('.e2e.ts'))
  .filter((name) => name.includes(filter))
  .sort()

if (files.length === 0) {
  console.error(`No e2e spec matches “${filter}”.`)
  process.exit(1)
}

type Result = { file: string; ok: boolean; seconds: number; summary: string }

const results: Result[] = []

for (const [index, file] of files.entries()) {
  const label = `[${index + 1}/${files.length}] ${file}`
  console.log(`\n=== ${label} ===`)
  const started = Date.now()
  const run = spawnSync(
    'bunx',
    ['playwright', 'test', `scripts/${file}`, '--retries=0', '--reporter=line'],
    { stdio: 'inherit', shell: true, encoding: 'utf8' },
  )
  const seconds = Math.round((Date.now() - started) / 1000)
  results.push({
    file,
    ok: run.status === 0,
    seconds,
    summary: run.status === 0 ? 'ok' : `exit ${run.status}`,
  })
}

const failed = results.filter((result) => !result.ok)
console.log('\n=== összegzés ===')
for (const result of results) {
  console.log(`${result.ok ? '✓' : '✗'} ${result.file.padEnd(42)} ${String(result.seconds).padStart(4)}s  ${result.summary}`)
}
console.log(`\n${results.length - failed.length}/${results.length} spec zöld.`)
process.exit(failed.length === 0 ? 0 : 1)
