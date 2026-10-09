import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, XCircle } from 'lucide-react'

// ═══════════════════════════════════════════════════════════
// 🍞 TOASTS — avisos flotantes no bloqueantes (patrón Track).
// Uso:  const { mostrar } = useToast()
//       mostrar('Guardado', 'ok')  // 'ok' | 'error' | 'info'
// ═══════════════════════════════════════════════════════════

type TipoToast = 'info' | 'ok' | 'error'

interface Toast {
  id: number
  mensaje: string
  tipo: TipoToast
}

interface CtxToasts {
  mostrar: (mensaje: string, tipo?: TipoToast, duracionMs?: number) => void
}

const Ctx = createContext<CtxToasts | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const mostrar = useCallback((mensaje: string, tipo: TipoToast = 'info', duracionMs = 2600) => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts.slice(-2), { id, mensaje, tipo }])
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), duracionMs)
  }, [])

  const valor = useMemo(() => ({ mostrar }), [mostrar])

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm shadow-lg animate-[aparecer_.18s_ease-out] dark:border-neutral-700 dark:bg-neutral-900"
          >
            {t.tipo === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-acento" />
            ) : t.tipo === 'error' ? (
              <XCircle className="h-4 w-4 shrink-0 text-red-500" />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-neutral-400" />
            )}
            <span className="text-neutral-800 dark:text-neutral-100">{t.mensaje}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): CtxToasts {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
