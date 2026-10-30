# NOTICE — Tesztpapagáj, magyar változat

Ez a projekt a **Test Parrot** nyílt forráskódú feladat- és dolgozatszerkesztő
magyar fordítása és továbbfejlesztése.

- Eredeti projekt: <https://github.com/teacherdotdev/test-parrot>
- Eredeti oldal: <https://testparrot.com>
- Eredeti készítők: **teacher.dev** (<https://teacher.dev>), az EdTech-a-thon
  közösségi eseményén készült projekt
- Licenc: **Apache License, Version 2.0** — a teljes szöveg a `LICENSE`-ben

    This product includes software developed at teacher.dev, published as
    "Test Parrot" under the Apache License, Version 2.0.

A licenc 4(a) pontja szerint a módosított fájlok élén egy egysoros megjegyzés
jelzi a változtatást. A licenc 6. pontja szerint a licenc **védjegyhasználati
jogot nem ad**: az eredeti név, logó és a teacher.dev, illetve az EdTech-a-thon
márkajelei nem kerülnek át.

## A módosítások

1. **Nyelvi réteg.** Új `src/i18n/index.ts`: típuskényszeres szótár (az angol a
   forrás, a magyar a szállított nyelv), `t()` és `useT()`, nyelvválasztás
   tárolással, `<html lang>` frissítése. A magyar az alapértelmezett, a böngésző
   nyelvétől függetlenül.
2. **Magyar szövegek.** A fordítás a felülettől indul (héj, navigáció, lábléc,
   kezdőlap, nyitóoldal, első indítás, indításkori hibák), és a nyomtatott /
   exportált szövegekkel folytatódik. A fordítás állapotát a `README.md`
   „Fordítás állapota” szakasza mutatja.
3. **Márka.** Tesztpapagáj: saját logó, ikon és favicon
   (`public/logo.png`, `public/icon-256.png`, `public/favicon.ico`,
   `public/apple-touch-icon.png`), a címsor és az oldal címe magyar.
4. **Amit szándékosan nem fordítunk.** Az exportált csomagokban és a
   munkapéldányokban tárolt alapnevek (`Untitled Exam`, `Untitled Question
   Bank`, `Untitled section`) angolul maradnak: ezek adatok, nem feliratok, és
   a program logikája, valamint a fájlformátum-egyezés is ezekre épül. A
   felületen megjelenő változatuk fordítható.

## Módosított fájlok

```
src/i18n/index.ts            (új)
src/landing-page.tsx
src/home-page.tsx
src/app-shell.tsx
src/site-chrome.tsx
src/main.tsx
index.html
public/logo.png              (új tartalom)
public/icon-256.png          (új tartalom)
public/favicon.ico           (új tartalom)
public/apple-touch-icon.png  (új tartalom)
package.json
README.md
NOTICE.md                    (ez a fájl)
```
