/**
 * Google Drive — a tanár saját felhője a biztonsági másolatnak.
 *
 * Hitelesítés **szolgáltató nélkül**: a Google Identity Services (GIS) token
 * modellje egy böngészőbeli hozzáférési tokent ad (`drive.file` scope), szerver,
 * client secret és felhasználói adatbázis nélkül. A token csak memóriában él,
 * ~1 óráig; a mentés a következő megnyitáskor új tokent kér (csendben, ha a
 * tanár Google-munkamenete él).
 *
 * A hálózat injektálható (`DriveApi`), hogy a szabály tesztelhető legyen valódi
 * Drive nélkül.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const BACKUP_FOLDER = 'Tesztpapagáj biztonsági másolatok'
/** Ennyi csomag marad meg a mappában; a régebbiek törlődnek. */
export const KEEP_COPIES = 10
/** Naponta egyszer, a megnyitáskor. */
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000

export type DriveFile = {
  id: string
  name: string
  createdTime: string
  size?: string
}

export type DriveApi = {
  /** A mappa azonosítója; ha nincs, létrehozza. */
  ensureFolder(name: string): Promise<string>
  upload(folderId: string, name: string, blob: Blob): Promise<DriveFile>
  list(folderId: string): Promise<DriveFile[]>
  download(fileId: string): Promise<Blob>
  remove(fileId: string): Promise<void>
}

export type DriveToken = { accessToken: string; expiresAt: number }

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

/* ------------------------------------------------------------------------- */
/* Google Identity Services (böngésző)                                        */
/* ------------------------------------------------------------------------- */

type TokenResponse = { access_token?: string; expires_in?: number; error?: string }
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void }
type GisGlobal = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type?: string; message?: string }) => void
      }) => TokenClient
      revoke: (token: string, done?: () => void) => void
    }
  }
}

let gisLoading: Promise<GisGlobal> | null = null

/** A GIS könyvtár betöltése (egyszer, lustán). */
export function loadGoogleIdentity(): Promise<GisGlobal> {
  const existing = (window as unknown as { google?: GisGlobal }).google
  if (existing?.accounts?.oauth2) return Promise.resolve(existing)
  if (gisLoading) return gisLoading
  gisLoading = new Promise<GisGlobal>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      const loaded = (window as unknown as { google?: GisGlobal }).google
      if (loaded?.accounts?.oauth2) resolve(loaded)
      else reject(new Error('google-identity-missing'))
    }
    script.onerror = () => reject(new Error('google-identity-unavailable'))
    document.head.appendChild(script)
  })
  return gisLoading
}

/**
 * Token kérése. `silent` esetén nincs felület: ha a Google-munkamenet nem él,
 * a hívás `null`-lal tér vissza, és a tanár a gombbal indíthatja.
 */
/**
 * Az éppen érvényes token, ha van. A token a memóriában marad, így egy órán
 * belül a többi mentés nem kér újat — és nem nyit felugró ablakot.
 */
let cachedToken: DriveToken | null = null
let pendingToken: Promise<DriveToken | null> | null = null

export function cachedDriveToken(): DriveToken | null {
  return cachedToken && cachedToken.expiresAt > Date.now() ? cachedToken : null
}

/** Kijelentkezéskor vagy hibás token után a tárolt token eldobása. */
export function forgetDriveToken(): void {
  cachedToken = null
}

/**
 * Drive-token kérése.
 *
 * A böngésző csak **felhasználói kattintásból** enged felugró ablakot nyitni,
 * ezért ami nem kattintásra indul (a megnyitáskori csendes mentés), az nem
 * kérhet tokent: inkább `null`-lal tér vissza, és a mentés a következő
 * alkalomra marad. Enélkül a Google blokkolja az ablakot („Opening multiple
 * popups was blocked due to lack of user activation"), és a mentés némán elakad.
 *
 * A párhuzamos hívások egyetlen kérésbe folynak össze, hogy egyszerre soha ne
 * nyíljon több ablak.
 */
