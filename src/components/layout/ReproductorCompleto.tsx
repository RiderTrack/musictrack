import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { useReproductor } from '@/core/audio/reproductor'
import { leer, guardar } from '@/core/storage/almacenamiento'
import { vibrar } from '@/core/natives/plataforma'
import { useToast } from '@/components/ui/Toast'
import { PanelNowPlaying } from '@/components/player/PanelNowPlaying'
import { PortadaNow } from '@/components/player/PortadaNow'
import { BarraProgreso, FilaControles, FilaTitulo } from '@/components/player/ControlesReproductor'
import { ModalListas } from '@/components/player/ModalListas'

// ═══════════════════════════════════════════════════════════
// 📱 REPRODUCTOR A PANTALLA COMPLETA (v0.11.0) — el «now
// playing» tipo Spotify: se abre tocando la portada o el título
// de la mini-barra. v0.13.0: los paneles (letra karaoke, cola,
// controles, portada con IA, listas) viven en components/player
// y se COMPARTEN con la pestaña «Suena» — acá queda el marco:
//   • encabezado «SONANDO DE <etiqueta>» + cierre
//   • cierre de 5 maneras (v0.11.1):
//   ① botón ATRÁS de Android o del navegador (capa de historial)
//   ② ✕ arriba a la derecha  ③ chevron ⬇ arriba a la izquierda
//   ④ deslizar la portada hacia abajo (con la mano, tipo Spotify)
//   ⑤ tecla Esc — y la música SIGUE sonando en la mini-barra
// ═══════════════════════════════════════════════════════════

/** v0.11.1 — «una ventana aparte que se pueda cerrar»: el
 * reflejo natural para salir es el botón ATRÁS. Mientras una
 * capa está abierta apilamos una entrada en el historial: el
 * ATRÁS la consume y cierra ESA capa (primero el modal ➕,
 * después la pantalla completa) en vez de irse de la app. Si se
 * cierra por UI (✕, ⬇, swipe), la entrada se retira sola para
 * no dejar basura en el historial. */
const capasHistorial: number[] = []
let retirandoPropia = false

function usarCapaHistorial(activo: boolean, cerrar: () => void) {
  const cerrarRef = useRef(cerrar)
  useEffect(() => {
    cerrarRef.current = cerrar
  }, [cerrar])

  useEffect(() => {
    if (!activo) return
    const id = Math.random()
    capasHistorial.push(id)
    try {
      history.pushState({ mtCapa: id }, '')
    } catch {
      /* WebView sin historial: el ATRÁS queda sin capa, no pasa nada */
      return () => {
        const i = capasHistorial.lastIndexOf(id)
        if (i >= 0) capasHistorial.splice(i, 1)
      }
    }
    const alRetroceder = () => {
      if (retirandoPropia) {
        retirandoPropia = false // era nuestra propia limpieza, no un ATRÁS
        return
      }
      // solo la capa de ARRIBA reacciona (modal antes que la vista)
      if (capasHistorial[capasHistorial.length - 1] !== id) return
      capasHistorial.pop()
      cerrarRef.current()
    }
    window.addEventListener('popstate', alRetroceder)
    return () => {
      window.removeEventListener('popstate', alRetroceder)
      if (capasHistorial[capasHistorial.length - 1] === id) {
        capasHistorial.pop()
        const estado = history.state as { mtCapa?: number } | null
        if (estado?.mtCapa === id) {
          // cerró por UI: sacar nuestra entrada del historial
          retirandoPropia = true
          history.back()
          window.setTimeout(() => {
            retirandoPropia = false
          }, 400)
        }
      }
    }
  }, [activo])
}

