import { accountBackupBlob, readAccountBackup, type AccountSnapshot } from './account-backup'
import {
  BACKUP_FOLDER,
  BACKUP_INTERVAL_MS,
  KEEP_COPIES,
  type DriveApi,
  type DriveFile,
} from './google-drive'

/**
 * A Drive-mentés szabálya: mi az esedékes, mi kerül fel, meddig marad meg.
 *
 * A hálózat itt is injektált (`DriveApi`), ezért a szabály valódi Drive nélkül
 * tesztelhető. A könyvelés a böngésző tárolójában él (`tesztpapagaj:drive`),
 * és a fiókmentés is viszi.
 */

export const DRIVE_STATE_KEY = 'tesztpapagaj:drive'
/** A könyvelés változott: a fejléc jelzője ebből tudja, hogy újra kell olvasni. */
export const DRIVE_CHANGED_EVENT = 'tesztpapagaj:drive-changed'

function announce(): void {
  try {
    globalThis.dispatchEvent?.(new Event(DRIVE_CHANGED_EVENT))
  } catch {
    // Esemény nélkül is működik: a jelző a következő nyitáskor frissül.
  }
}

export type DriveState = {
  /** A tanár egyszer már csatlakoztatta a Drive-ot. */
  enabled: boolean
  /** Az utolsó sikeres feltöltés ideje (ms). */
  lastUploadAt: number | null
  /** A mappa azonosítója, hogy ne kelljen minden alkalommal keresni. */
  folderId: string | null
  /** Az utolsó csomag neve, hogy a felület meg tudja mutatni. */
  lastFileName: string | null
}

const EMPTY: DriveState = { enabled: false, lastUploadAt: null, folderId: null, lastFileName: null }

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadDriveState(): DriveState {
  const store = storage()
  if (!store) return { ...EMPTY }
  try {
    const raw = store.getItem(DRIVE_STATE_KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<DriveState>
    return {
      enabled: parsed.enabled === true,
      lastUploadAt: typeof parsed.lastUploadAt === 'number' ? parsed.lastUploadAt : null,
      folderId: typeof parsed.folderId === 'string' ? parsed.folderId : null,
      lastFileName: typeof parsed.lastFileName === 'string' ? parsed.lastFileName : null,
    }
  } catch {
    return { ...EMPTY }
  }
}

export function saveDriveState(next: Partial<DriveState>): DriveState {
  const state = { ...loadDriveState(), ...next }
  const store = storage()
  try {
    store?.setItem(DRIVE_STATE_KEY, JSON.stringify(state))
  } catch {
    // Betelt tároló: a mentés ettől még megtörtént, csak nem emlékszünk rá.
  }
  announce()
  return state
}

/** Esedékes-e a csendes mentés a megnyitáskor. */
export function backupDue(state: DriveState, now: number = Date.now()): boolean {
  if (!state.enabled) return false
  if (state.lastUploadAt === null) return true
  return now - state.lastUploadAt >= BACKUP_INTERVAL_MS
}

/** A csomag neve: a fájlnév rendezhető és felismerhető a Drive-on. */
export function backupFilename(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `tesztpapagaj-biztonsagi-masolat-${day}-${time}.zip`
}

export type BackupResult = {
  file: DriveFile
  folderId: string
  /** Hány régi csomagot töröltünk, hogy megmaradjon a tíz. */
  removed: number
  state: DriveState
}

/**
 * Egy csomag felvitele, a régiek ritkítása, és a könyvelés frissítése.
 * A `snapshot` a `captureAccount()` eredménye.
 */
export async function backUpToDrive({
  api,
  snapshot,
  now = Date.now(),
  keep = KEEP_COPIES,
}: {
  api: DriveApi
  snapshot: AccountSnapshot
  now?: number
  keep?: number
}): Promise<BackupResult> {
  const folderId = await api.ensureFolder(BACKUP_FOLDER)
  const blob = await accountBackupBlob(snapshot)
  const file = await api.upload(folderId, backupFilename(new Date(now)), blob)
  // A frissen feltöltött az első: azon túl a régiek mennek.
  const files = await api.list(folderId)
  const extra = files.filter((entry) => entry.id !== file.id).slice(Math.max(0, keep - 1))
  for (const entry of extra) await api.remove(entry.id)
  const state = saveDriveState({
    enabled: true,
    lastUploadAt: now,
    folderId,
    lastFileName: file.name,
  })
  return { file, folderId, removed: extra.length, state }
}

/** A Drive-on lévő csomagok, a legújabb elöl. */
export async function driveBackups(api: DriveApi): Promise<DriveFile[]> {
  const folderId = await api.ensureFolder(BACKUP_FOLDER)
  return api.list(folderId)
}

/** Egy csomag letöltése és beolvasása — a meglévő visszaállítási úthoz. */
export async function readBackupFromDrive(api: DriveApi, fileId: string): Promise<AccountSnapshot> {
  return readAccountBackup(await api.download(fileId))
}

/** Leválasztás: a könyvelés törlése (a Drive-on lévő csomagok megmaradnak). */
export function forgetDrive(): void {
  const store = storage()
  try {
    store?.removeItem(DRIVE_STATE_KEY)
  } catch {
    // Nem baj: a következő betöltés üres állapotból indul.
  }
  announce()
}
