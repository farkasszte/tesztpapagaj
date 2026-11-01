# test-parrot

A Vite + React app for authoring test questions — Multiple Choice, True/False, Matching, Short Answer and Multipart — in a Milkdown/Crepe rich-text editor.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `teacherdotdev/test-parrot`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Browser assertions

When adding or reviewing Playwright coverage, read `docs/browser-assertions.md` for the repository's examples of strong user-visible assertions and weak geometry or style-only checks.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Export parity

Before comparing or debugging print and DOCX output, or changing export semantics, layout, or adapters, read `docs/export-testing.md`.

`bun test` covers export parity without any system dependency. The heavyweight comparison, `bun run test:exports`, is an out-of-band diagnostic: it needs LibreOffice and Poppler, and it is not part of `bun test`, `bun run test:e2e`, or CI. Run it when the user asks for an export comparison, when diagnosing a print/DOCX parity problem, or when a diff touches the Export Document, the Layout Plan, either Export Adapter, pagination, print styling, or supported document-node rendering.

## Kvízjáték (Class Gauntlet-átvétel)

Három mód, két úton: **kivetítés** (senkinek nem kell eszköz) és **diák-eszközön** (telefonos szoba). A szabályok a `src/game/` alatt, keretrendszer-független TypeScriptben élnek (a `class-gauntlet` Apache-2.0 portja, lásd `NOTICE.md`); a színpadok (`game-stage.tsx`, `game-champion-stage.tsx`, `game-peril-stage.tsx`) csak rajzolnak, a diáknál ugyanezt teszik a `game-student-*.tsx` nézetek.

- **A tanár füle az igazság.** Eszközös módban is a böngésző futtatja a motort, a relay csak továbbít — nincs szerveroldali játéklogika, nincs duplikált állapot.
- **Hálózat:** `workers/room/` (Cloudflare Durable Object, egy szoba = egy 6 jegyű kód) + `src/game/room-client.ts` (újracsatlakozás, életjel) + `src/game/room-protocol.ts` (közös huzal, `TPP1` bináris képkeret). Indítás: `bun run dev:room` (8788), deploy: `bun run deploy:room`; a frontend a `VITE_ROOM_URL`-t használja.
- **50 diák**: a szoba 50 főig fogad, a képet egyszer tölti fel a tanár (a mesh 50×-ese helyett). Részletek: `docs/adr/0052-the-classroom-game-talks-to-one-relay.md`.
- **Szerződés a bank felé:** `src/game/projection.ts` — csak a játszható kérdés megy a színpadra (MC, 1 helyes, 2–4 válasz), a kimaradók indoklással listázódnak; a szavakat a `DocView` rajzolja, hogy a kép és a matek ugyanaz legyen, mint a dolgozaton.
- **Magyarázat:** `Question.explanation` (rekord 0.13.0), a szerkesztőben blokk, a színpadokon a felfedésnél jelenik meg; nyomtatásba nem kerül. Lásd `docs/adr/0051-a-question-carries-its-explanation.md`.
- **Kapuk:** `bunx tsc -b`, `bunx eslint src api workers`, `bun test`, `bun run build`; a worker sajátja: `bun run typecheck:room`.
