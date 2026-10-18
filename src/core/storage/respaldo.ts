import { guardarAudioBlob } from '@/core/storage/audio'
import { actualizarCancion, leerCanciones } from '@/core/storage/canciones'
import type { Cancion } from '@/types'

// ═══════════════════════════════════════════════════════════
// 💾 RESPALDO LOCAL AUTOMÁTICO (v0.10.0) — las canciones de
// Suno viven en una URL del CDN; sunoapi.org NO documenta cuánto
// tiempo conserva esos archivos, así que la única garantía real
// es tener el MP3 en el dispositivo. Igual que Lyria (que ya
// guardaba su audio en IndexedDB), cada canción de Suno se copia
// al quedar lista:
//   • el reproductor pasa a leer la copia local (respaldada)
//   • la descarga MP3 también sale de la copia local
//   • aunque el enlace del CDN caduque, NADA se pierde
// Se dispara solo (seguimiento.ts al completarse una tarea, y al
// abrir la Biblioteca para las viejas) y hay botón por si falla.
// ═══════════════════════════════════════════════════════════

/** Las respaldadas en este momento (evita doble descarga del
 * mismo MP3 si el polling y la Biblioteca pican a la vez). */
const enCurso = new Set<string>()

let cicloActivo = false

/** ¿A esta canción le falta la copia local del MP3? */
export function necesitaRespaldo(c: Cancion): boolean {
  return (
    c.estado === 'lista' &&
    !c.respaldada &&
    !c.audioLocal &&
    c.motor !== 'lyria' &&
    typeof c.urlAudio === 'string' &&
    c.urlAudio.length > 0
  )
}

/** Baja el MP3 del CDN y lo guarda en IndexedDB. Silenciosa:
 * devuelve false si no pudo (red, CORS) — el botón de la
 * Biblioteca reintenta cuando el usuario quiera. */
export async function respaldarCancion(c: Cancion): Promise<boolean> {
  if (!necesitaRespaldo(c) || enCurso.has(c.id)) return false
  enCurso.add(c.id)
  try {
    const resp = await fetch(c.urlAudio as string)
    if (!resp.ok) return false
    const blob = await resp.blob()
    if (!blob.size) return false
    await guardarAudioBlob(c.id, blob)
    // ¿se borró mientras bajábamos? entonces no revivimos la tarjeta
    if (!leerCanciones().some((x) => x.id === c.id)) return false
    actualizarCancion(c.id, { respaldada: true })
    return true
  } catch {
    return false
  } finally {
    enCurso.delete(c.id)
  }
}

/** Respalda TODAS las que falten, una por una (educado con los
 * datos del celular). Devuelve cuántas intentó y cuántas pudo. */
export async function respaldarPendientes(): Promise<{ intentadas: number; ok: number }> {
  if (cicloActivo) return { intentadas: 0, ok: 0 }
  cicloActivo = true
  try {
    const pendientes = leerCanciones().filter(necesitaRespaldo)
    let ok = 0
    for (const c of pendientes) {
      if (await respaldarCancion(c)) ok++
    }
    return { intentadas: pendientes.length, ok }
  } finally {
    cicloActivo = false
  }
}
