/**
 * Mappák a kérdésbankokhoz és a dolgozatokhoz.
 *
 * A mappa **nézet-rendezés**, nem a bank tartozéka: a böngésző tárolójában él
 * (`tesztpapagaj:folders`), akárcsak a bank olvasási állapota (kereső, szűrők).
 * Így nincs szükség adatbázis-migrációra, és ugyanaz a mechanizmus rendezi a
 * dolgozatokat is. A törölt mappa tartalma nem vész el: „mappa nélkül” marad.
 */

import { useSyncExternalStore } from 'react'

export type FolderKind = 'exams' | 'question-banks'

export type Folder = {
  id: string
  kind: FolderKind
  name: string
  createdAt: number
}

export type FolderState = {
  folders: Folder[]
  /** `${kind}:${id}` → mappa-azonosító. */
  places: Record<string, string>
}

export const FOLDERS_KEY = 'tesztpapagaj:folders'
/** Egy gyűjteményben ennyi mappa fér el. */
export const MAX_FOLDERS = 24
/** A mappanév hossza: a kártyán és a jelvényen is elférjen. */
export const MAX_FOLDER_NAME = 40

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const placeKey = (kind: FolderKind, id: string) => `${kind}:${id}`

const empty = (): FolderState => ({ folders: [], places: {} })

function parse(raw: string | null): FolderState {
  if (!raw) return empty()
  try {
    const parsed = JSON.parse(raw) as Partial<FolderState>
    const folders = Array.isArray(parsed.folders)
      ? parsed.folders.filter(
          (folder): folder is Folder =>
            !!folder &&
            typeof folder.id === 'string' &&
            typeof folder.name === 'string' &&
            (folder.kind === 'exams' || folder.kind === 'question-banks'),
        )
      : []
    const places =
      parsed.places && typeof parsed.places === 'object' && !Array.isArray(parsed.places)
        ? Object.fromEntries(
            Object.entries(parsed.places).filter(
              ([, value]) => typeof value === 'string',
            ) as [string, string][],
          )
        : {}
    return { folders, places }
  } catch {
    return empty()
  }
}

/**
 * A legutóbb kiolvasott állapot. A felület ezt a **referenciát** figyeli
 * (`useSyncExternalStore`), ezért minden írás új objektumot ad — így a mappa
 * áthelyezése, átnevezése és törlése magától újrarajzol, `setStamp` nélkül.
 */
let cached: FolderState | null = null
/** A gyorsítótár alapja: ugyanarra a tárolt szövegre ugyanaz az objektum. */
let cachedRaw: string | null = null
const listeners = new Set<() => void>()

function write(state: FolderState): void {
  const serialized = JSON.stringify(state)
  cached = state
  const store = storage()
  if (store) {
    try {
      store.setItem(FOLDERS_KEY, serialized)
      cachedRaw = serialized
    } catch {
      // Betelt tároló: a rendezés elmarad, a bankok érintetlenek.
    }
  }
  for (const listener of listeners) listener()
}

/**
 * Az éppen érvényes állapot. A tárolt szöveget minden kéréskor összevetjük: ha
 * nem változott, ugyanazt az objektumot adjuk vissza (ezt várja a
 * `useSyncExternalStore`), ha viszont más fül vagy más kód írta át, újraolvassuk.
 */
export function folderState(): FolderState {
  let raw: string | null = null
  try {
    raw = storage()?.getItem(FOLDERS_KEY) ?? null
  } catch {
    raw = null
  }
  if (cached && cachedRaw === raw) return cached
  cachedRaw = raw
  cached = parse(raw)
  return cached
}

/** A tároló más fülben változott: a gyorsítótár elavult, újraolvassuk. */
export function refreshFolderState(): void {
  cached = null
  folderState()
  for (const listener of listeners) listener()
}

export function subscribeFolders(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Másik fül mappaváltása: a gyorsítótár nem érvényes többé.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === FOLDERS_KEY || event.key === null) refreshFolderState()
  })
}

