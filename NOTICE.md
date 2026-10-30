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
   forrás, a magyar a szállított nyelv), `t()` helyőrzőkkel (`{count}`, `{name}`,
   `{file}`), `useT()` és `countOf()`. A magyar az alapértelmezett, a böngésző
   nyelvétől függetlenül; a nyelvválasztó a Beállítások oldalon van, a választás
   tárolódik, a `<html lang>` követi.
2. **Magyar felület.** A teljes felhasználói felület magyar: héj, navigáció,
   morzsamenü, lábléc, nyitóoldal, kezdőlap, gyűjtőoldalak, szerkesztő,
   dolgozat-oldal, kérdésbank-panelek és -párbeszédek, import- és
   exportpárbeszédek, importok oldal, fiókmenü, beállítások, „A projektről” és
   „Adatvédelem”. Az accessible name-ek (aria-label, title, placeholder) is
   magyarok, hogy a képernyőolvasó is magyarul szólaljon meg.
3. **Nyelvhelyesség.** A magyar nem tesz többesjelet a szám után, ezért a
   darabszámok egységesen a `countOf()` segédfüggvényen át mennek (`3 kérdés`,
   nem `3 kérdések`); a kérdéstípus-, nehézség- és formátumnevek gettereken
   keresztül olvassák a fordítást, így a hívási helyek változatlanok.
4. **Márka és kapcsolat.** Tesztpapagáj: saját logó, ikon és favicon
   (`public/logo.png`, `public/icon-256.png`, `public/favicon.ico`,
   `public/apple-touch-icon.png`), magyar címsor és oldalcím. Az EdTech-a-thon
   hivatkozások, képek és a `support@teacher.dev` cím kikerültek; a kapcsolat
   `farkas.szte@gmail.com`, a lábléc az „A projektről” oldalra mutat. A látható
   szövegekben az eredeti terméknév helyett a saját név szerepel.
5. **Adatvédelem.** A Cloudflare Web Analytics beacon nem kerül a buildbe
   (`VITE_CF_BEACON_TOKEN` nincs beállítva), és az adatvédelmi oldal ehhez
   igazodó, pontos szöveget mond: nincs látogatottság-mérés, nincs süti.
6. **Kezdőlap.** Az üres polc kártyája magyarázó feliratot kapott
   (`create-first-hint`), hogy üres állapotban is elmondja, mi készül el.
7. **e2e tesztek.** A 40 Playwright-szkript szelektorai és szöveg-állításai a
   magyar feliratokra íródtak át (nyelvi táblából generálva, az összetett nevekre
   mintaszabályokkal). Ez a fordítás velejárója: a tesztek a felületet úgy
   ellenőrzik, ahogy a tanár látja.
8. **Amit szándékosan nem fordítunk.** Az exportált csomagokban és a
   munkapéldányokban tárolt alapnevek (`Untitled Exam`, `Untitled Question
   Bank`, `Untitled section`) angolul maradnak: ezek adatok, nem feliratok, és
   a program logikája, valamint a fájlformátum-egyezés is ezekre épül. A
   felületen megjelenő változatuk fordítható. Ugyanígy angolul maradnak a gépi
   formátumok mezőnevei (JSON-séma, a formátumok azonosítói).
9. **Nyitott pont.** Az exportált válaszkulcs fejléce (`Answer Section`) és a
   letöltött fájlnevek egyelőre angolok: ezek a fingerprint-szókészletben is
   szerepelnek, ezért a velük járó elvárások együttes frissítése kell hozzá.


## Módosított fájlok

```
src/i18n/index.ts            (új)
src/App.tsx, src/exam-page.tsx, src/page-item-view.tsx
src/question-bank-*.tsx, src/export-dialog.tsx, src/export-history.tsx
src/imports-page.tsx, src/import-*.tsx, src/resolve-images*.tsx
src/account-menu.tsx, src/resource-cards.tsx, src/site-pages.tsx
src/home-page.tsx, src/app-shell.tsx, src/site-chrome.tsx, src/main.tsx
src/exam.ts, src/exam-store.ts, src/exam-workspaces.ts, src/multipart.ts
src/question-bank-export.ts, src/question-bank-pdf.ts, src/question-copy.ts
src/pending-image-view.ts, src/resolved-pictures.ts, src/section-headings.ts
src/question-bank-filter-options.ts, src/export-preparation.ts
src/support-email.ts, src/styles.css
scripts/*.e2e.ts             (a szelektorok és állítások)
index.html
public/logo.png              (új tartalom)
public/icon-256.png          (új tartalom)
public/favicon.ico           (új tartalom)
public/apple-touch-icon.png  (új tartalom)
package.json
README.md
NOTICE.md                    (ez a fájl)
```
