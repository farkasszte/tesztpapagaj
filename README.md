# Tesztpapagáj

Feladatszerkesztő tanároknak: kérdések (feleletválasztós, igaz/hamis, párosítás,
rövid válasz, több részes) egy Milkdown-szerkesztőben, kérdésbankokba gyűjtve,
dolgozatokká rendezve — nyomtatásra, PDF-be és Wordbe.

A **Test Parrot** (teacher.dev) magyar fordítása és továbbfejlesztése.
Apache License 2.0 — lásd `LICENSE` és `NOTICE.md` (a módosítások listájával).

- Eredeti projekt: <https://github.com/teacherdotdev/test-parrot>
- Kapcsolat: **Farkas Gergely** — <farkas.szte@gmail.com>

## Fordítás állapota

A munka folyamatban van; ez a lista mutatja, hol tartunk. A magyar szövegek
egy helyen élnek: `src/i18n/index.ts`.

| Terület | Állapot |
|---|---|
| Nyelvi réteg (`t()`, `useT()`, `countOf()`, nyelvválasztás, `<html lang>`) | kész |
| Héj: navigáció, morzsamenü, súgó, lábléc | kész |
| Kezdőlap, nyitóoldal, első indítás, gyűjtőoldalak | kész |
| Indításkori hibaüzenetek | kész |
| Szerkesztő (dolgozat-oldal, eszköztár, szakaszok, formázás) | kész |
| Kérdésbank-felületek, import, beállítások, fiók, A projektről, Adatvédelem | kész |
| Accessible name-ek (aria-label, title, placeholder) | kész |
| Nyomtatott feladatlap, válaszkulcs, PDF/Word export | kész: a válaszkulcs fejléce mindhárom kimeneten a szótárból jön |
| e2e tesztek | a nagy készlet angolul fut (a nyelv a teszt-környezet beállítása), mellette 5 magyar felület-spec; a futás eredménye és az ismert eltérések a `NOTICE.md`-ben |

## Futtatás

```sh
bun install
bun run dev      # fejlesztői szerver, http://localhost:8000
bun run build    # típusellenőrzés + éles build a dist/-be
bun test         # egységtesztek (~1700, 112 fájl)
bun run test:e2e         # Playwright, a config szerint retry-jal
bun run test:e2e:strict  # ugyanaz retry NÉLKÜL: ez mutatja meg a valódi bukásokat
bun run test:e2e:fast    # csak a játék specjei (~45 mp), fejlesztés közben
```

Windowson a `bun test` 73 PDF-tesztje elbukik, mert a Bun elrontja a
`public/fonts/*` útvonalát (`/E:/...` a `E:/...` helyett). Linuxon és CI-n
ugyanezek átmennek; a hiba nem a kódban van.

## Hogyan épül fel

Vite + React 19, kliensoldali SPA, szerver és fiók nélkül: a dolgozatok, a
kérdésbankok és a képek az IndexedDB-ben maradnak a gépen. Az export DOCX-et
(`docx`), PDF-et (`pdf-lib` + MathJax) és nyomtatási stílust állít elő, és a
három kimenetnek egyeznie kell — ezt a `bun test` ellenőrzi.

A feliratok a `src/i18n/index.ts`-ben vannak, nem a komponensekben. Az angol a
forrás: a `TextKey` típus minden kulcsot számon kér, tehát hiányzó fordítás
típushiba, nem üres gomb.

### Kvízjáték

A `/jatek` oldal három játékmódja (Klasszikus, Bajnok, Veszély!) a Class
Gauntlet motorjának portja: a szabályok a `src/game/` alatt élnek, keretrendszer
nélkül, a saját tesztjeikkel — a felület csak a nézeteket rajzolja. A játék a
kérdésbank saját kérdéseiből dolgozik, és nem ír vissza a bankba.

Két úton játszható: **kivetítéssel** (a tanár vezérli a színpadot, a napló nem
rögzít választ) vagy **diák-eszközön** (szobakód és QR; a szabályok a tanár
gépén futnak, a relay csak a nézeteket továbbítja).

A Veszély! táblája kézzel is beosztható: a tanár a játék előtt mezőre teszi a
kérdéseket, helyet cserél, levesz, oszlopot nevez el, és a kész táblát
**sablonként** elmentheti a következő órára (`src/game-peril-builder.tsx`,
`src/game/peril-plan.ts`). A beosztás a böngésző tárolójában marad, és a
kincsesbarlang helye is beállítható.

