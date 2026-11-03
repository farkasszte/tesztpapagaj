import { useState } from 'react'
import {
  addColumn,
  clearTile,
  MAX_COLUMNS,
  placeQuestion,
  removeColumn,
  renameColumn,
  swapTiles,
  TILES_PER_COLUMN,
  type BoardDraft,
} from './game/peril/draft'
import { autoDraft, placedQuestions } from './game/peril-board'
import type { Question } from './game/types'
import { useT } from './i18n'

/**
 * A Veszély! táblájának kézi beosztása.
 *
 * A Class Gauntlet táblaépítőjének a logikája: a bal oldalon a készlet még
 * kint nem lévő kérdései, a jobb oldalon a hat oszlop öt mezővel. Egy mezőre
 * koppintva kijelölöd, majd egy kérdésre koppintva odakerül; egy kész mezőre
 * koppintva „kézbe veszed”, és a következő mezőre koppintva helyet cserélnek.
 * A mező értéke a helyéből jön: 100, 200, 300, 400, 500.
 */

type Spot = { column: number; row: number }

export function PerilBoardBuilder({
  draft,
  questions,
  onChange,
}: {
  draft: BoardDraft
  questions: readonly Question[]
  onChange: (draft: BoardDraft) => void
}) {
  const t = useT()
  const [spot, setSpot] = useState<Spot | null>(null)
  const placed = placedQuestions(draft)
  const free = questions.filter((question) => !placed.has(question.id))
  const byId = new Map(questions.map((question) => [question.id, question] as const))
  const columnLabel = (index: number) => t('game.peril.column', { n: index + 1 })

  const emptySpot = (): Spot | null => {
    for (let column = 0; column < draft.columns.length; column += 1) {
      const row = draft.columns[column].tiles.indexOf(null)
      if (row >= 0) return { column, row }
    }
    return null
  }

  const place = (id: string) => {
    const target = spot ?? emptySpot()
    if (!target) return
    onChange(placeQuestion(draft, target.column, target.row, id))
    setSpot(null)
  }

  /** Üres mező: kijelöl. Kész mező: kézbe vesz. Kijelölt mezőre: helycsere. */
  const clickTile = (tile: Spot) => {
    if (spot && (spot.column !== tile.column || spot.row !== tile.row)) {
      onChange(swapTiles(draft, spot, tile))
      setSpot(null)
      return
    }
    setSpot(spot && spot.column === tile.column && spot.row === tile.row ? null : tile)
  }

  const spotQuestion = spot ? byId.get(draft.columns[spot.column]?.tiles[spot.row] ?? '') : undefined

  return (
    <section className="gq-builder" aria-label={t('game.peril.builder')}>
      <div className="gq-builder-head">
        <div>
          <h2 className="gq-builder-title">{t('game.peril.builder')}</h2>
          <p className="gq-hint">{t('game.peril.builderHint')}</p>
        </div>
        <div className="gq-builder-tools">
          <span className="gq-builder-count">
            {t('game.peril.builderCount', { placed: placed.size, total: questions.length })}
          </span>
          <button
            type="button"
            className="gq-quiet"
            onClick={() => {
              onChange(autoDraft(questions, { untitled: columnLabel }))
              setSpot(null)
            }}
          >
            {t('game.peril.autoFill')}
          </button>
        </div>
      </div>

      <div className="gq-builder-board">
        {draft.columns.map((column, columnIndex) => (
          <div key={columnIndex} className="gq-builder-column">
            <div className="gq-builder-column-head">
              <input
                className="gq-input gq-builder-column-title"
                aria-label={t('game.peril.columnTitle', { n: columnIndex + 1 })}
                placeholder={columnLabel(columnIndex)}
                value={column.title}
                onChange={(event) => onChange(renameColumn(draft, columnIndex, event.target.value))}
              />
              {draft.columns.length > 1 ? (
                <button
                  type="button"
                  className="gq-builder-x"
                  aria-label={t('game.peril.removeColumn', { n: columnIndex + 1 })}
                  onClick={() => {
                    onChange(removeColumn(draft, columnIndex))
                    setSpot(null)
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
            {column.tiles.map((id, row) => {
              const question = id ? byId.get(id) : undefined
              const selected = spot?.column === columnIndex && spot.row === row
              return (
                <button
                  key={row}
                  type="button"
                  className="gq-builder-tile"
                  data-filled={question ? 'yes' : 'no'}
                  data-picked={selected ? 'yes' : 'no'}
                  aria-pressed={selected}
                  aria-label={t('game.peril.tileLabel', {
                    value: (row + 1) * 100,
                    title: question?.prompt ?? t('game.peril.emptyTile'),
                  })}
                  onClick={() => clickTile({ column: columnIndex, row })}
                >
                  <span className="gq-builder-value">{(row + 1) * 100}</span>
                  <span className="gq-builder-words">
                    {question ? question.prompt : t('game.peril.emptyTile')}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
        {draft.columns.length < MAX_COLUMNS ? (
          <button
            type="button"
            className="gq-builder-add"
            onClick={() => onChange(addColumn(draft))}
          >
            + {t('game.peril.addColumn')}
          </button>
        ) : null}
      </div>

      {spot && spotQuestion ? (
        <div className="gq-builder-picked">
          <span>
            {t('game.peril.pickedTile', {
              value: (spot.row + 1) * 100,
              title: spotQuestion.prompt,
            })}
          </span>
          <button
            type="button"
            className="gq-quiet"
            onClick={() => {
              onChange(clearTile(draft, spot.column, spot.row))
              setSpot(null)
            }}
          >
            {t('game.peril.takeOff')}
          </button>
        </div>
      ) : null}

      <div className="gq-builder-pool">
        <h3 className="gq-builder-pool-title">{t('game.peril.freeQuestions')}</h3>
        {free.length === 0 ? (
          <p className="gq-hint">{t('game.peril.allPlaced')}</p>
        ) : (
          <ul className="gq-builder-list">
            {free.map((question) => (
              <li key={question.id}>
                <button type="button" className="gq-builder-question" onClick={() => place(question.id)}>
                  {question.prompt}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export const PERIL_BUILDER_TILES = TILES_PER_COLUMN
