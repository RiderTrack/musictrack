import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════
// 🎛️ BOTÓN — variantes lista para usar. Tamaño md = 44px
// (touch target mínimo recomendado).
// ═══════════════════════════════════════════════════════════

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro'
type Tamano = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  tamano?: Tamano
  cargando?: boolean
  icono?: ReactNode
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-95 select-none disabled:opacity-50 disabled:pointer-events-none'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-acento text-black shadow-sm hover:brightness-110',
  secundario:
    'bg-neutral-200 text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700',
  fantasma: 'bg-transparent text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
  peligro: 'bg-red-500/90 text-white hover:bg-red-500',
}

const TAMANOS: Record<Tamano, string> = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export const Boton = forwardRef<HTMLButtonElement, Props>(function Boton(
  { variante = 'primario', tamano = 'md', cargando = false, icono, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || cargando}
      className={`${BASE} ${VARIANTES[variante]} ${TAMANOS[tamano]} ${className}`}
      {...rest}
    >
      {cargando ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      ) : (
        icono
      )}
      {children}
    </button>
  )
})
