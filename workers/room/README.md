# Szoba-relay (Cloudflare Durable Object)

A kvízjáték diákeszközös módjának hálózati rétege. Egy szoba = egy 6 jegyű kód =
egy Durable Object. A relay **buta**: nem ismeri a játék szabályait, csak a tanár
fülének nézeteit továbbítja a diákoknak, és a képeket fogadja egyszer.

Miért relay és nem peer-to-peer háló: `docs/adr/0052-the-classroom-game-talks-to-one-relay.md`
(50 diák, 512 KB kép: 1 feltöltés a tanártól a 25,6 MB helyett).

## Fejlesztés

```bash
bun run dev:room        # a gyökérből: wrangler dev a 8788-as porton
bun run typecheck:room  # a worker saját tsc-je (workers-types)
```

A kliens `localhost`-on automatikusan a `ws://127.0.0.1:8788`-hoz csatlakozik,
tehát a `bun run dev` (Vite, 8000) mellé elég a `bun run dev:room`.

## Üzembe helyezés

```bash
bun run deploy:room     # wrangler deploy (a fiókhoz bejelentkezve)
```

Majd a frontendnek:

```
VITE_ROOM_URL=wss://<worker-neve>.<fiók>.workers.dev
```

vagy saját aldomain a Cloudflare zónában (a R2 mellé), pl.
`wss://room.<domain>` — ehhez a `wrangler.toml`-ba egy `routes` bejegyzés kell:

```toml
routes = [{ pattern = "room.example.com", custom_domain = true }]
```

## A huzalprotokoll

`src/game/room-protocol.ts` (közös a workerrel): `hello` → `welcome`, `view`
(`everyone` vagy egy `PeerId`), `picture` (bináris `TPP1` keret), `picture-wanted`,
`picture-missing`, `left`, `denied`, `close`.

## Korlátok, szándékosan

- **Egy tanár szobánként.** Újratöltés után a tanár visszakapja a kódot, ha az
  előző kapcsolata már nem él; élő tanár mellett a második `not-host`-ot kap.
- **50 diák.** Az 51. `full` jelzést kap, nem csendben dobódik el.
- **A képek a példány memóriájában** vannak (a DO tároló értékenként 128 KiB-os
  korlátja miatt). Ha a szoba elhidegül és a példány elszáll, a relay
  `picture-missing`-gel visszakéri a tanár fülétől — a tanár az igazság.
