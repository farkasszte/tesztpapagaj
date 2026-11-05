import { useRef, useState } from 'react'
import { captureAccount, stageRestore } from './account-backup'
import { backUpToDrive, driveBackups, forgetDrive, loadDriveState, saveDriveState, type DriveState } from './drive-backup'
import { driveApi, requestDriveToken, revokeDriveToken, type DriveFile, type DriveToken } from './google-drive'
import { useT } from './i18n'

/**
 * Beállítások → biztonsági másolat a Google Drive-ra.
 *
 * A tanár egy gombbal engedélyezi a saját Drive-ját (`drive.file` scope), onnantól
 * naponta egyszer, a megnyitáskor magától ment, és bármikor kérhet egyet. A
 * mappában tíz csomag marad meg; a visszaállítás a meglévő restore-utat használja.
 */

function clientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''
}

function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function DriveSettings() {
  const t = useT()
  const [state, setState] = useState<DriveState>(() => loadDriveState())
  const [busy, setBusy] = useState<'connect' | 'backup' | 'list' | 'restore' | null>(null)
  const [error, setError] = useState('')
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const token = useRef<DriveToken | null>(null)
  const configured = clientId().length > 0

  /** Friss token: a memóriában élőt használja, különben kér egyet. */
  const freshToken = async (silent: boolean): Promise<DriveToken | null> => {
    if (token.current && token.current.expiresAt > Date.now()) return token.current
    const next = await requestDriveToken(clientId(), { silent })
    token.current = next
    return next
  }

  const runBackup = async () => {
    setBusy('backup')
    setError('')
    try {
      const current = await freshToken(true)
      if (!current) {
        setError(t('drive.noAccess'))
        return
      }
      const result = await backUpToDrive({
        api: driveApi(current.accessToken),
        snapshot: await captureAccount(),
      })
      setState(result.state)
      setFiles(null)
    } catch {
      setError(t('drive.failed'))
    } finally {
      setBusy(null)
    }
  }

  const connect = async () => {
    setBusy('connect')
    setError('')
    try {
      const current = await freshToken(false)
      if (!current) {
        setError(t('drive.noAccess'))
        return
      }
      setState(saveDriveState({ enabled: true }))
      await runBackup()
    } finally {
      setBusy(null)
    }
  }

  const loadList = async () => {
    setBusy('list')
    setError('')
    try {
      const current = await freshToken(true)
      if (!current) {
        setError(t('drive.noAccess'))
        return
      }
      setFiles(await driveBackups(driveApi(current.accessToken)))
    } catch {
      setError(t('drive.failed'))
    } finally {
      setBusy(null)
    }
  }

  const restore = async (file: DriveFile) => {
    setBusy('restore')
    setError('')
    try {
      const current = await freshToken(true)
      if (!current) {
        setError(t('drive.noAccess'))
        return
      }
      const blob = await driveApi(current.accessToken).download(file.id)
      await stageRestore({ bytes: await blob.arrayBuffer() })
      window.location.reload()
    } catch {
      setError(t('drive.restoreFailed'))
      setBusy(null)
    }
  }

  const disconnect = async () => {
    if (token.current) await revokeDriveToken(token.current.accessToken)
    token.current = null
    forgetDrive()
    setState(loadDriveState())
    setFiles(null)
  }

  return (
    <section className="site-card" aria-label={t('drive.title')}>
      <h2>{t('drive.title')}</h2>
      <p>{t('drive.hint')}</p>

      {!configured ? (
        <p className="site-note">{t('drive.notConfigured')}</p>
      ) : state.enabled ? (
        <>
          <p className="drive-state">
            <strong>{t('drive.connected')}</strong>
            <span>
              {state.lastUploadAt ? t('drive.lastBackup', { when: when(state.lastUploadAt) }) : t('drive.never')}
            </span>
          </p>
          <div className="settings-actions">
            <button type="button" className="primary-button" onClick={() => void runBackup()} disabled={busy !== null}>
              {busy === 'backup' ? t('drive.busy') : t('drive.backupNow')}
            </button>
            <button type="button" className="secondary-button" onClick={() => void loadList()} disabled={busy !== null}>
              {busy === 'list' ? t('drive.busy') : t('drive.list')}
            </button>
            <button type="button" className="secondary-button" onClick={() => void disconnect()} disabled={busy !== null}>
              {t('drive.disconnect')}
            </button>
          </div>
          {files ? (
            files.length === 0 ? (
              <p className="site-note">{t('drive.empty')}</p>
            ) : (
              <>
              <h3 className="drive-list-title">{t('drive.listTitle')}</h3>
              <ul className="drive-files">
                {files.map((file) => (
                  <li key={file.id} className="drive-file">
                    <span className="drive-file-name">{file.name}</span>
                    <span className="drive-file-when">{when(Date.parse(file.createdTime))}</span>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void restore(file)}
                      disabled={busy !== null}
                    >
                      {busy === 'restore' ? t('drive.busy') : t('drive.restoreThis')}
                    </button>
                  </li>
                ))}
              </ul>
              </>
            )
          ) : null}
        </>
      ) : (
        <div className="settings-actions">
          <button type="button" className="primary-button" onClick={() => void connect()} disabled={busy !== null}>
            {busy === 'connect' ? t('drive.busy') : t('drive.connect')}
          </button>
        </div>
      )}

      {error ? (
        <p className="home-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
