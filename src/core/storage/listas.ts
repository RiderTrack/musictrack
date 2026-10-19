import { leer, guardar } from '@/core/storage/almacenamiento'

// ═══════════════════════════════════════════════════════════
// 🎵 LISTAS DE REPRODUCCIÓN (v0.10.0) — «Anime», «Gym», «Para
// dormir»… el usuario las arma con el ➕ de cada canción de la
// Biblioteca. Mismo patrón que canciones.ts: TODO cambio pasa
// por acá, se guarda y se dispara EVENTO_LISTAS para que las
// vistas montadas se refresquen solas.
//
// Las listas guardan SOLO ids: si una canción se borra, deja de
// aparecer en la lista sin dejar basura (como Spotify).
// ═══════════════════════════════════════════════════════════

export interface ListaReproduccion {
  id: string
  nombre: string
  /** Ids de canciones, en el ORDEN en que se agregaron. */
  ids: string[]
  fecha: number
}

export const CLAVE_LISTAS = 'listas'
export const EVENTO_LISTAS = 'musictrack:listas-actualizadas'

export function leerListas(): ListaReproduccion[] {
  return leer<ListaReproduccion[]>(CLAVE_LISTAS, [])
}

export function guardarListas(ls: ListaReproduccion[]): void {
  guardar(CLAVE_LISTAS, ls)
  window.dispatchEvent(new CustomEvent<ListaReproduccion[]>(EVENTO_LISTAS, { detail: ls }))
}

/** Crea una lista (si ya existe una con ese nombre, la devuelve:
 * no se duplican «Gym» y «gym »). */
export function crearLista(nombre: string): ListaReproduccion {
  const limpio = nombre.trim()
  const actuales = leerListas()
  const existente = actuales.find((l) => l.nombre.toLowerCase() === limpio.toLowerCase())
  if (existente) return existente
  const nueva: ListaReproduccion = {
    id: `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    nombre: limpio,
    ids: [],
    fecha: Date.now(),
  }
  guardarListas([nueva, ...actuales])
  return nueva
}

export function borrarLista(id: string): void {
  guardarListas(leerListas().filter((l) => l.id !== id))
}

export function renombrarLista(id: string, nombre: string): void {
  const limpio = nombre.trim()
  if (!limpio) return
  guardarListas(leerListas().map((l) => (l.id === id ? { ...l, nombre: limpio } : l)))
}

/** Mete o saca una canción de la lista. Devuelve true si quedó DENTRO. */
export function alternarEnLista(idLista: string, idCancion: string): boolean {
  let dentro = false
  guardarListas(
    leerListas().map((l) => {
      if (l.id !== idLista) return l
      const tiene = l.ids.includes(idCancion)
      dentro = !tiene
      return { ...l, ids: tiene ? l.ids.filter((x) => x !== idCancion) : [...l.ids, idCancion] }
    }),
  )
  return dentro
}
