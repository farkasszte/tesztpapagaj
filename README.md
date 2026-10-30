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
bun test         # egységtesztek (~1550)
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

## Ami eltér az eredetitől

A teljes lista a `NOTICE.md`-ben. Röviden: magyar nyelv (alapértelmezés), saját
logó és ikon, magyar oldalcím. A program működése, a fájlformátumok és az
exportok logikája változatlan.

## Köszönet

Az eredeti alkalmazást a **teacher.dev** csapata készítette az EdTech-a-thonon,
és Apache-2.0 licenc alatt tette közzé. A szerkesztő, az exportok, a
fájlformátumok és a szövegek alapja az ő munkájuk.

A magyar változat gondozója: **Farkas Gergely** — <farkas.szte@gmail.com>.
