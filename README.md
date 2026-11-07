# Tesztpapagáj

Feladatszerkesztő tanároknak: kérdések (feleletválasztós, igaz/hamis, párosítás, rövid válasz, hiányos szöveg, több részes) egy modern Milkdown/Crepe szerkesztőben, kérdésbankokba gyűjtve, dolgozatokká rendezve — nyomtatásra, PDF-be és Wordbe (DOCX).

A **Test Parrot** (teacher.dev) magyar fordítása és továbbfejlesztése.
Apache License 2.0 — lásd a `LICENSE` és `NOTICE.md` fájlokat (a módosítások részletes listájával).

- Eredeti projekt: <https://github.com/teacherdotdev/test-parrot>
- Kapcsolat: **Farkas Gergely** — <farkas.szte@gmail.com>

---

## Főbb funkciók

- **Intuitív feladatszerkesztő**: Feleletválasztós, Igaz/Hamis, Párosítás, Rövid válasz, Kiegészítés és Több részes kérdések megfogalmazása. Beépített matematikai képletszerkesztés KaTeX-szel, képek beillesztése és szerkesztése.
- **Megújult kezdőlap**: A dolgozatok és kérdésbankok kényelmes áttekintése:
  - **Nézetváltó**: szűrhető és rendezhető **Táblázat nézet** vagy vizuális **Kártyák nézet**.
  - **Azonnali keresés és szűrés**: típusfülek (*Összes*, *Dolgozatok*, *Kérdésbankok*), keresés cím és tartalom szerint, oszloponkénti rendezés (*Név*, *Típus*, *Kérdések*, *Utolsó aktivitás*).
  - **Gyorsműveletek**: Új dolgozat, Új kérdésbank és kiemelt Importálás gomb.
- **Export és nyomtatás**: Dolgozatok és automatikus válaszkulcsok nyomtatása, exportálása PDF-be és Wordbe (DOCX) tökéletes formai és tipográfiai egyezéssel.
- **Kérdésbankok és sokoldalú import**: Kérdések gyűjtése, csoportosítása és beemelése dolgozatokba. Széles körű formátumtámogatás: Moodle XML, Kahoot, Canvas/QTI (1.2, 2.1, 2.2, 3.0), Blackboard, Respondus CSV/Standard, GIFT, Excel/CSV táblázatok és Text2QTI.
- **Kvízjátékok (`/jatek`)**: Interaktív osztálytermi vetítés és diák-eszközös valós idejű vetélkedők:
  - **Klasszikus**, **Bajnok** és **Veszély!** (Peril) játékmódok.
  - A Veszély! módban teljes értékű kézi táblaépítő, mezőcsere, kincsesbarlang (napi duplázó) jelölés és sablonmentés.
  - **Tanulókártya** pakli önálló vagy tanórai átismétléshez.
  - **Grand Prix** és **Szörnytámadás** közösségi módok.
  - **Gyakorló mód**: diák-eszközös gyakorlás színes válaszkártyákkal, azonnali visszajelzéssel, megőrzött hibalistával és a korábbi eredmények telefonos naplójával.
  - **Eredmények (`/eredmenyek`)**: játékonkénti mátrix, csoportátlag, feladatonkénti sikeresség és CSV export.
- **Teljes adatvédelem és offline működés**: Minden dolgozat, kérdésbank és kép a böngésző helyi IndexedDB adatbázisában marad. Nincs kötelező felhőszolgáltatás, nincs követőkód, nincs szükség bejelentkezésre.
- **Biztonsági mentés és mappák**: Helyi és tanári Google Drive mentés (`drive.file` hatókör, token csak a memóriában), valamint tetszőleges mapparendszerezés.

---

## Fordítás és lokalizáció

A felhasználói felület és a hozzáférhetőségi címkék teljes egésze magyarul szólal meg (`src/i18n/index.ts`).

| Terület | Állapot |
|---|---|
| Nyelvi réteg (`t()`, `useT()`, `countOf()`, nyelvválasztás, `<html lang>`) | kész, típusbiztos |
| Héj, navigáció, morzsamenü, súgó, lábléc | kész |
| Kezdőlap (táblázatos és kártyás nézet, kereső, szűrők, rendezés) | kész |
| Szerkesztő (dolgozat-oldal, eszköztár, szakaszok, formázás) | kész |
| Kérdésbank-felületek, import, beállítások, fiók, A projektről, Adatvédelem | kész |
| Kvízjátékok (színpadok, lobbi, diák-eszközök, táblaépítő, tanulókártyák) | kész |
| Hozzáférhetőség (aria-label, title, placeholder, I/H igaz-hamis jelölés) | kész |
| Nyomtatott feladatlap, válaszkulcs, PDF és Word export fejlécei | kész, mindhárom kimeneten egységes |

---

## Fejlesztés és futtatás

