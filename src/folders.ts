/**
 * Mappák a kérdésbankokhoz és a dolgozatokhoz.
 *
 * A mappa **nézet-rendezés**, nem a bank tartozéka: a böngésző tárolójában él
 * (`tesztpapagaj:folders`), akárcsak a bank olvasási állapota (kereső, szűrők).
 * Így nincs szükség adatbázis-migrációra, és ugyanaz a mechanizmus rendezi a
 * dolgozatokat is. A törölt mappa tartalma nem vész el: „mappa nélkül” marad.
 */

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

function read(): FolderState {
  const store = storage()
  if (!store) return { folders: [], places: {} }
  try {
    const raw = store.getItem(FOLDERS_KEY)
    if (!raw) return { folders: [], places: {} }
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
    return { folders: [], places: {} }
  }
}

function write(state: FolderState): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(FOLDERS_KEY, JSON.stringify(state))
  } catch {
    // Betelt tároló: a rendezés elmarad, a bankok érintetlenek.
  }
}

/** Egy gyűjtemény mappái, létrehozás szerint. */
export function foldersOf(kind: FolderKind): Folder[] {
  return read().folders.filter((folder) => folder.kind === kind).sort((a, b) => a.createdAt - b.createdAt)
}

/** Melyik mappában van az elem; `null`, ha sehol. */
export function folderOf(kind: FolderKind, resourceId: string): string | null {
  return read().places[placeKey(kind, resourceId)] ?? null
}

/** Az adott mappában lévő elemek azonosítói. */
export function itemsIn(kind: FolderKind, folderId: string): string[] {
  const { places } = read()
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
  const state = read()
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
  const state = read()
  const folder = state.folders.find((entry) => entry.id === id)
  if (!folder || clean.length === 0) return null
  const renamed = { ...folder, name: clean }
  write({ ...state, folders: state.folders.map((entry) => (entry.id === id ? renamed : entry)) })
  return renamed
}

/** Mappa törlése: a benne lévő elemek „mappa nélkül” maradnak, nem tűnnek el. */
export function removeFolder(id: string): void {
  const state = read()
  write({
    folders: state.folders.filter((folder) => folder.id !== id),
    places: Object.fromEntries(Object.entries(state.places).filter(([, folderId]) => folderId !== id)),
  })
}

/** Elem áthelyezése; `null` = mappa nélkül. */
export function placeInFolder(kind: FolderKind, resourceId: string, folderId: string | null): void {
  const state = read()
  const places = { ...state.places }
  if (folderId === null || !state.folders.some((folder) => folder.id === folderId && folder.kind === kind)) {
    delete places[placeKey(kind, resourceId)]
  } else {
    places[placeKey(kind, resourceId)] = folderId
  }
  write({ ...state, places })
}
