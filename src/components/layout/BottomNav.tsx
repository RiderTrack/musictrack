import { Disc3, Home, Library, ListMusic, PlayCircle, Settings, Wand2 } from 'lucide-react'
import { useReproductor } from '@/core/audio/reproductor'
import type { PestannaId } from '@/types'
import { vibrar } from '@/core/natives/plataforma'

// ═══════════════════════════════════════════════════════════
// 🧭 BARRA INFERIOR — 7 destinos (v0.13.0: +🎧 Suena, el
// reproductor con casa propia fuera de la Biblioteca).
// Cuando hay música sonando, la pestaña Suena baila con las
// barritas de «está sonando».
// Para cambiar las pestañas: editá PESTANNAS, el tipo PestannaId
// en types.ts y el switch en App.tsx.
// ═══════════════════════════════════════════════════════════

interface Props {
  activa: PestannaId
  alCambiar: (p: PestannaId) => void
}

const PESTANNAS: Array<{ id: PestannaId; etiqueta: string; icono: typeof Home }> = [
  { id: 'inicio', etiqueta: 'Inicio', icono: Home },
  { id: 'letras', etiqueta: 'Letras', icono: ListMusic },
  { id: 'crear', etiqueta: 'Crear', icono: Wand2 },
  { id: 'musica', etiqueta: 'Música', icono: Disc3 },
  { id: 'reproductor', etiqueta: 'Suena', icono: PlayCircle },
  { id: 'biblioteca', etiqueta: 'Biblioteca', icono: Library },
  { id: 'ajustes', etiqueta: 'Ajustes', icono: Settings },
]

/** Las barritas bailando cuando la pestaña «Suena» está al aire. */
function BarritasNav() {
  return (
    <span className="flex h-5 w-5 items-end justify-center gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-sm bg-current"
          style={{ height: `${8 + (i % 2) * 5}px`, animation: `saltitos .9s ${i * 0.18}s infinite ease-in-out` }}
        />
      ))}
    </span>
  )
}

export function BottomNav({ activa, alCambiar }: Props) {
  const r = useReproductor()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 pb-seguro backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
      aria-label="Navegación principal"
    >
      <div className="mx-auto grid max-w-2xl grid-cols-7">
        {PESTANNAS.map(({ id, etiqueta, icono: Icono }) => {
          const activaAhora = id === activa
          const bailando = id === 'reproductor' && r.sonando
          return (
            <button
              key={id}
              onClick={() => {
                if (!activaAhora) {
                  vibrar()
                  alCambiar(id)
                }
              }}
              aria-current={activaAhora ? 'page' : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-[9.5px] font-semibold transition-colors ${
                activaAhora
                  ? 'text-acento'
                  : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
              }`}
            >
              {bailando ? (
                <BarritasNav />
              ) : (
                <Icono className="h-5 w-5" strokeWidth={activaAhora ? 2.5 : 2} />
              )}
              <span className="truncate">{etiqueta}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