Negyedik, nem versenyző út a **Tanulókártya** (`src/game-flashcard.tsx`): a bank
kérdéseiből pakli készül, elől a kérdés, hátul a helyes válasz és a magyarázat.
Koppintásra (vagy szóközre) fordul, a nyilak lapoznak, a keverés és az automatikus
fordítás a kártya alatt állítható — pont, idő és szoba nélkül. A bank oldaláról
„Tanulókártyák ebből a bankból" indítja (`/jatek?bank=<id>&mod=kartya`), a hátlap
tartalmát a kérdés típusa adja (`src/game/flashcard.ts`).

A biztonsági másolat **a tanár saját Google Drive-jára** is felmehet
(`src/google-drive.ts`, `src/drive-backup.ts`, `src/drive-settings.tsx`):
hitelesítés szolgáltató nélkül, a Google Identity Services token modelljével
(`drive.file` scope, a token csak memóriában él). Egyszer kell csatlakoztatni;
onnantól naponta egyszer, a megnyitáskor magától ment, és bármikor kérhető egy
mentés. A mappa a Drive-on `Tesztpapagáj biztonsági másolatok`, tíz csomag marad
meg, a visszaállítás a meglévő restore-utat használja. A `VITE_GOOGLE_CLIENT_ID`
környezeti változó kell hozzá (helyben `.env.local`, élesben a Vercel
környezeti változói).

A **kérdésbankok és a dolgozatok mappákba** rendezhetők (`src/folders.ts`): a mappa
nézet-rendezés, a böngésző tárolójában él, és a **biztonsági másolat viszi** — a
mentés a saját névterünk kulcsait is tartalmazza (`tesztpapagaj:*`: mappák, a
Veszély! táblaterve és sablonjai, kérdés-statisztika, hibalisták, nyelv).

Két további mód ugyanezen a naplón fut, más jelentéssel: a **Grand Prix**
(`src/game/race.ts`) a pont helyett megtett távot mér — a helyes válasz visz
előre, a gyors nitrót ad, a rossz kipördülés; a **Szörnytámadás**
(`src/game/boss.ts`) közös küldetés: a többség helyes válasza sebzi a szörnyet,
a többség rossza az osztály pajzsát rágja. Mindkettő a diák-eszközös házon megy
át (minden válasz kell hozzá), a színpad a `src/game-mode-stages.tsx`-ben van.

A játék után a diák a **hibalistáját** is megkapja: a Klasszikus eszközös módban a
tanár gépe mindenkinek kiküldi a maga elrontott kérdéseit, a telefon pedig hét
napra eltárolja (`src/game/review-deck.ts`), és a tanulókártya-nézővel átnézhető.
A kihagyott (lejárt idő) kérdés nem hiba, azt a lista nem gyűjti. A diák oldala
`/diak` — itt van a kódkérő és a megőrzött hibalisták, tehát a szoba bezárása után
is visszatalál hozzá (`src/game-devices.tsx` küldi, `src/game-student.tsx` fogadja).

A lejátszott játék **eredménye megmarad és böngészhető** (`/eredmenyek`): a
jelentés megjelenésekor a színpad elmenti a kérdésenkénti mátrixot
(`src/game/results.ts`) a játék saját adatbázisába (`src/game/results-store.ts`,
`test-parrot-game-v1` → `results` tároló, az utolsó száz játék marad meg). Az
oldal játékonként mutatja a csoportátlagot és a legjobb eredményt (holtversenynél
mindenkit), alatta diák × kérdés mátrixban a ✓ / ✗ / – cellákat, a fejlécben a
kérdésenkénti sikerességet. CSV-be vihető a naplóhoz, kinyomtatható, és
törölhető. Csak becenév kerül bele — valódi név soha.

A színpad jelképei a sport-téma nyelvén szólnak: a bajnok életjelzője **piros
szív**, a díjalapé **aranytallér**; a diák telefonja ugyanezt a négy
arénaszínt viseli, mint a vetítés.

## Ami eltér az eredetitől

A teljes lista a `NOTICE.md`-ben. Röviden: magyar nyelv (alapértelmezés), saját
logó és ikon, magyar oldalcím, valamint a kvízjáték (a Class Gauntlet Apache-2.0
motorjának portja, saját felülettel). A program működése, a fájlformátumok és az
exportok logikája változatlan.

## Köszönet

Az eredeti alkalmazást a **teacher.dev** csapata készítette az EdTech-a-thonon,
és Apache-2.0 licenc alatt tette közzé. A szerkesztő, az exportok, a
fájlformátumok és a szövegek alapja az ő munkájuk.

A magyar változat gondozója: **Farkas Gergely** — <farkas.szte@gmail.com>.
