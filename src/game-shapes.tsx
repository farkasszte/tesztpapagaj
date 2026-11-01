/**
 * A színpad rajzoló darabjai: a válaszok jelvénye és a nagy visszaszámláló.
 * A színek és a horgok a `game-parts.ts`-ben vannak, mert ez a fájl csak
 * komponenst exportál (a Fast Refresh így tud frissülni).
 */

/** A válasz jelvénye: kehely, pajzs, korona, torony — szín nélkül is megkülönböztet. */
export function Shape({ index }: { index: number }) {
  return (
    <svg className="gq-mark" viewBox="0 0 32 32" aria-hidden="true">
      {index === 0 ? (
        <>
          <path d="M6 3 H26 Q26.5 13 20.5 16.5 Q17.6 18 17.6 20.5 V23.5 Q21.5 24.5 23 27 V29.5 H9 V27 Q10.5 24.5 14.4 23.5 V20.5 Q14.4 18 11.5 16.5 Q5.5 13 6 3 Z" />
          <path d="M8 7.5 H24" className="gq-mark-line" />
        </>
      ) : index === 1 ? (
        <>
          <path d="M5 3.5 H27 V14 Q27 24.5 16 30.5 Q5 24.5 5 14 Z" />
          <path d="M16 6 V27 M8 13 H24" className="gq-mark-line" />
        </>
      ) : index === 2 ? (
        <>
          <path d="M3.5 23 L5 9 L11 15.5 L16 5 L21 15.5 L27 9 L28.5 23 Z" />
          <rect x="3.5" y="24.5" width="25" height="4.5" rx="1.2" />
          <circle cx="5" cy="8" r="2" />
          <circle cx="16" cy="4" r="2" />
          <circle cx="27" cy="8" r="2" />
        </>
      ) : (
        <path
          fillRule="evenodd"
          d="M5 30 V7 H9.5 V11 H13.5 V7 H18.5 V11 H22.5 V7 H27 V30 Z M12.5 30 V23 Q16 18.5 19.5 23 V30 Z"
        />
      )}
    </svg>
  )
}

const RING = 44
const AROUND = 2 * Math.PI * RING

/** A nagy visszaszámláló; 5 másodperc alatt vörösre vált és pulzál. */
export function Ring({ remaining, total }: { remaining: number; total: number }) {
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
    </div>
  )
}
