import { useEffect, useRef } from 'react'
import { captureAccount } from './account-backup'
import { backUpToDrive, backupDue, loadDriveState } from './drive-backup'
import { driveApi, requestDriveToken } from './google-drive'

function clientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''
}

/**
 * Csendes mentés a megnyitáskor: ha a tanár egyszer csatlakoztatta a Drive-ot és
 * letelt a nap, a lap betöltése után magától felmegy a csomag. Ha a Google
 * munkamenet nem él, semmi nem történik — a gomb a beállításokban marad.
 */
export function useDriveAutoBackup(): void {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const id = clientId()
    if (!id || !backupDue(loadDriveState())) return
    let live = true
    void (async () => {
      try {
        const current = await requestDriveToken(id, { silent: true })
        if (!current || !live) return
        await backUpToDrive({ api: driveApi(current.accessToken), snapshot: await captureAccount() })
      } catch {
        // Csendes: a következő megnyitáskor újra próbáljuk.
      }
    })()
    return () => {
      live = false
    }
  }, [])
}
