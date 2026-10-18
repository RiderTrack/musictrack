import { Disc3, Pause, Play, Shuffle, SkipBack, SkipForward, X } from 'lucide-react'
import { useReproductor } from '@/core/audio/reproductor'
import { vibrar } from '@/core/natives/plataforma'

// ═══════════════════════════════════════════════════════════
// 🎛️ MINI-REPRODUCTOR (v0.10.0) — la barra fija de abajo, como
// en Spotify: portada + título, play/pausa, ⏮ ⏭, 🔀 aleatorio
// y barra de progreso arrastrable. Vive POR ENCIMA de la barra
// de navegación y solo aparece cuando hay algo cargado. Los
// controles de la pantalla de bloqueo los maneja mediaSession
// (en el provider del reproductor).
// ═══════════════════════════════════════════════════════════

function formatoTiempo(seg: number): string {
  if (!Number.isFinite(seg) || seg < 0) return '0:00'
  const m = Math.floor(seg / 60)
  const s = Math.floor(seg % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function MiniReproductor() {
  const r = useReproductor()
  if (!r.actual) return null

  const indice = r.cola.findIndex((c) => c.id === r.actual?.id)
  const posBarra = r.duracionSeg > 0 ? Math.min(r.posicionSeg, r.duracionSeg) : 0

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
      role="region"
      aria-label="Reproductor"
    >
      <div className="mx-auto max-w-2xl px-4 py-1.5">
        {/* barra de progreso */}
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-neutral-400">
            {formatoTiempo(r.posicionSeg)}
          </span>
          <input
            type="range"
            min={0}
            max={r.duracionSeg > 0 ? r.duracionSeg : 0}
            step={1}
            value={posBarra}
            onChange={(e) => r.buscarSeg(Number(e.target.value))}
            aria-label="Posición de la canción"
            className="h-1 w-full accent-acento"
          />
          <span className="w-8 shrink-0 text-[10px] tabular-nums text-neutral-400">
            {formatoTiempo(r.duracionSeg)}
          </span>
        </div>

        <div className="flex items-center gap-2.5 py-1">
          {/* portada */}
          {r.actual.urlPortada ? (
            <img
              src={r.actual.urlPortada}
              alt=""
              referrerPolicy="no-referrer"
              className={`h-10 w-10 shrink-0 rounded-lg object-cover ${r.sonando ? 'animate-[girar_6s_linear_infinite]' : ''}`}
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-acento/10 text-acento">
              <Disc3 className={`h-5 w-5 ${r.sonando ? 'animate-spin' : ''}`} />
            </span>
          )}

          {/* título + estado */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{r.actual.titulo}</p>
            <p className="truncate text-[10px] text-neutral-400">
              {r.cargando ? 'cargando el audio…' : r.sonando ? '▶ sonando' : 'en pausa'}
              {indice >= 0 && r.cola.length > 1 && ` · ${indice + 1} de ${r.cola.length}`}
              {(r.actual.respaldada || r.actual.audioLocal) && ' · 💾 en tu dispositivo'}
            </p>
          </div>

          {/* controles */}
          <button
            type="button"
            onClick={() => {
              vibrar('ligera')
              r.alternarAleatorio()
            }}
            title={r.aleatorio ? 'Aleatorio activado — tocá para apagarlo' : 'Aleatorio'}
            aria-label="Aleatorio"
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
              r.aleatorio ? 'bg-acento/15 text-acento' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            <Shuffle className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              vibrar('ligera')
              r.anterior()
            }}
            title="Anterior"
            aria-label="Canción anterior"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
          >
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              vibrar('ligera')
              r.alternar()
            }}
            title={r.sonando ? 'Pausar' : 'Reproducir'}
            aria-label={r.sonando ? 'Pausar' : 'Reproducir'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-acento text-black shadow-sm transition-all active:scale-95 hover:brightness-110"
          >
            {r.cargando ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
            ) : r.sonando ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 translate-x-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              vibrar('ligera')
              r.siguiente()
            }}
            title="Siguiente"
            aria-label="Canción siguiente"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
          >
            <SkipForward className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              vibrar('ligera')
              r.cerrar()
            }}
            title="Cerrar el reproductor"
            aria-label="Cerrar el reproductor"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
