// The Exam's Page Margins, set from the Format menu (ADR-0039).
//
// Shaped like a design tool's inspector: one number field sets all four sides
// at once, and a toggle beside it opens a field for each side. When the sides
// differ the combined field says "Mixed", and setting it sets every side.
// Every field scrubs: press on its label or icon — or on the field itself
// before it has focus — and drag sideways, and the value follows the pointer
// (`scrub-number.ts`); a press that does not move is a click, and puts the
// caret in the field to type. Nothing waits for a confirm: every change is the
// Exam's at once, and the sheet behind the panel reflows to it.
//
// A floating panel rather than rows in the Format menu itself: a menu closes on
// any scroll, and a sheet that loses a page as its margins shrink scrolls under
// the pointer mid-drag. The panel stays until Escape, its close button, or a
// press outside it.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { PanelBottom, PanelLeft, PanelRight, PanelTop, SquareDashed, X } from 'lucide-react'
import type { MenuPoint } from './context-menu'
import { MarginsIcon } from './format-icons'
import {
  MARGIN_SIDES,
  MARGIN_SIDE_LABELS,
  marginUnit,
  MAX_MARGIN,
  MIN_MARGIN,
  clampMargin,
  marginsOf,
  uniformMarginOf,
  type MarginSide,
  type PageMargins,
} from './page-margins'
import { scrubRaw, scrubValue, startsScrub, steppedValue, type ScrubRange } from './scrub-number'
import { t } from './i18n'

const SIDE_ICONS: Record<MarginSide, ReactNode> = {
  top: <PanelTop />,
  right: <PanelRight />,
  bottom: <PanelBottom />,
  left: <PanelLeft />,
}

/** Set on the page while a field scrubs, so the cursor stays a resize arrow
 *  wherever the pointer strays. */
const SCRUBBING_CLASS = 'margins-scrubbing'

/** Set on the page while the panel is open: every sheet draws its margins. */
const MARGIN_GUIDES_CLASS = 'margins-guides'

/** A margin as the field shows it, in the panel's unit: never a float's tail. */
function formatMargin(value: number, decimals: number): string {
  const factor = 10 ** decimals
  return String(Math.round(value * factor) / factor)
}

const VIEWPORT_MARGIN = 8

/** One press on a field's label or unfocused field, from pointer-down to up:
 *  a click until it travels far enough sideways, a scrub from then on. */
type Gesture = {
  pointerId: number
  startX: number
  lastX: number
  /** The value as dragged so far, before it is snapped to a step. */
  raw: number
  /** The value last set, so a pixel that changes nothing sets nothing. */
  shown: number
  scrubbing: boolean
  /** Whether this drag has set a value yet: its first change makes the undo
   *  step and the rest join it (`continuing`). */
  changed: boolean
}

/** One field in inches, for one side or for all, that scrubs and types. */
function MarginControl({
  label,
  icon,
  value,
  from,
  disabled,
  onChange,
}: {
  label: string
  icon: ReactNode
  /** The inches it shows, or `null` for sides that differ. */
  value: number | null
  /** Where a scrub or an arrow key starts when it shows "Mixed". */
  from: number
  disabled: boolean
  onChange: (inches: number, continuing: boolean) => void
}) {
  const input = useRef<HTMLInputElement | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  // The stored value is inches; the field shows the panel's own unit, so every
  // read crosses into it and every write comes back.
  const unit = marginUnit()
  const toUnit = (inches: number) => inches * unit.perInch
  const fromUnit = (shown: number) => clampMargin(shown / unit.perInch)
  const range: ScrubRange = {
    min: MIN_MARGIN * unit.perInch,
    max: MAX_MARGIN * unit.perInch,
    step: unit.step,
    coarseStep: unit.coarseStep,
  }
  const shown = value === null ? '' : formatMargin(toUnit(value), unit.decimals)
  const current = toUnit(value ?? from)

  // A panel closed mid-drag leaves no resize cursor behind.
  useEffect(() => () => document.body.classList.remove(SCRUBBING_CLASS), [])

  const commit = (text: string) => {
    setDraft(null)
    const typed = Number.parseFloat(text)
    if (!Number.isFinite(typed)) return
    onChange(fromUnit(typed), false)
  }

  const endGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = gesture.current
    if (!drag || drag.pointerId !== event.pointerId) return null
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    document.body.classList.remove(SCRUBBING_CLASS)
    return drag
  }

  // The same gesture on the label, the icon and the unfocused field. The
  // press keeps focus where it was, so a drag never opens the field for
  // typing; only a press that stays put does, on release.
  const scrubHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return
      // A focused field is being typed in: a press there places the caret.
      if (event.currentTarget === input.current && document.activeElement === input.current) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      gesture.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        lastX: event.clientX,
        raw: current,
        shown: current,
        scrubbing: false,
        changed: false,
      }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = gesture.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (!drag.scrubbing) {
        if (!startsScrub(event.clientX - drag.startX)) return
        drag.scrubbing = true
        setDraft(null)
        document.body.classList.add(SCRUBBING_CLASS)
      }
      drag.raw = scrubRaw(drag.raw, event.clientX - drag.lastX, event.shiftKey, range)
      drag.lastX = event.clientX
      const next = scrubValue(drag.raw, event.shiftKey, range)
      if (next === drag.shown) return
      drag.shown = next
      onChange(fromUnit(next), drag.changed)
      drag.changed = true
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = endGesture(event)
      if (drag && !drag.scrubbing) {
        input.current?.focus()
        input.current?.select()
      }
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => { endGesture(event) },
  }

  return (
    <div className="margins-row" data-disabled={disabled || undefined}>
      <span className="margins-row-label" title={t('margins.dragHint')} {...scrubHandlers}>
        {label}
      </span>
      <span className="margins-field">
        <span className="margins-row-icon" aria-hidden="true" {...scrubHandlers}>{icon}</span>
        <input
          ref={input}
          type="text"
          inputMode="decimal"
          className="margins-input"
          aria-label={t('margins.ariaLabel', { side: label, unit: unit.suffix })}
          aria-valuetext={value === null
            ? t('margins.mixed')
            : t('margins.valueText', { value: formatMargin(toUnit(value), unit.decimals), unit: unit.suffix })}
          value={draft ?? shown}
          placeholder={value === null ? t('margins.mixed') : undefined}
          disabled={disabled}
          {...scrubHandlers}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => { if (draft !== null) commit(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit(event.currentTarget.value)
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              setDraft(null)
              onChange(fromUnit(steppedValue(current, event.key === 'ArrowUp' ? 1 : -1, event.shiftKey, range)), false)
            } else if (event.key === 'Escape' && draft !== null) {
              // The first Escape abandons what was typed; the next closes.
              event.stopPropagation()
              setDraft(null)
            }
          }}
        />
        {(value !== null || draft !== null) && <span className="margins-unit" aria-hidden="true">{unit.suffix}</span>}
      </span>
    </div>
  )
}

