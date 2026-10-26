import { useEffect, useState } from 'react'
import { alternarEnLista, crearLista, EVENTO_LISTAS, leerListas, type ListaReproduccion } from '@/core/storage/listas'
import { useToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import type { Cancion } from '@/types'

// ═══════════════════════════════════════════════════════════
// ➕ MODAL «CANCIÓN → LISTA» (v0.13.0, extraído del reproductor
// a pantalla completa para reusarlo en la pestaña Suena):
// marcás las listas donde querés la canción y podés crear una
// nueva al toque, sin salir del reproductor.
// ═══════════════════════════════════════════════════════════

export function ModalListas({
  cancion,
  abierto,
  onCerrar,
}: {
  cancion: Cancion
  abierto: boolean
  onCerrar: () => void
}) {
  const { mostrar } = useToast()
  const [listas, setListas] = useState<ListaReproduccion[]>(() => leerListas())
  const [nuevaLista, setNuevaLista] = useState('')

  useEffect(() => {
    const alCambiar = (e: Event) => setListas((e as CustomEvent<ListaReproduccion[]>).detail)
    window.addEventListener(EVENTO_LISTAS, alCambiar)
    return () => window.removeEventListener(EVENTO_LISTAS, alCambiar)
  }, [])

  function mandarALista(idLista: string) {
    const dentro = alternarEnLista(idLista, cancion.id)
    const nombre = leerListas().find((l) => l.id === idLista)?.nombre ?? 'la lista'
    mostrar(dentro ? `Agregada a «${nombre}» 🎵` : `La saqué de «${nombre}»`, 'info')
  }

  function crearYAgregar() {
    const nombre = nuevaLista.trim()
    if (!nombre) return
    const l = crearLista(nombre)
    if (!l.ids.includes(cancion.id)) alternarEnLista(l.id, cancion.id)
    setNuevaLista('')
    mostrar(`Lista «${nombre}» creada con esta canción 🎵`, 'info')
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={`«${cancion.titulo}» → lista`}>
      <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
        Marcá las listas donde querés esta canción — desmarcar la saca.
      </p>
      {listas.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {listas.map((l) => {
            const dentro = l.ids.includes(cancion.id)
            return (
              <li key={l.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 transition-colors hover:border-acento/40 dark:border-neutral-800">
                  <input
                    type="checkbox"
                    checked={dentro}
                    onChange={() => mandarALista(l.id)}
                    className="h-4 w-4 shrink-0 accent-acento"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">
                      {l.nombre}
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      {l.ids.length} {l.ids.length === 1 ? 'canción' : 'canciones'}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          value={nuevaLista}
          onChange={(e) => setNuevaLista(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') crearYAgregar()
          }}
          placeholder="Nueva lista — Anime, Gym, Para dormir…"
          className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-acento focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        />
        <button
          type="button"
          onClick={crearYAgregar}
          disabled={!nuevaLista.trim()}
          className="shrink-0 rounded-xl bg-acento px-4 py-2 text-sm font-bold text-black transition-opacity disabled:opacity-40"
        >
          Crear
        </button>
      </div>
    </Modal>
  )
}
