import { leer, guardar } from '@/core/storage/almacenamiento'
import type { PistaSeparada, TipoSeparacion } from '@/core/ai/suno'

// ═══════════════════════════════════════════════════════════
// 🎚️ v0.20.0 — FASE 18: separaciones de pistas guardadas en el
// dispositivo (karaoke, instrumento solo, todo separado). Las
// URLs de los stems viven 14 días del lado de la API — pasados
// 13 días se limpian solas para no dejar enlaces muertos.
//
// Mismo patrón que prompts.ts: TODO cambio pasa por acá, viaja
// en el respaldo/sync con el prefijo de la app y dispara
// EVENTO_SEPARACIONES para que la vista abierta se refresque.
// ═══════════════════════════════════════════════════════════

export interface Separacion {
  /** taskId de la tarea de separación en sunoapi.org. */
  id: string
  /** id de la Cancion en la biblioteca local. */
  cancionId: string
  tituloCancion: string
  tipo: TipoSeparacion
  /** Instrumento elegido (solo modo split_stem_advanced). */
  instrumento?: string
  fecha: number
  estado: 'procesando' | 'lista' | 'error'
  error?: string
  pistas: PistaSeparada[]
}

export const CLAVE_SEPARACIONES = 'separaciones'
export const EVENTO_SEPARACIONES = 'musictrack:separaciones-actualizadas'

/** Las URLs de la API mueren a los 14 días; a los 13 ya no sirven. */
const VIDA_MS = 13 * 24 * 60 * 60 * 1000

export function leerSeparaciones(): Separacion[] {
  const todas = leer<Separacion[]>(CLAVE_SEPARACIONES, [])
  const ahora = Date.now()
  // limpieza silenciosa: las «lista» caducadas se largan (sus
  // enlaces ya no abren); las vivas y las en curso se quedan
  return todas.filter((s) => s.estado !== 'lista' || ahora - s.fecha < VIDA_MS)
}

function guardarSeparaciones(ss: Separacion[]): void {
  guardar(CLAVE_SEPARACIONES, ss)
  window.dispatchEvent(new CustomEvent<Separacion[]>(EVENTO_SEPARACIONES, { detail: ss }))
}

/** Registra una separación nueva (la más reciente primero). */
export function guardarSeparacion(s: Omit<Separacion, 'pistas'> & { pistas?: PistaSeparada[] }): Separacion {
  const nueva: Separacion = { ...s, pistas: s.pistas ?? [] }
  guardarSeparaciones([nueva, ...leerSeparaciones()])
  return nueva
}

/** Actualiza una separación por id (estado, pistas, error…). */
export function actualizarSeparacion(id: string, cambios: Partial<Omit<Separacion, 'id'>>): void {
  guardarSeparaciones(leerSeparaciones().map((s) => (s.id === id ? { ...s, ...cambios } : s)))
}

export function borrarSeparacion(id: string): void {
  guardarSeparaciones(leerSeparaciones().filter((s) => s.id !== id))
}

/** Las separaciones de UNA canción (para el modal de esa canción). */
export function separacionesDeCancion(cancionId: string): Separacion[] {
  return leerSeparaciones().filter((s) => s.cancionId === cancionId)
}
