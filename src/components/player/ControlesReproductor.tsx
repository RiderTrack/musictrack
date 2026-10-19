import { useEffect, useState } from 'react'
import { AlarmClock, Heart, ListPlus, Loader2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Timer, X } from 'lucide-react'
import { useReproductor } from '@/core/audio/reproductor'
import { actualizarCancion } from '@/core/storage/canciones'
import { vibrar } from '@/core/natives/plataforma'
import { Modal } from '@/components/ui/Modal'
import { formatoTiempo, formatoTimer } from '@/components/player/comunes'
import type { Cancion } from '@/types'

// ═══════════════════════════════════════════════════════════
// 🎛️ CONTROLES DEL NOW-PLAYING (v0.13.0) — lo que comparten la
// pantalla completa y la pestaña Suena:
//   • FilaTitulo: título + estilo + ❤️ favorita + ➕ listas + ⏱
//   • BarraProgreso + FilaControles: 🔀 ⏮ ⏯ ⏭ 🔁
//   • BotonSueño + ModalSueño: el TIMER DE SUEÑO (15/30/45/60
//     minutos o al final de la canción) — la música se pausa
//     sola para quedarse dormido escuchando
// ═══════════════════════════════════════════════════════════

export function FilaTitulo({
  cancion,
  alAbrirListas,
}: {
  cancion: Cancion
  alAbrirListas: () => void
}) {
  const [modalSueno, setModalSueno] = useState(false)
  const r = useReproductor()

  return (
    <>
      <div className="relative flex items-center gap-1.5 px-6">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold sm:text-xl">{cancion.titulo}</h2>
          <p className="truncate text-xs text-neutral-400">
            {cancion.instrumental ? '🎹 Instrumental' : cancion.estilo || 'MusicTrack'}
            {cancion.version && ` · versión ${cancion.version}`}
            {(cancion.respaldada || cancion.audioLocal) && ' · 💾 en tu dispositivo'}
          </p>
        </div>
        <BotonSueno activo={Boolean(r.apagadoRestanteSeg !== null || r.apagadoAlFinal)} alAbrir={() => setModalSueno(true)} />
        <button
          type="button"
          onClick={() => {
            vibrar('ligera')
            actualizarCancion(cancion.id, { favorita: !cancion.favorita })
          }}
          title={cancion.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
          aria-label={cancion.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
            cancion.favorita ? 'text-red-500' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Heart className={`h-5 w-5 ${cancion.favorita ? 'fill-current' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => {
            vibrar('ligera')
            alAbrirListas()
          }}
          title="Agregar a una lista"
          aria-label="Agregar a una lista"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:text-white"
        >
          <ListPlus className="h-5 w-5" />
        </button>
      </div>
      <ModalSueno abierto={modalSueno} onCerrar={() => setModalSueno(false)} />
    </>
  )
}

/** ⏱ el botón del timer de sueño — con cuenta regresiva si está activo. */
function BotonSueno({ activo, alAbrir }: { activo: boolean; alAbrir: () => void }) {
  const r = useReproductor()
  const [hora, setHora] = useState('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (r.apagadoRestanteSeg === null) {
      setHora('')
      setVisible(false)
      return
    }
    setVisible(true)
    setHora(formatoTimer(r.apagadoRestanteSeg))
  }, [r.apagadoRestanteSeg])

  return (
    <button
      type="button"
      onClick={() => {
        vibrar('ligera')
        alAbrir()
      }}
      title="Timer de sueño — pausar la música más tarde"
      aria-label="Timer de sueño"
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
        activo ? 'text-acento' : 'text-neutral-400 hover:text-white'
      }`}
    >
      {activo ? <Timer className="h-5 w-5" /> : <AlarmClock className="h-5 w-5" />}
      {visible && hora && (
        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-acento px-1 text-[8px] font-black tabular-nums text-black">
          {hora}
        </span>
      )}
    </button>
  )
}

/** ⏱ las opciones del timer de sueño. */
function ModalSueno({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const r = useReproductor()
  const opciones = [15, 30, 45, 60, 90]
  const hayTimer = r.apagadoRestanteSeg !== null || r.apagadoAlFinal

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="⏱ Timer de sueño">
      <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
        La música se pausa sola para que te quedes dormido escuchando.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {opciones.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              vibrar('ligera')
              r.programarApagado({ minutos: m })
              onCerrar()
            }}
            className="rounded-xl border border-neutral-200 py-2.5 text-sm font-bold text-neutral-900 transition-colors hover:border-acento/50 hover:text-acento dark:border-neutral-800 dark:text-white"
          >
            {m} min
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            vibrar('ligera')
            r.programarApagado({ alFinal: true })
            onCerrar()
          }}
          className="col-span-2 rounded-xl border border-neutral-200 py-2.5 text-sm font-bold text-neutral-900 transition-colors hover:border-acento/50 hover:text-acento dark:border-neutral-800 dark:text-white"
        >
          Al final de esta canción 🌙
        </button>
      </div>
      {hayTimer && (
        <button
          type="button"
          onClick={() => {
            vibrar('ligera')
            r.cancelarApagado()
            onCerrar()
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-100 py-2.5 text-sm font-bold text-neutral-700 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          <X className="h-4 w-4" /> Cancelar el timer
          {r.apagadoRestanteSeg !== null && ` (${formatoTimer(r.apagadoRestanteSeg)})`}
        </button>
      )}
    </Modal>
  )
}

export function BarraProgreso() {
  const r = useReproductor()
  const posBarra = r.duracionSeg > 0 ? Math.min(r.posicionSeg, r.duracionSeg) : 0
  return (
    <div className="relative flex items-center gap-3 px-6 pt-3">
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-neutral-400">
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
        className="h-1.5 w-full accent-acento"
      />
      <span className="w-10 shrink-0 text-[11px] tabular-nums text-neutral-400">
        {formatoTiempo(r.duracionSeg)}
      </span>
    </div>
  )
}

export function FilaControles() {
  const r = useReproductor()
  return (
    <div className="relative mx-auto flex w-full max-w-sm items-center justify-between px-8 py-3">
      <button
        type="button"
        onClick={() => {
          vibrar('ligera')
          r.alternarAleatorio()
        }}
        title={r.aleatorio ? 'Aleatorio activado — tocá para apagarlo' : 'Aleatorio'}
        aria-label="Aleatorio"
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
          r.aleatorio ? 'text-acento' : 'text-neutral-400 hover:text-white'
        }`}
      >
        <Shuffle className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => {
          vibrar('ligera')
          r.anterior()
        }}
        title="Anterior"
        aria-label="Canción anterior"
        className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-200 transition-colors hover:text-white"
      >
        <SkipBack className="h-7 w-7" />
      </button>
      <button
        type="button"
        onClick={() => {
          vibrar('ligera')
          r.alternar()
        }}
        title={r.sonando ? 'Pausar' : 'Reproducir'}
        aria-label={r.sonando ? 'Pausar' : 'Reproducir'}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-acento text-black shadow-lg shadow-acento/25 transition-transform active:scale-95"
      >
        {r.cargando ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : r.sonando ? (
          <Pause className="h-7 w-7" />
        ) : (
          <Play className="h-7 w-7 translate-x-0.5" />
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
        className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-200 transition-colors hover:text-white"
      >
        <SkipForward className="h-7 w-7" />
      </button>
      <button
        type="button"
        onClick={() => {
          vibrar('ligera')
          r.alternarRepetir()
        }}
        title={
          r.repetir === 'off'
            ? 'Repetir desactivado — tocá para repetir la cola'
            : r.repetir === 'cola'
              ? 'Repetir la cola — tocá para repetir esta canción'
              : 'Repetir esta canción — tocá para apagar'
        }
        aria-label="Repetir"
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
          r.repetir !== 'off' ? 'text-acento' : 'text-neutral-400 hover:text-white'
        }`}
      >
        {r.repetir === 'una' ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
      </button>
    </div>
  )
}
