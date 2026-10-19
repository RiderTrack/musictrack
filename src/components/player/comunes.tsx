import { leer } from '@/core/storage/almacenamiento'
import type { Cancion, Letra } from '@/types'

// ═══════════════════════════════════════════════════════════
// 🧩 COMUNES DEL REPRODUCTOR (v0.13.0) — pedazos que comparten
// la PANTALLA COMPLETA (ReproductorCompleto) y la PESTAÑA nueva
// (ReproductorView): mismo now-playing en las dos casas.
// ═══════════════════════════════════════════════════════════

/** 1:23 · 4:05 … */
export function formatoTiempo(seg: number): string {
  if (!Number.isFinite(seg) || seg < 0) return '0:00'
  const m = Math.floor(seg / 60)
  const s = Math.floor(seg % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** La letra de una canción: la que viajó al motor, o la de la
 * biblioteca de letras con la que se creó (las viejas). */
export function letraDeCancion(c: Cancion): string {
  if (c.letraTexto) return c.letraTexto
  if (c.letraId) {
    const guardada = leer<Letra[]>('letras', []).find((l) => l.id === c.letraId)
    if (guardada?.texto) return guardada.texto
  }
  return ''
}

/** Las tres barritas de «está sonando» en la cola. */
export function BarrasSonando() {
  return (
    <span className="flex h-4 items-end justify-center gap-[2.5px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-sm bg-acento"
          style={{ height: `${6 + (i % 2) * 4}px`, animation: `saltitos .9s ${i * 0.18}s infinite ease-in-out` }}
        />
      ))}
    </span>
  )
}

/** v0.13.0 — ⏱ el tiempo del timer de sueño en formato «29:59». */
export function formatoTimer(seg: number): string {
  const m = Math.floor(seg / 60)
  const s = Math.floor(seg % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
