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
7. **e2e tesztek.** A nagy Playwright-készlet angolul fut (a nyelvet a
   teszt-környezet `storageState`-ében állítjuk, nem a terméken), így az upstream
   szelektorok változatlanok maradhatnak; a magyar felületet 5 külön spec fedi
   (`scripts/hungarian-ui.e2e.ts`). A magyar feliratokra írt teljes készlet
   méréssel elvetve: a rövid, egymás részstringjei lévő magyar címkék miatt a
   szerep szerinti keresés hol kétértelmű, hol semmit nem talál.

   Ismert eltérés az upstream tesztekhez képest: a `multiple-exams` első esete a
   kérdésbank-oldal „hozzáadás a dolgozathoz" gombjára vár, ami nálunk csak
   nyitott dolgozat mellett jelenik meg (az upstream alapértelmezett
   munkapéldányával szemben) — ez viselkedésbeli különbség, nem fordítási hiba,
   ezért dokumentálva marad, nem teszttel kikerülve.
8. **Amit szándékosan nem fordítunk.** Az exportált csomagokban és a
   munkapéldányokban tárolt alapnevek (`Untitled Exam`, `Untitled Question
   Bank`, `Untitled section`) angolul maradnak: ezek adatok, nem feliratok, és
   a program logikája, valamint a fájlformátum-egyezés is ezekre épül. A
   felületen megjelenő változatuk fordítható. Ugyanígy angolul maradnak a gépi
   formátumok mezőnevei (JSON-séma, a formátumok azonosítói).
9. **Export és nyomtatás.** A válaszkulcs fejléce („Válaszkulcs", angolul
   „Answer Section") a szótárból jön mindhárom helyen: a PDF-rajzolóban, a
   Word-exportálóban és a nyomtatási nézetben; a fingerprint-szókészlet ugyanezt
   a kulcsot használja, így a két adapter egyezése továbbra is mérhető. A
   korábbi kiadású exportrekordok fingerprintje angolul készült — az összevetés
   ezeknél eltérést jelezhet, ami nem adatvesztés.


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

10. **Igaz/hamis jelölés.** A magyar felületen és a nyomtatott íven az angol
    `T`/`F` helyett `I`/`H` (Igaz/Hamis) áll — a kérdés válaszai, a körberajzolt
    jelek és a válaszkulcs betűi is. A tárolt rekord változatlanul `true`/`false`,
    a fájlformátumok sem változnak, csak a megjelenített jel. A jelek a
    nyelvezetet követik (angolul továbbra is `T`/`F`), ezért a Paper Style-ok
    getterrel olvassák őket.
11. **Behozatal párbeszéd.** A felület és a lábléc-mondat („Létrejön: …") a
    szótárból épül; a mondat szerkezetét vizsgáló egységteszt angolul fut.
12. **Kvízjáték.** Új modul (`/jatek`): a Class Gauntlet
    (<https://github.com/teacherdotdev/class-gauntlet>, Apache License 2.0)
    szabálymotorja került át változatlan logikával, keretrendszer-független
    TypeScriptként (`src/game/`); a felület — a magyar színpadok, a diák-nézetek,
    a lobbi és a szoba-relay — ennek a projektnek a sajátja. A Class Gauntlet
    maga az EdTech-a-thon „1v100” projektjének szerver nélküli újraírása
    (<https://github.com/deadbeef101010/1v100-edtechathon>, Apache License 2.0,
    Copyright 2026 deadbeef101010 és közreműködők). A licenc 4(a) és 6. pontja
    szerint a Class Gauntlet neve, logói (`src/lib/components/art/`), a
    `classgauntlet.com` és a `support@teacher.dev` nem kerültek át; a magyar
    felület a saját i18n-szótárból épül.

    This product includes software developed at teacher.dev, published as
    "Class Gauntlet" under the Apache License, Version 2.0, itself adapted from
    "1v100" (Copyright 2026 deadbeef101010 and contributors).

13. **Betűtípusok a játékhoz.** A kvízjáték színpada (ökölvívó aréna) három SIL
    Open Font License 1.1 alatti betűt használ, `public/game-fonts/` alatt,
    `unicode-range` részhalmazokkal: **Lexend** (a kérdés és a válaszok szövege
    a vetítésen és a diák telefonján; Copyright 2018 The Lexend Project
    Authors, <https://github.com/googlefonts/lexend>), **Literata** (a kérdések
    és válaszok szövege a Lexend bevezetése előtti nézeteken és a
    dokumentum-nézetekben; Copyright 2017 The Literata Project Authors,
    <https://github.com/googlefonts/literata>) és **Oswald** (a címek, a menet
    és az óra számai; Copyright 2016 The Oswald Project Authors,
    <https://github.com/googlefonts/OswaldFont>). A licencek teljes szövege
    ugyanott: `public/game-fonts/OFL-Lexend.txt`, `OFL-Literata.txt` és
    `OFL-Oswald.txt`. A többi beépített betű (GNU FreeFont) változatlan, saját
    licence a `public/fonts/FREEFONT-LICENSE.txt`-ben.

14. **Játékos-avatarok.** A játék figurái a **DiceBear** „critters” stílusából
    készülnek (`@dicebear/core` és `@dicebear/styles`, a `critters` definíció).
    A stílus a DiceBear saját munkája, **CC0 1.0** alatt
    (<https://www.dicebear.com/styles/critters/>, <https://creativecommons.org/publicdomain/zero/1.0/>),
    tehát kötelező feltüntetés nincs; ez a bejegyzés csak a forrás átláthatóságáért
    van itt. A képek **helyben**, a böngészőben készülnek: a program nem hívja a
    DiceBear HTTP API-ját, és nem tölt képet külső szerverről.
