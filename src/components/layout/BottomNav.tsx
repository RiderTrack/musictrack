import { Home, Layers, Settings, Sparkles } from 'lucide-react'
import type { PestannaId } from '@/types'
import { vibrar } from '@/core/natives/plataforma'

// ═══════════════════════════════════════════════════════════
// 🧭 BARRA INFERIOR — 4 destinos (patrón WalletTrack v2).
// Para cambiar las pestañas: editá PESTANNAS, el tipo PestannaId
// en types.ts y el switch en App.tsx.
// ═══════════════════════════════════════════════════════════

interface Props {
  activa: PestannaId
  alCambiar: (p: PestannaId) => void
}

const PESTANNAS: Array<{ id: PestannaId; etiqueta: string; icono: typeof Home }> = [
  { id: 'inicio', etiqueta: 'Inicio', icono: Home },
  { id: 'modulo1', etiqueta: 'Módulo 1', icono: Layers },
  { id: 'modulo2', etiqueta: 'Módulo 2', icono: Sparkles },
  { id: 'ajustes', etiqueta: 'Ajustes', icono: Settings },
]

export function BottomNav({ activa, alCambiar }: Props) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 pb-seguro backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
      aria-label="Navegación principal"
    >
      <div className="mx-auto grid max-w-2xl grid-cols-4">
        {PESTANNAS.map(({ id, etiqueta, icono: Icono }) => {
          const activaAhora = id === activa
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
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                activaAhora
                  ? 'text-acento'
                  : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
              }`}
            >
              <Icono className="h-5 w-5" strokeWidth={activaAhora ? 2.5 : 2} />
              <span className="truncate">{etiqueta}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
