import { captureAccount } from './account-backup'
import { backUpToDrive } from './drive-backup'
import { driveApi, requestDriveToken } from './google-drive'

/**
 * Egy Drive-mentés végrehajtása — a fejléc panelje, a beállítások kártyája és a
 * megnyitáskori csendes mentés ugyanezt hívja, hogy a viselkedés egy helyen
 * legyen: token (lehet csendben), a teljes fiók befogása, feltöltés.
 */

export type SaveOutcome =
  | { ok: true; when: number }
  /** A Google nem adott tokent (nincs munkamenet, vagy a fiók nincs a tesztfelhasználók között). */
  | { ok: false; reason: 'no-access' }
  | { ok: false; reason: 'failed' }

export function driveClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''
}

export async function saveToDrive(options: { silent?: boolean; clientId?: string } = {}): Promise<SaveOutcome> {
  const id = options.clientId ?? driveClientId()
  if (!id) return { ok: false, reason: 'no-access' }
  try {
    const token = await requestDriveToken(id, { silent: options.silent ?? true })
    if (!token) return { ok: false, reason: 'no-access' }
    const now = Date.now()
    await backUpToDrive({ api: driveApi(token.accessToken), snapshot: await captureAccount(), now })
    return { ok: true, when: now }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
