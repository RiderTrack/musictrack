import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { guardar, leer } from '@/core/storage/almacenamiento'
import { acentoPorId, type Tema } from '@/types'

// ═══════════════════════════════════════════════════════════
// 🎨 TEMA — patrón RiderTrack: oscuro (default) / claro / auto.
// Aplica la clase `dark` en <html> y actualiza la meta
// theme-color del navegador/WebView. Se persiste solo.
// v0.13.0 — dos juguetes nuevos:
//   • NEGRO AMOLED: resuelve a oscuro + clase `amoled` que pinta
//     los fondos de negro puro (batería en pantallas OLED)
//   • ACENTO a elección: el color de toda la app vive en la
//     variable --ts-acento — violeta, esmeralda, cielo, ámbar,
//     rosa o rojo, desde Ajustes → Apariencia
// ═══════════════════════════════════════════════════════════

interface CtxTema {
  tema: Tema
  temaResuelto: 'oscuro' | 'claro'
  fijarTema: (t: Tema) => void
  /** v0.13.0 — id del acento elegido (violeta, esmeralda…). */
  acento: string
  fijarAcento: (id: string) => void
}

const Ctx = createContext<CtxTema | null>(null)

function resolver(t: Tema): 'oscuro' | 'claro' {
  if (t === 'claro') return 'claro'
  return 'oscuro' // 'oscuro' | 'auto' (según sistema) | 'amoled'
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(() => leer<Tema>('tema', 'oscuro'))
  const [acento, setAcento] = useState<string>(() => leer('acento', 'violeta'))

  useEffect(() => {
    const aplicar = () => {
      const resuelto = resolver(tema)
      const raiz = document.documentElement
      raiz.classList.toggle('dark', resuelto === 'oscuro')
      // 🖤 AMOLED: además del dark, fondos de negro absoluto
      raiz.classList.toggle('amoled', tema === 'amoled')
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', tema === 'amoled' ? '#000000' : resuelto === 'oscuro' ? '#0a0a0a' : '#fafafa')
    }
    aplicar()
    guardar('tema', tema)

    if (tema === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: light)')
      mq.addEventListener('change', aplicar)
      return () => mq.removeEventListener('change', aplicar)
    }
  }, [tema])

  useEffect(() => {
    document.documentElement.style.setProperty('--ts-acento', acentoPorId(acento))
    guardar('acento', acento)
  }, [acento])

  const valor = useMemo<CtxTema>(
    () => ({ tema, temaResuelto: resolver(tema), fijarTema: setTema, acento, fijarAcento: setAcento }),
    [tema, acento],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useTema(): CtxTema {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTema debe usarse dentro de <TemaProvider>')
  return ctx
}
