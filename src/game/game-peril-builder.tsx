import { useState, type DragEvent } from 'react'
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
  type TileSpot,
} from './peril/draft'
import { autoDraft, difficultyDraft, hasDifficulty, placedQuestions } from './peril-board'
import type { PerilPlan, PerilTemplate, TroveChoice } from './peril-plan'
import type { Question } from './types'
import { useT } from '../i18n/index'

/**
 * A Veszély! táblájának kézi beosztása.
 *
 * A Class Gauntlet táblaépítőjének a logikája: a tábla alatt a készlet még kint
 * nem lévő kérdései, a táblán hat oszlop öt mezővel. Egy mezőre koppintva
 * kijelölöd, majd egy kérdésre koppintva odakerül; egy kész mezőre koppintva
 * „kézbe veszed”, és a következő mezőre koppintva helyet cserélnek. Ugyanez
 * húzással is megy: a mezőt vagy a készlet kérdését a célmezőre húzod.
 *
 * A mező értéke a helyéből jön (100…500). A **terv** a mezőkön kívül a
 * kincsesbarlang helyét is hordozza, és a böngésző tárolójában marad; a
 * **sablonok** ugyanezt a tervet mentik el névvel a következő órára.
 */

type DragPayload =
  | { kind: 'tile'; spot: TileSpot }
  | { kind: 'question'; id: string }

const DRAG_TYPE = 'application/x-teszpapagaj'