export function MarginsPanel({
  point,
  margins,
  disabled = false,
  onChange,
  onClose,
}: {
  point: MenuPoint
  margins: PageMargins | undefined
  disabled?: boolean
  /** Sets `sides` to `inches`; `continuing` a drag that already made its step. */
  onChange: (sides: readonly MarginSide[], inches: number, continuing: boolean) => void
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<MenuPoint>(point)
  const resolved = marginsOf(margins)
  const uniform = uniformMarginOf(margins)
  // Open on each side when the sides already differ: that is what there is
  // to see. Otherwise the one control is the whole of it until asked.
  const [expanded, setExpanded] = useState(uniform === null)

  // Clamped into the viewport before it paints, like the menu it came from.
  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    const maxX = window.innerWidth - element.offsetWidth - VIEWPORT_MARGIN
    const maxY = window.innerHeight - element.offsetHeight - VIEWPORT_MARGIN
    setPosition({
      x: Math.max(VIEWPORT_MARGIN, Math.min(point.x, maxX)),
      y: Math.max(VIEWPORT_MARGIN, Math.min(point.y, maxY)),
    })
  }, [point, expanded])

  // The panel itself takes focus, not a field: a focused field types rather
  // than scrubs, and Escape still closes from here.
  useEffect(() => {
    panel.current?.focus()
  }, [])

  // While the panel is open every page draws its margins as a dashed line,
  // following each change as it is dragged or typed, so the teacher sees where
  // the edge of the text will fall rather than only the reflow it causes.
  useEffect(() => {
    document.body.classList.add(MARGIN_GUIDES_CLASS)
    return () => document.body.classList.remove(MARGIN_GUIDES_CLASS)
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  return createPortal(
    <div
      ref={panel}
      className="margins-panel"
      role="dialog"
      aria-label={t('editor.margins')}
      tabIndex={-1}
      style={{ left: position.x, top: position.y }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
    >
      <div className="margins-panel-header">
        <span className="margins-panel-title">
          <MarginsIcon className="margins-panel-icon" />
          {t('editor.margins')}
        </span>
        <button
          type="button"
          className="margins-panel-close"
          aria-label={t('ui.closeMargins')}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="margins-combined">
        <MarginControl
          label={t('margins.allSides')}
          icon={<MarginsIcon />}
          value={uniform}
          // Mixed sides scrub from their average, so a drag either way is a
          // real change for every side.
          from={clampMargin(MARGIN_SIDES.reduce((sum, side) => sum + resolved[side], 0) / MARGIN_SIDES.length)}
          disabled={disabled}
          onChange={(inches, continuing) => onChange(MARGIN_SIDES, inches, continuing)}
        />
        <button
          type="button"
          className="margins-expand"
          aria-label={t('editor.setEachSide')}
          title={t('editor.setEachSide')}
          aria-expanded={expanded}
          aria-pressed={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <SquareDashed aria-hidden="true" />
        </button>
      </div>
      {expanded && (
        <div className="margins-sides" role="group" aria-label={t('editor.eachSide')}>
          {MARGIN_SIDES.map((side) => (
            <MarginControl
              key={side}
              label={MARGIN_SIDE_LABELS[side]}
              icon={SIDE_ICONS[side]}
              value={resolved[side]}
              from={resolved[side]}
              disabled={disabled}
              onChange={(inches, continuing) => onChange([side], inches, continuing)}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
