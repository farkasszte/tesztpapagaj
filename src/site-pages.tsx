import type { PersistentStorageStatus } from './durable-storage'
import { AppShell } from './app-shell'

const SUPPORT_EMAIL = 'farkas.szte@gmail.com'

export function AboutPage({
  persistentStorage,
}: {
  persistentStorage: PersistentStorageStatus
}) {
  return (
    <AppShell
      crumbs={[{ label: 'Kezdőlap', href: '/' }, { label: 'A projektről' }]}
      persistentStorage={persistentStorage}
    >
      <div className="site-prose">
        <h1>A projektről</h1>
        <p className="site-lede">
          Ingyenes eszköz tanároknak, akiknek ugyanaz a dolgozat több sorrendben is kell.
        </p>

        <section className="site-card">
          <div className="site-card-heading">
            <h2>Mi ez, és miért ingyenes?</h2>
          </div>
          <p>
            A Tesztpapagáj azért készült, hogy egy tanár néhány perc alatt rendezett, nyomtatható
            dolgozatot állíthasson össze a saját kérdéseiből — és ugyanazt a dolgozatot
            változatokban is kiadhassa. Nincs fiók, nincs előfizetés, és a munkád a saját
            böngésződben marad.
          </p>
        </section>

        <section className="site-card">
          <h2>Ígéretünk</h2>
          <ul className="site-promise">
            <li>
              <strong>Nincs fizetőfal.</strong> Minden funkció mindenkinek elérhető.
            </li>
            <li>
              <strong>Nincs reklám.</strong> Semmi nem zavarja a munkát.
            </li>
            <li>
              <strong>Nincs személyes adat gyűjtése.</strong> A dolgozataid nem hagyják el a
              gépedet.
            </li>
          </ul>
        </section>

        <section className="site-card">
          <h2>Forrás és licenc</h2>
          <p>
            A Tesztpapagáj a <em>Test Parrot</em> nyílt forráskódú projekt magyar változata,
            amelyet a <em>teacher.dev</em> készített, és Apache License 2.0 alatt adott ki. A magyar
            fordítás és a módosítások ugyanezen licenc alatt érhetők el; a részleteket a repó{' '}
            <code>NOTICE.md</code> és <code>LICENSE</code> fájlja tartalmazza. A név, a logó és a
            felület saját; az eredeti projekt neve és védjegye nem került át.
          </p>
        </section>

        <section className="site-card">
          <h2>Visszajelzés és ötletek</h2>
          <p>
            Örülök, ha írsz: mi működik, mi nem, vagy milyen eszközre lenne szükséged. Igyekszem
            segíteni.
          </p>
          <a className="site-button" href={`mailto:${SUPPORT_EMAIL}?subject=Tesztpapag%C3%A1j%20visszajelz%C3%A9s`}>
            Írj e-mailt: {SUPPORT_EMAIL}
          </a>
        </section>
      </div>
    </AppShell>
  )
}

export function PrivacyPage({
  persistentStorage,
}: {
  persistentStorage: PersistentStorageStatus
}) {
  return (
    <AppShell
      crumbs={[{ label: 'Kezdőlap', href: '/' }, { label: 'Adatvédelem' }]}
      persistentStorage={persistentStorage}
    >
      <div className="site-prose">
        <h1>Adatvédelem</h1>
        <p className="site-lede">Mit gyűjtünk, mit nem, és miért.</p>

        <section className="site-card">
          <p>
            A Tesztpapagáj nem gyűjt személyes adatot sem tanároktól, sem tanulóktól. Nincs
            látogatottság-mérés, nincs süti és nincs nyomkövetés: az alkalmazás a saját gépeden fut,
            és nem küld semmit a szerverünkre.
          </p>
          <p>
            A dolgozataid a saját számítógépeden maradnak. A dolgozat, a mentett változatok és a
            beillesztett képek a böngésződ tárhelyén vannak, és nem hagyják el az eszközt. Semmi,
            amit beírsz, nem kerül fel hozzánk vagy máshoz, az exportált fájlok pedig a
            böngésződben készülnek, és egyenesen a letöltések közé kerülnek.
          </p>
          <p>
            Ha kérdésed vagy aggályod van, írj ide:{' '}
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Tesztpapag%C3%A1j%20adatv%C3%A9delem`}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </AppShell>
  )
}
