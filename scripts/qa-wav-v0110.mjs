// QA v0.11.0 — genera un WAV real de 12 s (8 kHz, 16-bit mono)
// para usarlo como urlAudio de las canciones sembradas.
import { writeFileSync, mkdirSync } from 'node:fs'

const SR = 8000
const SEG = 12
const n = SR * SEG
const data = Buffer.alloc(n * 2)
for (let i = 0; i < n; i++) {
  const t = i / SR
  const nota = [261.63, 293.66, 329.63, 392.0][Math.floor(t) % 4]
  const env = Math.min(1, t * 2) * (1 - Math.exp(-(t % 1) * 6))
  const v = Math.sin(2 * Math.PI * nota * t) * 0.25 * env
  data.writeInt16LE(Math.round(v * 32767), i * 2)
}
const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + data.length, 4)
header.write('WAVE', 8)
header.write('fmt ', 12)
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20)
header.writeUInt16LE(1, 22)
header.writeUInt32LE(SR, 24)
header.writeUInt32LE(SR * 2, 28)
header.writeUInt16LE(2, 32)
header.writeUInt16LE(16, 34)
header.write('data', 36)
header.writeUInt32LE(data.length, 40)
mkdirSync(new URL('../public', import.meta.url), { recursive: true })
writeFileSync(new URL('../public/qa-audio-v0110.wav', import.meta.url), Buffer.concat([header, data]))
console.log(`listo: public/qa-audio-v0110.wav (${44 + n * 2} bytes, ${SEG}s)`)
