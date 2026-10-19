import type { ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════
// 📊 KPI — tarjetita de indicador (patrón Dashboard RiderTrack)
// ═══════════════════════════════════════════════════════════

interface Props {
  icono: ReactNode
  etiqueta: string
  valor: ReactNode
  detalle?: string
}

export function KPI({ icono, etiqueta, valor, detalle }: Props) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-acento/15 text-acento">
          {icono}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide">{etiqueta}</span>
      </div>
      <p className="mt-2 truncate text-lg font-bold leading-tight text-neutral-900 dark:text-white">{valor}</p>
      {detalle && <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">{detalle}</p>}
    </div>
  )
}
