/**
 * A színpad rajzoló darabjai: a válasz betűjele, a gong, a hibalehetőség
 * pipája, a díjalap öve és a nagy visszaszámláló. A színek és a horgok a
 * `game-parts.ts`-ben vannak, mert ez a fájl csak komponenst exportál (a Fast
 * Refresh így tud frissülni).
 *
 * A válasz jelvénye szándékosan semleges: a betű és a kártya színe hordozza a
 * megkülönböztetést, nem egy ikon — így a színpad nem vesz fel motívumot,
 * amit később le kellene venni.
 */

/** A válasz betűjele: vékony karika a kártya szélén, benne a betű. */
export function Letter({ letter }: { letter?: string }) {
  return (
    <span className="gq-letter" aria-hidden="true">
      {letter}
    </span>
  )
}

/** Egy hibalehetőség: teli kör, ha megvan, üres, ha elfogyott. */
export function Pip({ used }: { used?: boolean }) {
  return <span className="gq-pip" data-used={used ? 'yes' : 'no'} aria-hidden="true" />
}

/** A gong: a helyes válasz jelvénye. */
export function Bell() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.2a1.3 1.3 0 0 1 1.3 1.3v.8a6.3 6.3 0 0 1 5 6.1v3.4l1.8 2.7a1 1 0 0 1-.85 1.55H4.75a1 1 0 0 1-.85-1.55l1.8-2.7v-3.4a6.3 6.3 0 0 1 5-6.1v-.8A1.3 1.3 0 0 1 12 2.2Z" />
      <path d="M9.6 19.3h4.8a2.4 2.4 0 0 1-4.8 0Z" />
    </svg>
  )
}

/** A díjalap: bajnoki öv, az arany középlappal. */
export function Belt() {
  return (
    <svg className="gq-belt" viewBox="0 0 40 24" aria-hidden="true">
      <path d="M2 6.5h9.5v11H2a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm36 0H28.5v11H38a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Z" />
      <path d="M11.5 4h17v16h-17a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" className="gq-belt-plate" />
      <circle cx="20" cy="12" r="4.6" className="gq-belt-gem" />
    </svg>
  )
}

const RING = 44
const AROUND = 2 * Math.PI * RING

/** A nagy visszaszámláló; 5 másodperc alatt vörösre vált és pulzál. */
export function Ring({
  remaining,
  total,
  unit,
}: {
  remaining: number
  total: number
  /** A szám alatti mértékegység (mp / s). */
  unit?: string
}) {
  const share = Math.max(0, Math.min(1, total ? remaining / total : 0))
  const low = remaining <= 5000
  return (
    <div
      className="gq-timer"
      data-low={low ? 'true' : 'false'}
      style={{ width: 150, height: 150 }}
      role="timer"
      aria-label={String(Math.ceil(remaining / 1000))}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="gq-timer-track" cx="50" cy="50" r={RING} />
        <circle
          className="gq-timer-fill"
          cx="50"
          cy="50"
          r={RING}
          strokeDasharray={AROUND}
          strokeDashoffset={AROUND * (1 - share)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="gq-timer-number">{Math.ceil(remaining / 1000)}</span>
      {unit ? (
        <span className="gq-timer-unit" aria-hidden="true">
          {unit}
        </span>
      ) : null}
    </div>
  )
}
