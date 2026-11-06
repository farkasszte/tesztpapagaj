# Ambient „liftzene" a Tesztpapagáj kvízhez — generálási prompt

A cél: egy **zeneileg semleges, nyugtató, végtelenített szőnyeg**, ami nem versenyez a tanár hangjával, nem hívja fel magára a figyelmet, és nem lehet „elrontani” alacsony hangerőn sem. Nem szignál, nincs dallam, nincs ének, nincs ritmus, amire koppintani lehetne.

## A prompt (ezt add a zenegenerálónak)

> Ambient background loop for a school quiz game, seamless, 2–3 minutes, instrumental only.
> Slow, unobtrusive: a soft warm pad (electric piano or felt piano texture), gentle low-pass filtered,
> no melody, no drums, no percussion, no vocals, no risers or finger snaps.
> Harmonic bed: C major / A minor family, vi–IV–I–V progression, chords changing every 4–8 seconds,
> long overlapping tails, light tape saturation and a distant room reverb (RT60 ~1.8 s).
> Loudness: quiet and even — around -24 LUFS integrated, true peak below -3 dBTP, so it can sit
> under speech without ducking. No sudden dynamics, no builds, no drops, no stereo surprises.
> Loop point: the last bar must be identical in harmony to the first bar; no fade-in or fade-out
> (the player crossfades).
> Mood: calm, focused, a little warm and optimistic — a well-lit library or hotel lobby, not a spa
> advertisement.

## Ha magyar nyelvű generátort használsz

> Készíts 2–3 perces, zökkenőmentesen ismételhető ambient háttérzenét egy iskolai kvízjátékhoz.
> Csak instrumentális: lágy, szűrt pad (elektromos zongora vagy filces zongora textúrával), dallam
> nélkül. Nincs dob, nincs ütő, nincs ének, nincs felfutás. Akkordmenet dúr/moll rokonságban
> (vi–IV–I–V), 4–8 másodpercenként váltva, hosszú, egymásba úszó lecsengéssel, távoli terem-
> visszhanggal. Hangerő: egyenletes, halk, kb. −24 LUFS, hogy beszéd alatt is elférjen; hirtelen
> dinamika és drop nélkül. A hurok vége harmonikusan egyezzen a kezdetével, ne legyen be- és
> kifadülás (a lejátszó átdúsítja). Hangulat: nyugodt, fókuszált, kicsit derűs — világos könyvtár
> vagy hotel előcsarnok, nem wellness-reklám.

## Amit a fájllal tenni kell

- **Formátum:** MP3 (128–192 kbps) vagy OGG; a fájl neve `public/game-ambient/loop-1.mp3`.
- **Hossz:** 2–3 perc. A hurok legyen **mintapontos**: a fájl utolsó üteme ugyanazt a harmóniát
  adja, mint az első, be-/kifadülás nélkül (a lejátszó 400 ms alatt átúsztat, lásd alább).
- **Jog:** csak olyan sáv jöhet, amit szabadon felhasználhatunk (saját generálás, CC0, vagy
  megvásárolt licenc). A fájl mellé `LICENSE.md` a forrással és a licenccel — a projekt
  `NOTICE.md`-je ezt meg fogja nevezni, ahogy a betűtípusoknál is.

## Hogyan köti be a kód (ha a fájl megvan)

1. `public/game-ambient/loop-1.mp3` + `LICENSE.md`.
2. A tanári oldal (`src/game/stage.tsx` és a mód-színpadok) kap egy `<audio loop preload="none">`
   elemet, `crossOrigin` nélkül, és egy kis hangerő-szabályzót a fejlécbe (0–100%, alapból **20%**).
3. **Alapból néma**, és a tanár koppintására indul (a böngésző autoplay-szabálya miatt ez a
   biztos út); a beállítás a `tesztpapagaj:game-ambient` kulcsban marad meg.
4. Átúsztatás: két `<audio>` vendég, 400 ms crossfade a hurok végén — így a minta hossza nem
   hallatszik ki.
5. A diák telefonján **nem** szól: a zene a terem hangja, nem a füles tartalom.
