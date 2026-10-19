import { leer, guardar } from '@/core/storage/almacenamiento'
import type { Cancion } from '@/types'

// ═══════════════════════════════════════════════════════════
// 📚 BIBLIOTECA DE CANCIONES (v0.9.0) — la fuente única de la
// lista de canciones. Antes vivía adentro de MusicaView (cuando
// crear y escuchar eran la misma pantalla); ahora CREAR (Música)
// y ESCUCHAR (Biblioteca) son pestañas separadas y las dos
// necesitan tocar la misma lista sin pisarse.
//
// Regla de la casa: TODO cambio pasa por acá — se guarda en
// storage y se dispara EVENTO_CANCIONES con la lista nueva,
// y cualquier vista montada se refresca sola (el polling de
// seguimiento.ts usa el mismo evento desde la v0.5.0).
// ═══════════════════════════════════════════════════════════

/** Clave de localStorage (prefijo de la app incluido en guardar/leer). */
export const CLAVE_CANCIONES = 'canciones'

/** Evento window con la biblioteca actualizada como detail.
 * ⚠️ tiene que ser el MISMO nombre que usa seguimiento.ts. */
export const EVENTO_CANCIONES = 'musictrack:canciones-actualizadas'

export function leerCanciones(): Cancion[] {
  return leer<Cancion[]>(CLAVE_CANCIONES, [])
}

/** Guarda la lista completa y avisa al resto de la app. */
export function guardarCanciones(cs: Cancion[]): void {
  guardar(CLAVE_CANCIONES, cs)
  window.dispatchEvent(new CustomEvent<Cancion[]>(EVENTO_CANCIONES, { detail: cs }))
}

/** Agrega canciones al PRINCIPIO (las más nuevas primero). */
export function agregarCanciones(nuevas: Cancion[]): void {
  guardarCanciones([...nuevas, ...leerCanciones()])
}

/** Parchea una canción por id (p. ej. el audioId recuperado tarde). */
export function actualizarCancion(id: string, parche: Partial<Cancion>): void {
  guardarCanciones(leerCanciones().map((c) => (c.id === id ? { ...c, ...parche } : c)))
}

/** Saca una canción de la lista (el audio local en IndexedDB lo
 * limpia la vista, que sabe si la canción lo tiene). */
export function borrarCancion(id: string): void {
  guardarCanciones(leerCanciones().filter((c) => c.id !== id))
}