A projekt [Bun](https://bun.sh/) csomagkezelőt és futtatókörnyezetet használ:

```sh
bun install
bun run dev          # Fejlesztői szerver indítása (http://localhost:8000)
bun run dev:room     # Helyi szoba-relay indítása a diák-eszközös játékokhoz (8788)
bun run build        # Típusellenőrzés + éles Vite build (dist/)
bun test             # 1841 egységteszt futtatása (134 fájl, gyors és zöld)
bun run test:e2e     # Teljes Playwright e2e tesztkészlet
bun run test:e2e:fast # Gyors e2e tesztek a kvízjátékhoz
```

---

## Hogyan épül fel

A forráskód moduláris, szerepkörök szerint rendezett mappákban él:

- **`src/editor/`** — A feladatszerkesztő magja: Milkdown és Crepe integráció, kérdéstípusok (`multiple-choice.ts`, `matching.ts`, `blank.ts`), dokumentum-nézetek, képkezelés és fogd-és-vidd mechanizmusok.
- **`src/exam/`** — Dolgozatmodell: feladatsor összeállítása, pontszámítás, szakaszok és kérdések vetítése.
- **`src/bank/`** — Kérdésbankok: tárolás, szerkesztőpanel, mappák (`folders.ts`), kérdések keresése és másolása.
- **`src/import/`** — Behozatal: formátumfelismerés, többféle formátum elemzője (`question-formats/`), csomagok és importtörténet.
- **`src/export/`** — Kiviteli motor: a feladatlap és válaszkulcs elrendezési terve (`plan.ts`), PDF generálás (`pdf-*.ts`), Word dokumentumok (`docx-*.ts`), nyomtatási CSS és tipográfia.
- **`src/game/`** — Kvízjátékok: keretrendszer-független motorkészlet (`classic/`, `peril/`, `race.ts`, `boss.ts`, `flashcard.ts`), színpadok (`stage.tsx`, `peril-stage.tsx`, `champion-stage.tsx`), Veszély! táblaépítő (`peril-builder.tsx`), diák-felületek (`student.tsx`, `devices.tsx`), szobaprotokoll (`room-protocol.ts`) és eredménytároló (`results-store.ts`).
- **`src/storage/`** — Perzisztens tárolás: IndexedDB séma (`storage-schema.ts`), biztonsági mentések exportálása/importálása (`account-backup.ts`) és Google Drive szinkronizáció (`google-drive.ts`, `drive-backup.ts`).
- **`workers/room/`** — Cloudflare Durable Object alapú, alacsony késleltetésű szoba-relay a mobil eszközös diák-csatlakozáshoz (akár 50 egyidejű diákig).

---

## Kvízjátékok részletesen

A `/jatek` oldal a **Class Gauntlet** Apache-2.0 motorjának korszerű átültetése:

1. **Vezérlés kétféle módon**:
   - **Kivetítés**: A tanár a projektoron vezérli a játékot; a diákoknak nem szükséges külön eszköz.
   - **Diák-eszközön**: A diákok 6 jegyű szobakóddal vagy QR-kóddal csatlakoznak a telefonjukon. A játékszabályok a tanár böngészőjében futnak, a relay csak a szinkronizációt biztosítja.
2. **Válaszok keverése**: A kártyás kérdések válaszai véletlenszerűen, de determinisztikusan keverednek a kérdés azonosítója alapján (`playableQuestions(..., { shuffleAnswers })`), így a vetítésen és minden diák képernyőjén pontosan ugyanaz a sorrend jelenik meg, anélkül hogy a bank szerzői sorrendje elárulná a megoldást.
3. **Veszély! (Peril) táblaépítő**: A tanár a játék előtt tetszőlegesen elrendezheti a kérdéseket a pontértékek szerint, mezőket cserélhet, új oszlopokat hozhat létre, és a kész elrendezést sablonként elmentheti későbbi órákra.
4. **Tanulókártya pakli**: Időkorlát és verseny nélkül használható interaktív tanulókártyák, szóközre vagy kattintásra forduló kártyalapokkal, magyarázattal a hátoldalon.
5. **Gyakorló mód és hibalista**: A diákok saját tempójukban gyakorolhatnak; a tévesztett kérdések automatikusan bekerülnek a telefonjukon megőrzött hibalistába (`/diak`), amit a következő óráig bármikor újra átnézhetnek.

---

## Ami eltér az eredetitől

A részletes nyilvántartást a `NOTICE.md` tartalmazza. Főbb különbségek:
- Teljes magyar lokalizáció és nyelvi réteg.
- Saját arculat, logó, ikonok és megújult táblázatos/kártyás kezdőlap.
- Kvízjáték modul (kivetítés, szobák, táblaépítő, tanulókártyák, eredménytáblázat).
- Google Drive biztonsági mentési lehetőség.
- Mapparendszerezés a bankokhoz és dolgozatokhoz.
- Rögzített I/H (Igaz/Hamis) jelölések a nyomtatott és digitális kimeneteken.

---

## Köszönet

Az eredeti alkalmazást a **teacher.dev** csapata készítette az EdTech-a-thonon, és Apache-2.0 licenc alatt tette közzé. A szerkesztő, az exportok és az alapvető fájlformátumok az ő munkájukra épülnek.

A magyar változat fejlesztője és gondozója: **Farkas Gergely** — <farkas.szte@gmail.com>.
