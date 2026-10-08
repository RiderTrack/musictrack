import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { guardar, leer } from '@/core/storage/almacenamiento'
import type { Tema } from '@/types'

// ═══════════════════════════════════════════════════════════
// 🎨 TEMA — patrón RiderTrack: oscuro (default) / claro / auto.
// Aplica la clase `dark` en <html> y actualiza la meta
// theme-color del navegador/WebView. Se persiste solo.
// ═══════════════════════════════════════════════════════════

interface CtxTema {
  tema: Tema
  temaResuelto: 'oscuro' | 'claro'
  fijarTema: (t: Tema) => void
}

const Ctx = createContext<CtxTema | null>(null)

function resolver(t: Tema): 'oscuro' | 'claro' {
  if (t !== 'auto') return t
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro'
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(() => leer<Tema>('tema', 'oscuro'))

  useEffect(() => {
    const aplicar = () => {
      const resuelto = resolver(tema)
      document.documentElement.classList.toggle('dark', resuelto === 'oscuro')
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', resuelto === 'oscuro' ? '#0a0a0a' : '#fafafa')
    }
    aplicar()
    guardar('tema', tema)

    if (tema === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: light)')
      mq.addEventListener('change', aplicar)
      return () => mq.removeEventListener('change', aplicar)
    }
  }, [tema])

  const valor = useMemo<CtxTema>(() => ({ tema, temaResuelto: resolver(tema), fijarTema: setTema }), [tema])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useTema(): CtxTema {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTema debe usarse dentro de <TemaProvider>')
  return ctx
}