export async function requestDriveToken(
  clientId: string,
  options: { silent?: boolean } = {},
): Promise<DriveToken | null> {
  if (!clientId) return null
  const live = cachedDriveToken()
  if (live) return live
  const activation = typeof navigator === 'undefined' ? undefined : navigator.userActivation
  if (!activation?.isActive) return null
  if (pendingToken) return pendingToken
  pendingToken = (async () => {
    const gis = await loadGoogleIdentity()
    return new Promise<DriveToken | null>((resolve) => {
      const client = gis.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (!response.access_token) {
            resolve(null)
            return
          }
          const token = {
            accessToken: response.access_token,
            expiresAt: Date.now() + Math.max(0, (response.expires_in ?? 3600) - 60) * 1000,
          }
          cachedToken = token
          resolve(token)
        },
        error_callback: () => resolve(null),
      })
      try {
        // Csendes kérés: csak a már megadott engedélyt használja, nem kérdez.
        // Interaktív: ha kell, a Google megmutatja a hozzájáruló képernyőt.
        client.requestAccessToken({ prompt: options.silent ? 'none' : '' })
      } catch {
        resolve(null)
      }
    })
  })()
  try {
    return await pendingToken
  } finally {
    pendingToken = null
  }
}

/** A token visszaadása a Google-nak (kijelentkezés). */
export async function revokeDriveToken(token: string): Promise<void> {
  forgetDriveToken()
  const gis = await loadGoogleIdentity().catch(() => null)
  gis?.accounts.oauth2.revoke(token, () => undefined)
}

/* ------------------------------------------------------------------------- */
/* Drive REST                                                                 */
/* ------------------------------------------------------------------------- */

async function failure(response: Response): Promise<Error> {
  let message = `drive-${response.status}`
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    if (body?.error?.message) message = body.error.message
  } catch {
    // Nem JSON: a státuszkód marad.
  }
  return new Error(message)
}

/** A valódi Drive: a token fejlécben megy, a hívás injektálható. */
export function driveApi(token: string): DriveApi {
  const headers = { Authorization: `Bearer ${token}` }

  const findFolder = async (name: string): Promise<string | null> => {
    const query = encodeURIComponent(
      `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    )
    const response = await fetch(`${API}/files?q=${query}&fields=files(id,name)&spaces=drive`, { headers })
    if (!response.ok) throw await failure(response)
    const body = (await response.json()) as { files?: { id: string; name: string }[] }
    return body.files?.[0]?.id ?? null
  }

  return {
    async ensureFolder(name) {
      const existing = await findFolder(name)
      if (existing) return existing
      const response = await fetch(`${API}/files?fields=id`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
      })
      if (!response.ok) throw await failure(response)
      const body = (await response.json()) as { id: string }
      return body.id
    },

    async upload(folderId, name, blob) {
      // Egy kérésben a metaadat és a fájl: multipart/related.
      const boundary = `tp${Date.now().toString(36)}`
      const metadata = JSON.stringify({ name, parents: [folderId] })
      const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/zip\r\n\r\n`
      const tail = `\r\n--${boundary}--`
      const body = new Blob([head, blob, tail])
      const response = await fetch(
        `${UPLOAD}/files?uploadType=multipart&fields=id,name,createdTime,size`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        },
      )
      if (!response.ok) throw await failure(response)
      return (await response.json()) as DriveFile
    },

    async list(folderId) {
      const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
      const response = await fetch(
        `${API}/files?q=${query}&orderBy=createdTime desc&fields=files(id,name,createdTime,size)&pageSize=50`,
        { headers },
      )
      if (!response.ok) throw await failure(response)
      const body = (await response.json()) as { files?: DriveFile[] }
      return body.files ?? []
    },

    async download(fileId) {
      const response = await fetch(`${API}/files/${fileId}?alt=media`, { headers })
      if (!response.ok) throw await failure(response)
      return response.blob()
    },

    async remove(fileId) {
      const response = await fetch(`${API}/files/${fileId}`, { method: 'DELETE', headers })
      // A már törölt fájl nem hiba.
      if (!response.ok && response.status !== 404) throw await failure(response)
    },
  }
}
