import type { BossTier } from './boss'

/**
 * Sárkány grafika a Sárkányok völgye játékmódhoz.
 *
 * Kategóriák szerint eltérő színvilág:
 * - Békés (40%): smaragdzöld test, lime/arany szarvak, lágy zöld aura.
 * - Harcias (60%): kobaltkék/jégkék test, ezüst szarvak, villámló kék aura.
 * - Legendás (80%): rubinvörös test, arany szarvak, lángoló vörös aura.
 *
 * Állapotok:
 * - Normál: büszke sárkány borostyán/kék/zöld szemekkel és egyenletes lélegzéssel.
 * - Dühöngő (HP <= 33%): izzó szemek, parázsló szarvak, orrgőz és aura.
 * - Győzelem (az osztály győzött): levert, lezárt szemű sárkány.
 * - Vereség (az osztály pajzsa eltört): ordító, diadallal lángot fújó sárkány.
 */

export function DragonGraphic({
  tier = 'legendary',
  enraged = false,
  hp = 100,
  outcome = null,
  className = '',
}: {
  tier?: BossTier
  enraged?: boolean
  hp?: number
  outcome?: 'win' | 'lose' | 'draw' | 'survived' | null
  className?: string
}) {
  const isDead = outcome === 'win' || hp <= 0
  const isVictorious = outcome === 'lose'
  const isEnraged = enraged && !isDead

  // Színpaletta a sárkány kategóriája szerint
  const colors = {
    legendary: {
      headTop: isEnraged ? '#c92a2a' : '#992222',
      headMid: isEnraged ? '#771111' : '#551111',
      headDark: '#220606',
      hornTop: isEnraged ? '#ffc078' : '#e9c46a',
      hornMid: isEnraged ? '#d97706' : '#b08938',
      hornDark: '#3d2817',
      plateTop: '#f59f00',
      plateMid: '#b45309',
      plateDark: '#451a03',
      neckBase: '#3a0c0e',
      neckStroke: '#1a0405',
      headStroke: isEnraged ? '#ff4500' : '#45090b',
      snout: isEnraged ? '#551212' : '#400c0e',
      brow: '#1a0405',
      eye: isEnraged ? '#fff066' : '#f59f00',
      glow: '#ff4500',
      jaw: '#1e0405',
      jawStroke: '#42080a',
      fire1: '#ff4500',
      fire2: '#ffb703',
      spark: '#ffd166',
    },
    fierce: {
      headTop: isEnraged ? '#339af0' : '#1864ab',
      headMid: isEnraged ? '#115599' : '#0c3f6e',
      headDark: '#05192d',
      hornTop: isEnraged ? '#d0ebff' : '#a5d8ff',
      hornMid: isEnraged ? '#74c0fc' : '#4dabf7',
      hornDark: '#183b56',
      plateTop: '#66d9e8',
      plateMid: '#15aabf',
      plateDark: '#083344',
      neckBase: '#09223a',
      neckStroke: '#04111d',
      headStroke: isEnraged ? '#339af0' : '#0b2b4a',
      snout: isEnraged ? '#103e68' : '#0a2945',
      brow: '#04111d',
      eye: isEnraged ? '#e7f5ff' : '#4dabf7',
      glow: '#228be6',
      jaw: '#081d33',
      jawStroke: '#0c3f6e',
      fire1: '#38d9a9',
      fire2: '#3bc9db',
      spark: '#e7f5ff',
    },
    peaceful: {
      headTop: isEnraged ? '#40c057' : '#2b8a3e',
      headMid: isEnraged ? '#206630' : '#1b5226',
      headDark: '#08200d',
      hornTop: isEnraged ? '#e9fac8' : '#d8f5a2',
      hornMid: isEnraged ? '#94d82d' : '#82c91e',
      hornDark: '#233a0c',
      plateTop: '#94d82d',
      plateMid: '#5c940d',
      plateDark: '#1f3604',
      neckBase: '#14331a',
      neckStroke: '#06150a',
      headStroke: isEnraged ? '#51cf66' : '#0e3014',
      snout: isEnraged ? '#1d4825' : '#133219',
      brow: '#06150a',
      eye: isEnraged ? '#fff3bf' : '#c0eb75',
      glow: '#51cf66',
      jaw: '#0b2110',
      jawStroke: '#1b5226',
      fire1: '#69db7c',
      fire2: '#a9e34b',
      spark: '#f4fce3',
    },
  }[tier]

  const p = `dragon-${tier}`

  return (
    <svg
      viewBox="0 0 100 100"
      className={`gq-dragon-svg ${isEnraged ? 'gq-dragon--enraged' : ''} ${isDead ? 'gq-dragon--dead' : ''} ${isVictorious ? 'gq-dragon--victorious' : ''} ${className}`}
      data-tier={tier}
      aria-hidden="true"
    >
      <defs>
        {/* Pikkelyek színátmenete */}
        <radialGradient id={`${p}-head-grad`} cx="45%" cy="40%" r="55%">
          <stop offset="0%" stopColor={colors.headTop} />
          <stop offset="65%" stopColor={colors.headMid} />
          <stop offset="100%" stopColor={colors.headDark} />
        </radialGradient>

        {/* Szarvak színátmenete */}
        <linearGradient id={`${p}-horn-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.hornTop} />
          <stop offset="50%" stopColor={colors.hornMid} />
          <stop offset="100%" stopColor={colors.hornDark} />
        </linearGradient>

        {/* Nyaki pikkelylemezek */}
        <linearGradient id={`${p}-plate-grad`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={colors.plateTop} />
          <stop offset="50%" stopColor={colors.plateMid} />
          <stop offset="100%" stopColor={colors.plateDark} />
        </linearGradient>

        {/* Lángcsóva / mágikus lehelet */}
        <linearGradient id={`${p}-fire-grad`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={colors.fire1} stopOpacity="0.95" />
          <stop offset="50%" stopColor={colors.fire2} stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Izzás szűrő */}
        <filter id={`${p}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Dühöngő állapotban tüzes háttér-ragyogás */}
      {isEnraged && (
        <circle cx="50" cy="50" r="42" fill={colors.glow} opacity="0.22" filter={`url(#${p}-glow)`} />
      )}

      {/* Hátsó szarvak */}
      <g className="gq-dragon-back-horns">
        <path
          d="M34 32 C26 22 18 10 12 4 C14 12 18 24 28 36 Z"
          fill={`url(#${p}-horn-grad)`}
          opacity="0.85"
        />
        <path
          d="M66 32 C74 22 82 10 88 4 C86 12 82 24 72 36 Z"
          fill={`url(#${p}-horn-grad)`}
          opacity="0.85"
        />
        <path
          d="M28 42 C18 36 8 32 2 30 C7 37 15 44 24 47 Z"
          fill={`url(#${p}-horn-grad)`}
          opacity="0.75"
        />
        <path
          d="M72 42 C82 36 92 32 98 30 C93 37 85 44 76 47 Z"
          fill={`url(#${p}-horn-grad)`}
          opacity="0.75"
        />
      </g>

      {/* Nyak és pikkelyes háttér */}
      <path
        d="M32 58 L24 88 L40 96 L50 97 L60 96 L76 88 L68 58 Z"
        fill={colors.neckBase}
        stroke={colors.neckStroke}
        strokeWidth="1.5"
      />

      {/* Nyaki pikkelylemezek */}
      <path
        d="M38 70 Q50 75 62 70 L60 78 Q50 83 40 78 Z"
        fill={`url(#${p}-plate-grad)`}
        opacity="0.9"
      />
      <path
        d="M40 79 Q50 84 60 79 L58 87 Q50 92 42 87 Z"
        fill={`url(#${p}-plate-grad)`}
        opacity="0.85"
      />

      {/* Fej alaptest */}
      <path
        d="M30 38 Q50 28 70 38 Q78 52 74 68 Q50 84 26 68 Q22 52 30 38 Z"
        fill={`url(#${p}-head-grad)`}
        stroke={colors.headStroke}
        strokeWidth={isEnraged ? '1.8' : '1.2'}
      />

      {/* Fő elülső szarvak */}
      <g className="gq-dragon-front-horns">
        <path
          d="M36 34 C30 18 20 6 13 2 C18 12 24 26 34 40 Z"
          fill={`url(#${p}-horn-grad)`}
          stroke={colors.hornDark}
          strokeWidth="0.8"
        />
        <path
          d="M64 34 C70 18 80 6 87 2 C82 12 76 26 66 40 Z"
          fill={`url(#${p}-horn-grad)`}
          stroke={colors.hornDark}
          strokeWidth="0.8"
        />
      </g>

      {/* Pofa gerince és orrhát */}
      <path
        d="M45 36 L55 36 L58 64 L50 72 L42 64 Z"
        fill={colors.snout}
        opacity="0.75"
      />

      {/* Szemöldökbordák */}
      <path
        d="M32 46 Q42 42 47 48"
        fill="none"
        stroke={colors.brow}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M68 46 Q58 42 53 48"
        fill="none"
        stroke={colors.brow}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Szemek */}
      {isDead ? (
        <g stroke="#884444" strokeWidth="2" strokeLinecap="round">
          <line x1="36" y1="48" x2="44" y2="54" />
          <line x1="44" y1="48" x2="36" y2="54" />
          <line x1="56" y1="48" x2="64" y2="54" />
          <line x1="64" y1="48" x2="56" y2="54" />
        </g>
      ) : (
        <g className="gq-dragon-eyes">
          <polygon
            points="35,50 45,47 44,53 36,54"
            fill={colors.eye}
            filter={isEnraged ? `url(#${p}-glow)` : undefined}
          />
          <line
            x1="40"
            y1="47"
            x2="40"
            y2="53"
            stroke={colors.brow}
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          <polygon
            points="65,50 55,47 56,53 64,54"
            fill={colors.eye}
            filter={isEnraged ? `url(#${p}-glow)` : undefined}
          />
          <line
            x1="60"
            y1="47"
            x2="60"
            y2="53"
            stroke={colors.brow}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Orrcimpák */}
      <ellipse cx="44" cy="65" rx="2.2" ry="1.4" fill="#0c0304" />
      <ellipse cx="56" cy="65" rx="2.2" ry="1.4" fill="#0c0304" />

      {/* Állkapocs és fogak */}
      <path
        d="M38 70 Q50 74 62 70 Q50 78 38 70 Z"
        fill={colors.jaw}
        stroke={colors.jawStroke}
        strokeWidth="1"
      />
      <polygon points="41,70 43,75 44,70" fill="#f8f9fa" />
      <polygon points="56,70 57,75 59,70" fill="#f8f9fa" />
      <polygon points="48,72 50,76 52,72" fill="#f8f9fa" />

      {/* Lángcsóva / szikrák, ha dühöng vagy nyert */}
      {(isEnraged || isVictorious) && (
        <g className="gq-dragon-breath">
          <path
            d="M50 67 Q42 58 35 60 Q44 68 50 67 Z"
            fill={`url(#${p}-fire-grad)`}
            opacity="0.85"
          />
          <path
            d="M50 67 Q58 58 65 60 Q56 68 50 67 Z"
            fill={`url(#${p}-fire-grad)`}
            opacity="0.85"
          />
          <circle cx="34" cy="58" r="1.8" fill={colors.spark} opacity="0.9" />
          <circle cx="66" cy="58" r="1.8" fill={colors.spark} opacity="0.9" />
          <circle cx="48" cy="54" r="1.4" fill={colors.fire1} opacity="0.8" />
          <circle cx="53" cy="52" r="1.2" fill={colors.fire2} opacity="0.85" />
        </g>
      )}
    </svg>
  )
}
