import { afterEach, describe, expect, test } from 'bun:test'
import { cachedDriveToken, forgetDriveToken, requestDriveToken } from './google-drive'

/**
 * A tokenkérés szabálya: felugró ablakot csak kattintásból szabad nyitni.
 *
 * A Google Identity Services `requestAccessToken`-je ablaka a böngészőben
 * felhasználói aktiválás nélkül blokkolt („Opening multiple popups was blocked
 * due to lack of user activation"), ezért a kérésnek ilyenkor nem is szabad
 * elindulnia — a csendes mentés a következő alkalomra marad.
 */

const originalNavidator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

const setActivation = (isActive: boolean) => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userActivation: { isActive } },
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  if (originalNavidator) Object.defineProperty(globalThis, 'navigator', originalNavidator)
  else delete (globalThis as { navigator?: unknown }).navigator
  forgetDriveToken()
})

describe('Drive-token kérése', () => {
  test('kattintás nélkül nem indul kérés, és nem nyílik ablak', async () => {
    setActivation(false)
    expect(await requestDriveToken('client-id')).toBeNull()
    expect(cachedDriveToken()).toBeNull()
  })

  test('kattintás nélkül a csendes kérés is null, nem hiba', async () => {
    setActivation(false)
    expect(await requestDriveToken('client-id', { silent: true })).toBeNull()
  })

  test('client id nélkül nincs mit kérni', async () => {
    setActivation(true)
    expect(await requestDriveToken('')).toBeNull()
  })

  test('a tárolt token eldobható (kijelentkezés)', () => {
    forgetDriveToken()
    expect(cachedDriveToken()).toBeNull()
  })
})