/** A mappák állapota a komponensekben: írás után magától újrarajzol. */
export function useFolderState(): FolderState {
  return useSyncExternalStore(subscribeFolders, folderState)
}

/** Egy gyűjtemény mappái egy adott állapotból (létrehozás szerint). */
export function foldersIn(state: FolderState, kind: FolderKind): Folder[] {
  return state.folders
    .filter((folder) => folder.kind === kind)
    .sort((left, right) => left.createdAt - right.createdAt)
}

/** Melyik mappában van az elem egy adott állapotban; `null`, ha sehol. */
export function folderIn(state: FolderState, kind: FolderKind, resourceId: string): string | null {
  return state.places[placeKey(kind, resourceId)] ?? null
}

/** Hány elem van a mappában egy adott állapotban. */
export function countIn(state: FolderState, kind: FolderKind, folderId: string): number {
  const prefix = `${kind}:`
  return Object.entries(state.places).filter(
    ([key, value]) => key.startsWith(prefix) && value === folderId,
  ).length
}

/** Egy gyűjtemény mappái, létrehozás szerint. */
export function foldersOf(kind: FolderKind): Folder[] {
  return foldersIn(folderState(), kind)
}

/** Melyik mappában van az elem; `null`, ha sehol. */
export function folderOf(kind: FolderKind, resourceId: string): string | null {
  return folderIn(folderState(), kind, resourceId)
}

/** Az adott mappában lévő elemek azonosítói. */
export function itemsIn(kind: FolderKind, folderId: string): string[] {
  const { places } = folderState()
  return Object.entries(places)
    .filter(([key, value]) => key.startsWith(`${kind}:`) && value === folderId)
    .map(([key]) => key.slice(kind.length + 1))
}

/**
 * Új mappa. Üres vagy csak szóközökből álló névből nem lesz mappa, és ugyanazzal
 * a névvel (kis-nagybetűtől függetlenül) nem jön létre második.
 */
export function createFolder(
  kind: FolderKind,
  name: string,
  now: number = Date.now(),
  createId: () => string = () => crypto.randomUUID(),
): Folder | null {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, MAX_FOLDER_NAME)
  if (clean.length === 0) return null
  const state = folderState()
  const same = state.folders.filter((folder) => folder.kind === kind)
  if (same.length >= MAX_FOLDERS) return null
  if (same.some((folder) => folder.name.toLowerCase() === clean.toLowerCase())) return null
  const folder: Folder = { id: createId(), kind, name: clean, createdAt: now }
  write({ ...state, folders: [...state.folders, folder] })
  return folder
}

/** Átnevezés; üres név nem írja felül a régit. */
export function renameFolder(id: string, name: string): Folder | null {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, MAX_FOLDER_NAME)
  const state = folderState()
  const folder = state.folders.find((entry) => entry.id === id)
  if (!folder || clean.length === 0) return null
  const renamed = { ...folder, name: clean }
  write({ ...state, folders: state.folders.map((entry) => (entry.id === id ? renamed : entry)) })
  return renamed
}

/** Mappa törlése: a benne lévő elemek „mappa nélkül” maradnak, nem tűnnek el. */
export function removeFolder(id: string): void {
  const state = folderState()
  write({
    folders: state.folders.filter((folder) => folder.id !== id),
    places: Object.fromEntries(Object.entries(state.places).filter(([, folderId]) => folderId !== id)),
  })
}

/** Elem áthelyezése; `null` = mappa nélkül. */
export function placeInFolder(kind: FolderKind, resourceId: string, folderId: string | null): void {
  const state = folderState()
  const places = { ...state.places }
  if (folderId === null || !state.folders.some((folder) => folder.id === folderId && folder.kind === kind)) {
    delete places[placeKey(kind, resourceId)]
  } else {
    places[placeKey(kind, resourceId)] = folderId
  }
  write({ ...state, places })
}
