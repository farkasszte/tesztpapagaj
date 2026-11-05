import { useEffect, useMemo, useState } from 'react'
import { AppShell } from './app-shell'
import type { PersistentStorageStatus } from './durable-storage'
import { countOf, t, useT } from './i18n'
import {
  averagePercentOf,
  studentPercentOf,
  successPercentOf,
  type GameResult,
  type ResultCell,
} from './game/results'
import { clearResults, deleteResult, listResults } from './game/results-store'

/**
 * Játékeredmények: a lejátszott vetítések utólag.
 *
 * A játék közben semmi nem marad meg a tanár számára — ez az az oldal, ahol
 * utána megnézheti, ki mit tudott: játékonként a csoportátlag, kérdésenként a
 * sikeresség, és diák × kérdés mátrixban a helyes / hibás / kihagyott válasz.
 * Ez a Kahoot-jelentés megfelelője, azzal a különbséggel, hogy itt minden a
 * tanár gépén marad: csak becenév, semmi valódi név, és semmi feltöltés.
 */

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const cellMark: Record<ResultCell, string> = { right: '✓', wrong: '✗', skipped: '–' }

/** A mátrix cellájának felirata a képernyőolvasónak. */
function cellLabel(cell: ResultCell): string {
  if (cell === 'right') return t('results.right')
  if (cell === 'wrong') return t('results.wrong')
  return t('results.skipped')
}

/** CSV a naplóhoz: pontosvessző, mert a magyar Excel ezt várja, és BOM, hogy a
 *  ékezetek ne vesszenek el. */
function csvOf(result: GameResult): string {
  const head = [t('results.student'), ...result.questions.map((_, index) => `${index + 1}. ${t('results.question')}`)]
  const rows = result.players.map((player) => [
    player.nickname,
    ...player.cells.map((cell) => (cell === 'right' ? '1' : cell === 'wrong' ? '0' : '')),
  ])
  const success = ['', ...result.questions.map((question) => `${successPercentOf(question)}%`)]
  return `\uFEFF${[head, ...rows, success].map((row) => row.join(';')).join('\n')}`
}

