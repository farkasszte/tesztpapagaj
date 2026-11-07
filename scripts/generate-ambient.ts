import { spawnSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

// Synthesizes a warm, seamless ambient pad loop based on docs/ambient-zene.md
// Harmonic bed: C major / A minor family, vi-IV-I-V progression.
// Soft warm pad, slow evolving, gentle tape saturation & distant reverb.

const SAMPLE_RATE = 44100
const CHORD_DURATION = 8 // seconds per chord
const CHORDS_PER_CYCLE = 4 // Am, F, C, G
const CYCLE_DURATION = CHORD_DURATION * CHORDS_PER_CYCLE // 32 seconds
const CYCLES = 4
const LOOP_DURATION = CYCLE_DURATION * CYCLES // 128 seconds
const WRAP_DURATION = 16 // Extra seconds to wrap around for seamless loop
const TOTAL_DURATION = LOOP_DURATION + WRAP_DURATION

// Chord definitions in Hz
const CHORD_FREQS = [
  // vi: Am9
  [110.0, 164.81, 220.0, 246.94, 261.63, 329.63],
  // IV: Fmaj7
  [87.31, 130.81, 174.61, 220.0, 261.63, 329.63],
  // I: Cadd9
  [65.41, 98.0, 164.81, 196.0, 261.63, 293.66],
  // V: G(add9)
  [98.0, 146.83, 196.0, 246.94, 293.66, 392.0],
]

const totalSamples = Math.floor(TOTAL_DURATION * SAMPLE_RATE)
const leftChannel = new Float32Array(totalSamples)
const rightChannel = new Float32Array(totalSamples)

const totalChords = CYCLES * CHORDS_PER_CYCLE + Math.ceil(WRAP_DURATION / CHORD_DURATION)

console.log(`Generating ${LOOP_DURATION}s ambient loop (${totalChords} chords)...`)

for (let c = 0; c < totalChords; c++) {
  const chordIndex = c % CHORDS_PER_CYCLE
  const freqs = CHORD_FREQS[chordIndex]
  const chordStartTime = c * CHORD_DURATION
  const chordStartSample = Math.floor(chordStartTime * SAMPLE_RATE)

  // Envelope: 3.5s attack, 4.5s sustain, 7s release (total 15s)
  const envDuration = 15.0
  const envSamples = Math.floor(envDuration * SAMPLE_RATE)

  for (let fIdx = 0; fIdx < freqs.length; fIdx++) {
    const baseFreq = freqs[fIdx]
    // Pan: spread voices across stereo field
    const pan = ((fIdx / (freqs.length - 1)) - 0.5) * 0.6 // -0.3 to +0.3
    const panL = Math.cos(((pan + 1) * Math.PI) / 4)
    const panR = Math.sin(((pan + 1) * Math.PI) / 4)

    // Slight chorus/detune: two oscillators per note
    const detune1 = 1.0 - 0.0012
    const detune2 = 1.0 + 0.0012

    let phase1 = Math.random() * Math.PI * 2
    let phase2 = Math.random() * Math.PI * 2

    const endSample = Math.min(totalSamples, chordStartSample + envSamples)

    for (let s = chordStartSample; s < endSample; s++) {
      const localSample = s - chordStartSample
      const t = localSample / SAMPLE_RATE

      // Soft envelope
      let amp = 0
      if (t < 3.5) {
        amp = 0.5 * (1 - Math.cos((Math.PI * t) / 3.5)) // Smooth sine attack
      } else if (t < 8.0) {
        amp = 1.0
      } else {
        const relT = (t - 8.0) / 7.0
        amp = 0.5 * (1 + Math.cos(Math.PI * relT)) // Smooth cosine release
      }

      // Voice amplitude scaling (lower notes slightly stronger, high notes softer)
      const voiceWeight = 0.18 / Math.sqrt(baseFreq / 100)

      // Oscillators (warm sine + soft octave harmonic)
      const osc1 = Math.sin(phase1) + 0.25 * Math.sin(phase1 * 2)
      const osc2 = Math.sin(phase2) + 0.25 * Math.sin(phase2 * 2)

      phase1 += (2 * Math.PI * baseFreq * detune1) / SAMPLE_RATE
      phase2 += (2 * Math.PI * baseFreq * detune2) / SAMPLE_RATE
      if (phase1 > 2000000) phase1 %= Math.PI * 2
      if (phase2 > 2000000) phase2 %= Math.PI * 2

      // Gentle vibrato (LFO at 0.15 Hz)
      const lfo = 1.0 + 0.002 * Math.sin(2 * Math.PI * 0.15 * (s / SAMPLE_RATE))
      const sampleVal = (osc1 + osc2) * 0.5 * amp * voiceWeight * lfo

      leftChannel[s] += sampleVal * panL
      rightChannel[s] += sampleVal * panR
    }
  }
}

// Reverb simulation (Schroeder comb + allpass delay lines)
console.log('Applying room reverb...')
function applyReverb(samples: Float32Array): Float32Array {
  const out = new Float32Array(samples.length)
  const combDelays = [1557, 1617, 1491, 1422] // in samples (~35ms)
  const combGain = 0.82

  const combBuffers = combDelays.map((d) => new Float32Array(d))
  const combIndices = combDelays.map(() => 0)

  for (let i = 0; i < samples.length; i++) {
    const input = samples[i]
    let combSum = 0

    for (let c = 0; c < combDelays.length; c++) {
      const buf = combBuffers[c]
      const idx = combIndices[c]
      const delayed = buf[idx]
      buf[idx] = input + delayed * combGain
      combSum += delayed
      combIndices[c] = (idx + 1) % combDelays[c]
    }

    out[i] = input * 0.65 + combSum * 0.35 * 0.25
  }
  return out
}

const revLeft = applyReverb(leftChannel)
const revRight = applyReverb(rightChannel)

// Wrap-around for seamless looping
console.log('Wrapping loop boundaries for seamless continuity...')
const loopSamples = Math.floor(LOOP_DURATION * SAMPLE_RATE)
const wrapSamples = Math.floor(WRAP_DURATION * SAMPLE_RATE)

const finalLeft = new Float32Array(loopSamples)
const finalRight = new Float32Array(loopSamples)

for (let i = 0; i < loopSamples; i++) {
  finalLeft[i] = revLeft[i]
  finalRight[i] = revRight[i]
}

// Add the wrapped tail into the beginning
for (let i = 0; i < wrapSamples; i++) {
  finalLeft[i] += revLeft[loopSamples + i]
  finalRight[i] += revRight[loopSamples + i]
}

// Find peak to normalize safely before WAV write
let peak = 0
for (let i = 0; i < loopSamples; i++) {
  const absL = Math.abs(finalLeft[i])
  const absR = Math.abs(finalRight[i])
  if (absL > peak) peak = absL
  if (absR > peak) peak = absR
}

const normFactor = peak > 0 ? 0.85 / peak : 1.0

// Create 16-bit PCM WAV in memory
console.log(`Writing PCM WAV (${loopSamples} samples)...`)
const numChannels = 2
const bytesPerSample = 2
const blockAlign = numChannels * bytesPerSample
const byteRate = SAMPLE_RATE * blockAlign
const dataSize = loopSamples * blockAlign
const buffer = Buffer.alloc(44 + dataSize)

// RIFF header
buffer.write('RIFF', 0)
buffer.writeUInt32LE(36 + dataSize, 4)
buffer.write('WAVE', 8)
buffer.write('fmt ', 12)
buffer.writeUInt32LE(16, 16) // Subchunk1Size
buffer.writeUInt16LE(1, 20) // AudioFormat 1 = PCM
buffer.writeUInt16LE(numChannels, 22)
buffer.writeUInt32LE(SAMPLE_RATE, 24)
buffer.writeUInt32LE(byteRate, 28)
buffer.writeUInt16LE(blockAlign, 32)
buffer.writeUInt16LE(16, 34) // BitsPerSample
buffer.write('data', 36)
buffer.writeUInt32LE(dataSize, 40)

let offset = 44
for (let i = 0; i < loopSamples; i++) {
  const sampleL = Math.max(-1, Math.min(1, finalLeft[i] * normFactor))
  const sampleR = Math.max(-1, Math.min(1, finalRight[i] * normFactor))
  const intL = Math.floor(sampleL < 0 ? sampleL * 32768 : sampleL * 32767)
  const intR = Math.floor(sampleR < 0 ? sampleR * 32768 : sampleR * 32767)
  buffer.writeInt16LE(intL, offset)
  buffer.writeInt16LE(intR, offset + 2)
  offset += 4
}

const tempWav = join(__dirname, '../public/game-ambient/temp-loop.wav')
const outMp3 = join(__dirname, '../public/game-ambient/loop-1.mp3')
writeFileSync(tempWav, buffer)

console.log('Encoding with ffmpeg and normalizing to -24 LUFS...')
// Run ffmpeg loudnorm to -24 LUFS integrated, true peak -3 dBTP
const ffmpeg = spawnSync('ffmpeg', [
  '-y',
  '-i',
  tempWav,
  '-af',
  'loudnorm=I=-24:TP=-3:LRA=7',
  '-codec:a',
  'libmp3lame',
  '-b:a',
  '192k',
  outMp3,
])

if (ffmpeg.status !== 0) {
  console.error('ffmpeg failed:', ffmpeg.stderr.toString())
  process.exit(1)
}

try {
  unlinkSync(tempWav)
} catch {
  // ignore
}

console.log(`Success! Created: ${outMp3}`)

