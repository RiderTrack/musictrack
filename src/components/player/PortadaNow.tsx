import { useState } from 'react'
import { Disc3, Loader2, Sparkles } from 'lucide-react'
import { useReproductor } from '@/core/audio/reproductor'
import { generarPortadaIA } from '@/core/imagenes/portadaIA'
import { actualizarCancion } from '@/core/storage/canciones'
import { vibrar } from '@/core/natives/plataforma'
import { useToast } from '@/components/ui/Toast'
import { portadaDe, type Cancion } from '@/types'

// ═══════════════════════════════════════════════════════════
// 🖼️ PORTADA DEL NOW-PLAYING (v0.13.0) — la carátula grande con
// el botón 🎨 escondido abajo a la derecha: un toque y la IA
// inventa una portada a partir del título y el estilo de la
// canción (pollinations.ai, gratis). Si ya tiene foto propia o
// de Suno, se ve esa; el disco girando si no hay ninguna.
// ═══════════════════════════════════════════════════════════

export function PortadaNow({
  cancion,
  tamano = 'grande',
}: {
  cancion: Cancion
  /** 'grande' = pantalla completa · 'mediana' = pestaña Suena. */
  tamano?: 'grande' | 'mediana'
}) {
  const r = useReproductor()
  const { mostrar } = useToast()
  const [generando, setGenerando] = useState(false)

  const maxH = tamano === 'grande' ? 'max-h-[300px]' : 'max-h-[230px]'

  async function crearPortadaIA() {
    vibrar('ligera')
    setGenerando(true)
    try {
      const dataUrl = await generarPortadaIA({ titulo: cancion.titulo, estilo: cancion.estilo })
      actualizarCancion(cancion.id, { portadaPersonal: dataUrl })
      mostrar('🎨 ¡Portada lista! Tocá 🎨 de nuevo para otra versión', 'ok', 4000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'algo falló'
      mostrar(`No pude generar la portada (${msg}) — probá en unos segundos`, 'error', 5000)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="relative">
      {portadaDe(cancion) ? (
        <img
          src={portadaDe(cancion)}
          alt={`Portada de ${cancion.titulo}`}
          referrerPolicy="no-referrer"
          className={`aspect-square h-full w-auto max-w-full rounded-2xl object-cover shadow-2xl shadow-black/60 ring-1 ring-white/10 ${maxH}`}
        />
      ) : (
        <div
          className={`flex aspect-square h-full w-auto max-w-full items-center justify-center rounded-2xl bg-gradient-to-br from-acento/40 via-neutral-800 to-neutral-900 shadow-2xl shadow-black/60 ring-1 ring-white/10 ${maxH}`}
        >
          <Disc3 className={`h-1/2 w-1/2 text-white/80 ${r.sonando ? 'animate-[girar_7s_linear_infinite]' : ''}`} />
        </div>
      )}

      {/* 🎨 portada con IA — esquina abajo, aparece al cargar la imagen */}
      <button
        type="button"
        onClick={crearPortadaIA}
        disabled={generando}
        title="Generar una portada con IA (gratis) — tocá de nuevo para otra versión"
        aria-label="Generar portada con IA"
        className={`absolute -bottom-2.5 -right-2.5 flex h-10 w-10 items-center justify-center rounded-full shadow-lg shadow-black/50 ring-1 ring-white/20 transition-all active:scale-95 ${
          generando ? 'bg-acento text-black' : 'bg-neutral-800/95 text-acento hover:bg-acento hover:text-black'
        }`}
      >
        {generando ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Sparkles className="h-5 w-5" />
        )}
      </button>
      {generando && (
        <p className="absolute -bottom-8 left-1/2 w-max -translate-x-1/2 text-[10px] font-semibold text-neutral-300">
          pintando la portada… (~10 s)
        </p>
      )}
    </div>
  )
}