export function PerilBoardBuilder({
  plan,
  questions,
  onChange,
  templates,
  onSaveTemplate,
  onLoadTemplate,
  onRemoveTemplate,
}: {
  plan: PerilPlan
  questions: readonly Question[]
  onChange: (plan: PerilPlan) => void
  templates: PerilTemplate[]
  onSaveTemplate: (name: string) => void
  onLoadTemplate: (plan: PerilPlan) => void
  onRemoveTemplate: (id: string) => void
}) {
  const t = useT()
  const [spot, setSpot] = useState<TileSpot | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [dragging, setDragging] = useState<DragPayload | null>(null)
  const [over, setOver] = useState<string>('')

  const draft = plan.draft
  const placed = placedQuestions(draft)
  const free = questions.filter((question) => !placed.has(question.id))
  const byId = new Map(questions.map((question) => [question.id, question] as const))
  const columnLabel = (index: number) => t('game.peril.column', { n: index + 1 })

  const setDraft = (next: BoardDraft) => onChange({ ...plan, draft: next })
  const setTrove = (trove: TroveChoice) => onChange({ ...plan, trove })

  const emptySpot = (): TileSpot | null => {
    for (let column = 0; column < draft.columns.length; column += 1) {
      const row = draft.columns[column].tiles.indexOf(null)
      if (row >= 0) return { column, row }
    }
    return null
  }

  const place = (id: string) => {
    const target = spot ?? emptySpot()
    if (!target) return
    setDraft(placeQuestion(draft, target.column, target.row, id))
    setSpot(null)
  }

  /** Üres mező: kijelöl. Kész mező: kézbe vesz. Kijelölt mezőre: helycsere. */
  const clickTile = (tile: TileSpot) => {
    if (spot && (spot.column !== tile.column || spot.row !== tile.row)) {
      setDraft(swapTiles(draft, spot, tile))
      setSpot(null)
      return
    }
    setSpot(spot && spot.column === tile.column && spot.row === tile.row ? null : tile)
  }

  const dropOn = (tile: TileSpot, payload: DragPayload | null) => {
    if (!payload) return
    if (payload.kind === 'tile') setDraft(swapTiles(draft, payload.spot, tile))
    else setDraft(placeQuestion(draft, tile.column, tile.row, payload.id))
    setSpot(null)
  }

  const readPayload = (event: DragEvent): DragPayload | null => {
    try {
      const raw = event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData('text/plain')
      return raw ? (JSON.parse(raw) as DragPayload) : null
    } catch {
      return null
    }
  }

  const troveKey = (tile: TileSpot) => `${tile.column}:${tile.row}`
  const troveAt = (tile: TileSpot) =>
    typeof plan.trove === 'object' && plan.trove !== null && plan.trove.column === tile.column && plan.trove.row === tile.row

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
              setDraft(autoDraft(questions, { untitled: columnLabel }))
              setSpot(null)
            }}
          >
            {t('game.peril.autoFill')}
          </button>
          <button
            type="button"
            className="gq-quiet"
            disabled={!hasDifficulty(questions)}
            title={hasDifficulty(questions) ? t('game.peril.byDifficultyHint') : t('game.peril.noDifficulty')}
            onClick={() => {
              setDraft(difficultyDraft(questions, { untitled: columnLabel }))
              setSpot(null)
            }}
          >
            {t('game.peril.byDifficulty')}
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
                onChange={(event) => setDraft(renameColumn(draft, columnIndex, event.target.value))}
              />
              {draft.columns.length > 1 ? (
                <button
                  type="button"
                  className="gq-builder-x"
                  aria-label={t('game.peril.removeColumn', { n: columnIndex + 1 })}
                  onClick={() => {
                    setDraft(removeColumn(draft, columnIndex))
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
              const tile = { column: columnIndex, row }
              const trove = troveAt(tile)
              return (
                <div
                  key={row}
                  className="gq-builder-slot"
                  data-over={over === troveKey(tile) ? 'yes' : 'no'}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setOver(troveKey(tile))
                  }}
                  onDragLeave={() => setOver('')}
                  onDrop={(event) => {
                    event.preventDefault()
                    setOver('')
                    dropOn(tile, dragging ?? readPayload(event))
                    setDragging(null)
                  }}
                >
                  <button
                    type="button"
                    className="gq-builder-tile"
                    data-filled={question ? 'yes' : 'no'}
                    data-picked={selected ? 'yes' : 'no'}
                    data-trove={trove ? 'yes' : 'no'}
                    aria-pressed={selected}
                    draggable={Boolean(question)}
                    onDragStart={(event) => {
                      if (!question) return
                      const payload: DragPayload = { kind: 'tile', spot: tile }
                      event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
                      event.dataTransfer.setData('text/plain', JSON.stringify(payload))
                      setDragging(payload)
                    }}
                    onDragEnd={() => setDragging(null)}
                    aria-label={t('game.peril.tileLabel', {
                      value: (row + 1) * 100,
                      title: question?.prompt ?? t('game.peril.emptyTile'),
                    })}
                    onClick={() => clickTile(tile)}
                  >
                    <span className="gq-builder-value">{(row + 1) * 100}</span>
                    <span className="gq-builder-words">
                      {question ? question.prompt : t('game.peril.emptyTile')}
                    </span>
                  </button>
                  {/* A kincsesbarlang csak az első sor alatt lehet: a legfelső
                      mezőn nincs jelölő, mert ott a játék nem tenné oda. */}
                  {row > 0 ? (
                    <button
                      type="button"
                      className="gq-builder-trove"
                      data-on={trove ? 'yes' : 'no'}
                      aria-label={t('game.peril.troveHere')}
                      aria-pressed={trove}
                      title={t('game.peril.troveHere')}
                      onClick={() => setTrove(trove ? 'auto' : tile)}
                    >
                      ★
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        ))}
        {draft.columns.length < MAX_COLUMNS ? (
          <button type="button" className="gq-builder-add" onClick={() => setDraft(addColumn(draft))}>
            + {t('game.peril.addColumn')}
          </button>
        ) : null}
      </div>

      <div className="gq-builder-trove-row">
        <label>
          <input
            type="checkbox"
            checked={plan.trove !== null}
            onChange={(event) => setTrove(event.target.checked ? 'auto' : null)}
          />
          {t('game.peril.trove')}
        </label>
        <span className="gq-hint">
          {plan.trove === null
            ? t('game.peril.troveOff')
            : typeof plan.trove === 'object' && plan.trove !== null
              ? t('game.peril.tileLabel', { value: (plan.trove.row + 1) * 100, title: t('game.peril.trove') })
              : t('game.peril.troveAuto')}
        </span>
      </div>

      {spot && spotQuestion ? (
        <div className="gq-builder-picked">
          <span>{t('game.peril.pickedTile', { value: (spot.row + 1) * 100, title: spotQuestion.prompt })}</span>
          <button
            type="button"
            className="gq-quiet"
            onClick={() => {
              setDraft(clearTile(draft, spot.column, spot.row))
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
                <button
                  type="button"
                  className="gq-builder-question"
                  draggable
                  onDragStart={(event) => {
                    const payload: DragPayload = { kind: 'question', id: question.id }
                    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
                    event.dataTransfer.setData('text/plain', JSON.stringify(payload))
                    setDragging(payload)
                  }}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => place(question.id)}
                >
                  {question.prompt}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="gq-builder-templates">
        <h3 className="gq-builder-pool-title">{t('game.peril.templates')}</h3>
        <div className="gq-builder-save">
          <input
            className="gq-input gq-input-small"
            aria-label={t('game.peril.templateName')}
            placeholder={t('game.peril.templateName')}
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
          />
          <button
            type="button"
            className="gq-quiet"
            disabled={!templateName.trim()}
            onClick={() => {
              onSaveTemplate(templateName)
              setTemplateName('')
            }}
          >
            {t('game.peril.templateSave')}
          </button>
        </div>
        {templates.length === 0 ? (
          <p className="gq-hint">{t('game.peril.templateEmpty')}</p>
        ) : (
          <ul className="gq-builder-list">
            {templates.map((template) => (
              <li key={template.id} className="gq-builder-template">
                <button
                  type="button"
                  className="gq-builder-question"
                  onClick={() => onLoadTemplate(template.plan)}
                >
                  {template.name}
                </button>
                <button
                  type="button"
                  className="gq-builder-x"
                  aria-label={t('game.peril.templateRemove', { name: template.name })}
                  onClick={() => onRemoveTemplate(template.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="gq-hint">{t('game.peril.draftSaved')}</p>
      </div>
    </section>
  )
}

export const PERIL_BUILDER_TILES = TILES_PER_COLUMN
