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
          // Az eredeti e2e tesztek a kártyás nézet viselkedését (lapozó, előnézet) ellenőrzik;
          // az új táblázatos kezdőlap viselkedését a scripts/home-table.e2e.ts fedi.
          { name: 'test-parrot:home-view', value: 'cards' },
        ],
      }],
    },
  },
  // Két szerver kell: a lapot kiszolgáló Vite, és a **helyi relay**, amelyre a
  // diák-eszközös mérések csatlakoznak. A relayt eddig kézzel kellett indítani;
  // ha elhalt, a split-mérések érthetetlenül buktak (a diák a választón maradt).
  webServer: [
    {
      command: 'bunx vite --host 127.0.0.1 --port 4174',
      url: 'http://127.0.0.1:4174',
      env: { VITE_ROOM_URL: 'ws://127.0.0.1:8788' },
      reuseExistingServer: true,
    },
    {
      command: 'bun run dev:room',
      url: 'http://127.0.0.1:8788/health',
      timeout: 90_000,
      reuseExistingServer: true,
    },
  ],
})
