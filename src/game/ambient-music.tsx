import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'

const STORAGE_KEY = 'tesztpapagaj:game-ambient'
const AUDIO_SRC = '/game-ambient/loop-1.mp3'
const CROSSFADE_SEC = 0.4 // 400ms crossfade between the two audio elements

interface AmbientSettings {
  playing: boolean
  volume: number // 0.0 to 1.0
}

function loadSettings(): AmbientSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        playing: Boolean(parsed.playing),
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 0.2,
      }
    }
  } catch {
    // ignore
  }
  return { playing: false, volume: 0.2 }
}

function saveSettings(settings: AmbientSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

export function AmbientMusicControl({ className }: { className?: string }) {
  const t = useT()
  const [settings, setSettings] = useState<AmbientSettings>(loadSettings)
  const [isPlaying, setIsPlaying] = useState(false)

  const audioRefA = useRef<HTMLAudioElement | null>(null)
  const audioRefB = useRef<HTMLAudioElement | null>(null)
  const activeIdx = useRef<0 | 1>(0)
  const isFading = useRef(false)
  const fadeRaf = useRef<number | null>(null)

  const volume = settings.volume

  // Handle play / pause toggle
  const togglePlay = () => {
    const nextPlaying = !settings.playing
    const next = { ...settings, playing: nextPlaying }
    setSettings(next)
    saveSettings(next)

    const primary = activeIdx.current === 0 ? audioRefA.current : audioRefB.current
    const secondary = activeIdx.current === 0 ? audioRefB.current : audioRefA.current

    if (nextPlaying) {
      if (primary) {
        primary.volume = volume
        primary.play().then(() => {
          setIsPlaying(true)
        }).catch(() => {
          setIsPlaying(false)
        })
      }
    } else {
      if (primary) primary.pause()
      if (secondary) secondary.pause()
      setIsPlaying(false)
    }
  }

  // Handle volume change
  const handleVolumeChange = (nextVol: number) => {
    const clamped = Math.max(0, Math.min(1, nextVol))
    const next = { ...settings, volume: clamped }
    setSettings(next)
    saveSettings(next)

    const primary = activeIdx.current === 0 ? audioRefA.current : audioRefB.current
    if (primary && !isFading.current) {
      primary.volume = clamped
    }
  }

  // Monitor loop crossfading
  useEffect(() => {
    if (!settings.playing) return

    const checkCrossfade = () => {
      const primary = activeIdx.current === 0 ? audioRefA.current : audioRefB.current
      const secondary = activeIdx.current === 0 ? audioRefB.current : audioRefA.current

      if (!primary || !secondary) return

      const dur = primary.duration
      const cur = primary.currentTime

      if (dur > 0 && cur >= dur - CROSSFADE_SEC) {
        const remaining = Math.max(0, dur - cur)
        const ratio = remaining / CROSSFADE_SEC // 1 -> 0
        isFading.current = true

        primary.volume = Math.max(0, Math.min(1, volume * ratio))
        secondary.volume = Math.max(0, Math.min(1, volume * (1 - ratio)))

        if (secondary.paused) {
          secondary.currentTime = 0
          secondary.play().catch(() => {})
        }

        if (cur >= dur - 0.05 || primary.ended) {
          primary.pause()
          primary.currentTime = 0
          secondary.volume = volume
          activeIdx.current = activeIdx.current === 0 ? 1 : 0
          isFading.current = false
        }
      } else if (!isFading.current) {
        primary.volume = volume
      }

      fadeRaf.current = requestAnimationFrame(checkCrossfade)
    }

    fadeRaf.current = requestAnimationFrame(checkCrossfade)
    return () => {
      if (fadeRaf.current !== null) cancelAnimationFrame(fadeRaf.current)
    }
  }, [settings.playing, volume])

  // Stop playback on unmount
  useEffect(() => {
    const a = audioRefA.current
    const b = audioRefB.current
    return () => {
      a?.pause()
      b?.pause()
    }
  }, [])

  return (
    <div
      className={`gq-ambient-control${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={t('game.ambient.title')}
    >
      <audio ref={audioRefA} src={AUDIO_SRC} preload="none" />
      <audio ref={audioRefB} src={AUDIO_SRC} preload="none" />

      <button
        type="button"
        className="gq-ambient-btn"
        onClick={togglePlay}
        aria-label={settings.playing ? t('game.ambient.pause') : t('game.ambient.play')}
        title={settings.playing ? t('game.ambient.pause') : t('game.ambient.play')}
        aria-pressed={settings.playing}
      >
        {settings.playing && isPlaying ? '🔊' : '🔇'}
      </button>

      <input
        type="range"
        className="gq-ambient-slider"
        min="0"
        max="100"
        step="5"
        value={Math.round(volume * 100)}
        onChange={(e) => handleVolumeChange(Number(e.target.value) / 100)}
        aria-label={t('game.ambient.volume')}
        title={`${t('game.ambient.volume')}: ${Math.round(volume * 100)}%`}
      />
      <span className="gq-ambient-val" aria-hidden="true">
        {Math.round(volume * 100)}%
      </span>
    </div>
  )
}
