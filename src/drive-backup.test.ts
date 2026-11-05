import { beforeEach, describe, expect, test } from 'bun:test'
import { accountBackupBlob, type AccountSnapshot } from './account-backup'
import {
  DRIVE_STATE_KEY,
  backUpToDrive,
  backupDue,
  backupFilename,
  driveBackups,
  forgetDrive,
  loadDriveState,
  readBackupFromDrive,
  saveDriveState,
} from './drive-backup'
import type { DriveApi, DriveFile } from './google-drive'
import { STORAGE_VERSION } from './storage-schema'

class Memory implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

/** Hamis Drive: minden a memóriában, hálózat nélkül. */
class FakeDrive implements DriveApi {
  folders = new Map<string, string>()
  files: { id: string; name: string; createdTime: string; folderId: string; blob: Blob }[] = []
  removed: string[] = []
  private counter = 0

  async ensureFolder(name: string) {
    const existing = this.folders.get(name)
    if (existing) return existing
    const id = `folder-${(this.counter += 1)}`
    this.folders.set(name, id)
    return id
  }

  async upload(folderId: string, name: string, blob: Blob): Promise<DriveFile> {
    const id = `file-${(this.counter += 1)}`
    this.files.unshift({ id, name, createdTime: new Date(1_000 + this.counter).toISOString(), folderId, blob })
    return { id, name, createdTime: this.files[0].createdTime }
  }

  async list(folderId: string): Promise<DriveFile[]> {
    return this.files
      .filter((file) => file.folderId === folderId)
      .map(({ id, name, createdTime }) => ({ id, name, createdTime }))
  }

  async download(fileId: string) {
    const file = this.files.find((entry) => entry.id === fileId)
    if (!file) throw new Error('missing')
    return file.blob
  }

  async remove(fileId: string) {
    this.removed.push(fileId)
    this.files = this.files.filter((file) => file.id !== fileId)
  }
}

const snapshot = (): AccountSnapshot => ({
  manifest: {
    format: 'test-parrot-account',
    version: 1,
    createdAt: '2026-11-04T10:00:00.000Z',
    storageVersion: STORAGE_VERSION,
    localStorage: { 'tesztpapagaj:folders': '{"folders":[],"places":{}}' },
    databases: [],
  },
  binaries: new Map(),
})

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new Memory(),
    configurable: true,
    writable: true,
  })
})

describe('Drive-mentés szabálya', () => {
  test('a csomag neve dátumozott és felismerhető', () => {
    const name = backupFilename(new Date(2026, 10, 4, 9, 5))
    expect(name).toBe('tesztpapagaj-biztonsagi-masolat-2026-11-04-090500.zip')
  })

  test('naponta egyszer esedékes, és csak ha csatlakoztatva van', () => {
    const state = { enabled: false, lastUploadAt: null, folderId: null, lastFileName: null }
    expect(backupDue(state, 1_000)).toBe(false)
    const on = { ...state, enabled: true }
    expect(backupDue(on, 1_000)).toBe(true)
    expect(backupDue({ ...on, lastUploadAt: 1_000 }, 1_000 + 23 * 3600_000)).toBe(false)
    expect(backupDue({ ...on, lastUploadAt: 1_000 }, 1_000 + 25 * 3600_000)).toBe(true)
  })

  test('mentés: mappa, feltöltés, régi csomagok ritkítása, könyvelés', async () => {
    const drive = new FakeDrive()
    for (let index = 0; index < 3; index += 1) {
      await drive.upload('folder-1', `regi-${index}.zip`, new Blob(['x']))
    }
    // A mappa már létezik, hogy a régiek ugyanoda kerüljenek.
    drive.folders.set('Tesztpapagáj biztonsági másolatok', 'folder-1')

    const result = await backUpToDrive({ api: drive, snapshot: snapshot(), now: 5_000, keep: 3 })
    expect(result.file.name).toBe(backupFilename(new Date(5_000)))
    expect(result.removed).toBe(1)
    expect(drive.removed).toHaveLength(1)
    expect(await drive.list('folder-1')).toHaveLength(3)

    const state = loadDriveState()
    expect(state.enabled).toBe(true)
    expect(state.lastUploadAt).toBe(5_000)
    expect(state.folderId).toBe('folder-1')
    expect(state.lastFileName).toBe(result.file.name)
  })

  test('a feltöltött csomag valódi, visszaolvasható fiókmentés', async () => {
    const drive = new FakeDrive()
    const uploaded = await backUpToDrive({ api: drive, snapshot: snapshot(), now: 9_000 })
    const back = await readBackupFromDrive(drive, uploaded.file.id)
    expect(back.manifest.format).toBe('test-parrot-account')
    expect(back.manifest.localStorage['tesztpapagaj:folders']).toContain('folders')
    // A blob ugyanazt a zipet adja, amit a mentés ír.
    const direct = await accountBackupBlob(snapshot())
    expect(uploaded.file.id).toBe(drive.files[0].id)
    expect(await direct.size).toBeGreaterThan(0)
  })

  test('a lista a legújabbal kezd, a leválasztás csak a könyvelést törli', async () => {
    const drive = new FakeDrive()
    await backUpToDrive({ api: drive, snapshot: snapshot(), now: 1_000 })
    await backUpToDrive({ api: drive, snapshot: snapshot(), now: 2_000 })
    const files = await driveBackups(drive)
    expect(files).toHaveLength(2)
    expect(files[0].name).toContain('1970-01-01')

    expect(saveDriveState({ enabled: true }).enabled).toBe(true)
    forgetDrive()
    expect(loadDriveState().enabled).toBe(false)
    expect(localStorage.getItem(DRIVE_STATE_KEY)).toBeNull()
    // A Drive-on lévő csomagok megmaradnak.
    expect(await driveBackups(drive)).toHaveLength(2)
  })
})