function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ResultsPage({ persistentStorage }: { persistentStorage: PersistentStorageStatus }) {
  const tr = useT()
  const [results, setResults] = useState<GameResult[] | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'one' | 'all' | null>(null)

  const reload = () => {
    void listResults().then((loaded) => {
      setResults(loaded)
      setChosen((current) => (current && loaded.some((result) => result.id === current) ? current : loaded[0]?.id ?? null))
    })
  }

  useEffect(reload, [])

  const selected = useMemo(
    () => (results ?? []).find((result) => result.id === chosen) ?? null,
    [results, chosen],
  )
  /** A diákok sorrendje: a legtöbb helyes válasz elöl. */
  const players = useMemo(
    () => (selected ? [...selected.players].sort((left, right) => right.correct - left.correct) : []),
    [selected],
  )
  /** Holtverseny is lehet: mindenki ott van a legjobbak között, aki elérte a csúcsot. */
  const best = useMemo(() => {
    if (players.length === 0) return null
    const top = players[0]!.correct
    const winners = players.filter((player) => player.correct === top)
    return { names: winners.map((player) => player.nickname), percent: studentPercentOf(players[0]!, selected?.questions.length ?? 0) }
  }, [players, selected])

  return (
    <AppShell
      crumbs={[{ label: t('shell.home'), href: '/' }, { label: t('results.title') }]}
      persistentStorage={persistentStorage}
    >
      <header className="collection-heading">
        <h1>{t('results.title')}</h1>
      </header>
      {results === null ? (
        <p className="site-note">{t('common.loading')}</p>
      ) : results.length === 0 ? (
        <div className="home-empty">
          <h2>{t('results.empty')}</h2>
          <p>{t('results.emptyHint')}</p>
        </div>
      ) : (
        <div className="results-body">
          <aside className="results-sidebar">
            <nav className="results-list" aria-label={t('results.title')}>
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="result-chip"
                  data-on={result.id === chosen ? 'yes' : undefined}
                  onClick={() => {
                    setChosen(result.id)
                    setConfirming(null)
                  }}
                >
                  <span className="result-chip-title">{result.title}</span>
                  <span className="result-chip-meta">
                    {dateFormat.format(result.endedAt)} · {countOf(result.players.length, 'player')}
                  </span>
                  <span className="result-chip-average">{averagePercentOf(result)}%</span>
                </button>
              ))}
            </nav>
            {confirming === 'all' ? (
              <div className="folder-tools">
                <p className="folder-hint">{tr('results.confirmAll')}</p>
                <button type="button" className="folder-tool" onClick={() => { setConfirming(null); void clearResults().then(reload) }}>
                  {tr('results.deleteAll')}
                </button>
                <button type="button" className="folder-tool" onClick={() => setConfirming(null)}>{tr('common.cancel')}</button>
              </div>
            ) : (
              <button type="button" className="folder-add" onClick={() => setConfirming('all')}>
                {tr('results.deleteAll')}
              </button>
            )}
          </aside>
          <div className="results-main">
            {selected && (
              <>
                <div className="results-summary">
                  <div>
                    <h2>{selected.title}</h2>
                    <p className="site-note">
                      {dateFormat.format(selected.startedAt)} · {countOf(selected.players.length, 'player')} ·{' '}
                      {countOf(selected.questions.length, 'question')}
                    </p>
                  </div>
                  <div className="results-figures">
                    <p className="results-figure">
                      <strong>{averagePercentOf(selected)}%</strong> {t('results.average')}
                    </p>
                    <p className="results-figure">
                      <strong>{best ? `${best.names.join(', ')} (${best.percent}%)` : '–'}</strong>{' '}
                      {t('results.best')}
                    </p>
                  </div>
                </div>
                <div className="results-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => downloadCsv(`eredmeny-${selected.startedAt}.csv`, csvOf(selected))}
                  >
                    {t('results.csv')}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => window.print()}>
                    {t('results.print')}
                  </button>
                  {confirming === 'one' ? (
                    <>
                      <span className="folder-hint">{t('results.confirmOne')}</span>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => { void deleteResult(selected.id).then(() => { setConfirming(null); reload() }) }}
                      >
                        {t('results.delete')}
                      </button>
                      <button type="button" className="secondary-button" onClick={() => setConfirming(null)}>
                        {t('common.cancel')}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="secondary-button" onClick={() => setConfirming('one')}>
                      {t('results.delete')}
                    </button>
                  )}
                </div>
                {/* A mátrix: sorok a diákok, oszlopok a kérdések; a fejléc alatt
                    a kérdés sikeressége. Sok diáknál vízszintesen görgethető, a
                    név-oszlop helyben marad. */}
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('results.student')}</th>
                        {selected.questions.map((question, index) => (
                          <th key={question.id} scope="col" title={question.prompt}>
                            <span className="results-question-number">{index + 1}</span>
                            <span className="results-question-rate">{successPercentOf(question)}%</span>
                          </th>
                        ))}
                        <th scope="col">{t('results.score')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((player) => (
                        <tr key={player.nickname}>
                          <th scope="row">{player.nickname}</th>
                          {player.cells.map((cell, index) => (
                            <td key={`${player.nickname}-${index}`} data-cell={cell} aria-label={cellLabel(cell)}>
                              {cellMark[cell]}
                            </td>
                          ))}
                          <td className="results-score">
                            {player.correct}/{selected.questions.length}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="results-legend">
                  <li><span data-cell="right">✓</span> {t('results.right')}</li>
                  <li><span data-cell="wrong">✗</span> {t('results.wrong')}</li>
                  <li><span data-cell="skipped">–</span> {t('results.skipped')}</li>
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}
