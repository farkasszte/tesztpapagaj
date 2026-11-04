import { emptyDraft, type BoardDraft, type TileSpot } from './peril/draft'

/**
 * A Veszély! tábla terve: a kézzel beosztott mezők, és a kincsesbarlang helye.
 *
 * A terv a böngésző tárolójában él (nem a játék mentésében), mert a tanár a
 * játék **előtt** szerkeszti: nincs még motor, amihez menteni lehetne. Így egy
 * F5 vagy egy bezárt laptop sem viszi el a fél órát, és a következő órán ugyanaz
 * a tábla vár. A sablonok ugyanezt a tervet mentik el névvel.
 */

export type TroveChoice = TileSpot | 'auto' | null

export type PerilPlan = {
  draft: BoardDraft
  /** `'auto'`: a játék választ az első sor alatt; `null`: nincs; pont: az a mező. */
  trove: TroveChoice
}

export type PerilTemplate = {
  id: string
  name: string
  savedAt: number
  plan: PerilPlan
}

const PLAN_KEY = 'tesztpapagaj:peril-plan'
const TEMPLATES_KEY = 'tesztpapagaj:peril-templates'

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A tárhely tele lehet: a tábla szerkesztése ilyenkor sem áll meg.
  }
}

/** Csak azt fogadjuk el tervnek, ami mezőket is tartalmaz, különben üres. */
function isPlan(value: unknown): value is PerilPlan {
  if (!value || typeof value !== 'object') return false
  const plan = value as PerilPlan
  return Array.isArray(plan.draft?.columns) && plan.draft.columns.every((column) => Array.isArray(column.tiles))
}

export function loadPlan(): PerilPlan | null {
  const stored = read<unknown>(PLAN_KEY)
  return isPlan(stored) ? stored : null
}

export function savePlan(plan: PerilPlan): void {
  write(PLAN_KEY, plan)
}

export function clearPlan(): void {
  try {
    window.localStorage.removeItem(PLAN_KEY)
  } catch {
    // Nem baj, ha nem sikerül: a következő mentés felülírja.
  }
}

export function listTemplates(): PerilTemplate[] {
  const stored = read<unknown>(TEMPLATES_KEY)
  if (!Array.isArray(stored)) return []
  return stored.filter((entry): entry is PerilTemplate => {
    const template = entry as PerilTemplate
    return typeof template?.id === 'string' && typeof template?.name === 'string' && isPlan(template.plan)
  })
}

export function saveTemplate(name: string, plan: PerilPlan): PerilTemplate[] {
  const trimmed = name.trim()
  if (!trimmed) return listTemplates()
  const templates = listTemplates().filter((template) => template.name !== trimmed)
  templates.unshift({
    id: `template-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    name: trimmed,
    savedAt: Date.now(),
    plan,
  })
  write(TEMPLATES_KEY, templates.slice(0, 20))
  return listTemplates()
}

export function removeTemplate(id: string): PerilTemplate[] {
  write(
    TEMPLATES_KEY,
    listTemplates().filter((template) => template.id !== id),
  )
  return listTemplates()
}

/** Üres terv: három üres oszlop, automatikus kincsesbarlanggal. */
export const blankPlan = (): PerilPlan => ({ draft: emptyDraft(), trove: 'auto' })
