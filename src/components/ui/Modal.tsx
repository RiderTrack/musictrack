import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

// ═══════════════════════════════════════════════════════════
// 🪟 MODAL — bottom sheet en celular, centrado en desktop.
// Se cierra con tap afuera o Escape.
// ═══════════════════════════════════════════════════════════

interface Props {
  abierto: boolean
  onCerrar: () => void
  titulo?: string
  children: ReactNode
}

export function Modal({ abierto, onCerrar, titulo, children }: Props) {
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo ?? 'Modal'}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl animate-[deslizar_.2s_ease-out] sm:rounded-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          {titulo && <h2 className="text-lg font-bold text-neutral-900 dark:text-white">{titulo}</h2>}
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
