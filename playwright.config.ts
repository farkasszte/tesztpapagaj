import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './scripts',
  testMatch: '*.e2e.ts',
  // This VM has only 2 cores. Running several Chromium instances in parallel
  // alongside the Vite dev server exhausts memory and crashes pages
  // ("Page crashed"), which surfaced as intermittent e2e failures that wasted
  // whole coordinator repair cycles. Serialize to one worker for stability and
  // retry transient failures so a single flake no longer fails the run.
  workers: 1,
  retries: 2,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    // A service worker az első látogatáskor újratölti az oldalt (hogy vezérlés
    // alá kerüljön). Tesztben ez a friss kontextusokkal versenyez, és
    // `ERR_ABORTED` / „execution context destroyed" hibákká válik: blokkoljuk,
    // az app a tartalék úton (hálózat) ugyanúgy működik.
    serviceWorkers: 'block',
    // A fresh browser is a first visit, and a first visit to `/` is the
    // front door rather than Home. The suites start from Home, so every
    // context arrives already welcomed.
    storageState: {
      cookies: [],
      origins: [{
        origin: 'http://127.0.0.1:4174',
        localStorage: [
          { name: 'test-parrot:welcomed', value: 'true' },
          // A nagy e2e-keszlet a felulet viselkedeset ellenorzi, ezert angolul fut:
          // a magyar feliratokat kulon spec-ek fedik (scripts/hungarian-ui.e2e.ts).
          { name: 'tesztpapagaj:language', value: 'en' },
        ],
      }],
    },
  },
  webServer: {
    command: 'bunx vite --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    // A diák-eszközös e2e a helyi relayhez csatlakozik, nem az éles workerhez;
    // magát a relayt az a spec indítja, mert csak azt az egy tesztet érinti.
    env: { VITE_ROOM_URL: 'ws://127.0.0.1:8788' },
    reuseExistingServer: true,
  },
})
