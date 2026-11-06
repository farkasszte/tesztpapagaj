import { useEffect, useRef } from 'react'
import { backupDue, loadDriveState } from './storage/drive-backup'
import { driveClientId, saveToDrive } from './storage/drive-run'

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
    if (!driveClientId() || !backupDue(loadDriveState())) return
    let live = true
    void (async () => {
      // Csendes: ha nincs munkamenet vagy hiba jön, a következő megnyitáskor újra próbáljuk.
      const outcome = await saveToDrive({ silent: true })
      if (!live || outcome.ok) return
    })()
    return () => {
      live = false
    }
  }, [])
}