export function ReproductorCompleto() {
  const r = useReproductor()
  const { mostrar } = useToast()
  const c = r.actual

  const [modalLista, setModalLista] = useState(false)

  // ── Esc cierra la pantalla completa ─────────────────────────
  useEffect(() => {
    if (!r.vistaCompleta) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') r.cerrarVista()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [r.vistaCompleta, r.cerrarVista])

  // ── v0.11.1 — el botón ATRÁS (Android/navegador) cierra:
  //    primero el modal ➕ si está abierto, después esta vista ──
  usarCapaHistorial(r.vistaCompleta && !!c, r.cerrarVista)
  usarCapaHistorial(modalLista && r.vistaCompleta && !!c, () => setModalLista(false))

  // ── v0.11.1 — deslizar la portada hacia abajo cierra ────────
  const [arrastre, setArrastre] = useState(0)
  const [arrastrando, setArrastrando] = useState(false)
  const inicioToque = useRef<{ x: number; y: number } | null>(null)
  // el valor vivo del arrastre en un ref: así funciona aunque los
  // eventos lleguen todos juntos (rafaga) sin esperar el render
  const arrastreRef = useRef(0)

  function alIniciarToque(e: React.TouchEvent) {
    if (e.touches.length !== 1) return
    inicioToque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  function alMoverToque(e: React.TouchEvent) {
    const inicio = inicioToque.current
    if (!inicio || e.touches.length !== 1) return
    const dy = e.touches[0].clientY - inicio.y
    const dx = e.touches[0].clientX - inicio.x
    // arranca solo si el gesto es claramente hacia ABAJO
    if (!arrastrando && !(dy > 14 && dy > Math.abs(dx) * 1.4)) return
    const hasta = Math.max(0, dy)
    arrastreRef.current = hasta
    setArrastrando(true)
    setArrastre(hasta)
  }

  function alTerminarToque() {
    const d = arrastreRef.current
    arrastreRef.current = 0
    inicioToque.current = null
    setArrastrando(false)
    setArrastre(0)
    if (d > 110) {
      vibrar('ligera')
      r.cerrarVista()
    }
  }

  // ── v0.11.1 — consejo de cierre, UNA sola vez ────────────────
  useEffect(() => {
    if (!r.vistaCompleta || !c) return
    if (leer('consejo-cierre-reproductor', false)) return
    guardar('consejo-cierre-reproductor', true)
    mostrar('Se cierra con ATRÁS, la ✕ de arriba o deslizando la portada — la música sigue', 'info', 4500)
    // una sola vez en la vida del dispositivo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.vistaCompleta])

  if (!c || !r.vistaCompleta) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-neutral-950 text-white animate-[deslizar_.25s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="Reproductor a pantalla completa"
      style={{
        // v0.11.1 — la ventana sigue el dedo al deslizar para cerrar
        transform: arrastre > 0 ? `translateY(${arrastre}px)` : undefined,
        transition: arrastrando ? 'none' : 'transform .22s ease-out',
      }}
    >
      {/* brillo decorativo, como el ambiente de la portada en Spotify */}
      <div aria-hidden className="pointer-events-none absolute -top-28 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-acento/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-acento/10 blur-3xl" />

      {/* zona superior — se desliza hacia abajo para cerrar (v0.11.1) */}
      <div
        className="relative z-10 flex min-h-0 flex-1 flex-col"
        style={{ touchAction: 'none' }}
        onTouchStart={alIniciarToque}
        onTouchMove={alMoverToque}
        onTouchEnd={alTerminarToque}
        onTouchCancel={alTerminarToque}
      >
        {/* encabezado: ⬇ cerrar + de dónde viene la cola + ✕ cerrar */}
        <div className="relative flex items-center justify-between gap-2 px-3 pb-1 pt-[max(env(safe-area-inset-top),12px)]">
          <button
            type="button"
            onClick={() => {
              vibrar('ligera')
              r.cerrarVista()
            }}
            title="Bajar el reproductor (o desliza hacia abajo)"
            aria-label="Bajar el reproductor"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:bg-white/25 active:scale-95"
          >
            <ChevronDown className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Sonando de</p>
            <p className="truncate text-xs font-semibold text-neutral-300">{r.etiquetaCola || 'Tu biblioteca'}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              vibrar('ligera')
              r.cerrarVista()
            }}
            title="Cerrar (o desliza hacia abajo)"
            aria-label="Cerrar el reproductor"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:bg-white/25 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* manija: pistas de que la ventana se desliza para cerrar */}
        <div aria-hidden className="mx-auto h-1 w-10 shrink-0 rounded-full bg-white/25" />

        {/* portada (con 🎨 portada IA — v0.13.0) */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-8 py-3">
          <PortadaNow cancion={c} tamano="grande" />
        </div>
      </div>

      {/* título + timer + corazón + lista */}
      <FilaTitulo cancion={c} alAbrirListas={() => setModalLista(true)} />

      {/* progreso + controles (compartidos con la pestaña Suena) */}
      <BarraProgreso />
      <FilaControles />

      {/* letra karaoke / cola (compartidos con la pestaña Suena) */}
      <PanelNowPlaying cancion={c} />

      {/* ➕ agregar esta canción a una lista */}
      <ModalListas cancion={c} abierto={modalLista} onCerrar={() => setModalLista(false)} />
    </div>
  )
}
