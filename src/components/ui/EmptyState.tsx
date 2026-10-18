import type { ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════
// 📭 ESTADO VACÍO — cuando una lista no tiene nada todavía.
// Patrón "agregá tu primera planta" de PlantTrack.
// ═══════════════════════════════════════════════════════════

interface Props {
  icono: ReactNode
  titulo: string
  descripcion: string
  accion?: ReactNode
}

export function EmptyState({ icono, titulo, descripcion, accion }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-acento/15 text-acento">{icono}</div>
      <h3 className="mt-4 text-base font-bold text-neutral-900 dark:text-white">{titulo}</h3>
      <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">{descripcion}</p>
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  )
}
