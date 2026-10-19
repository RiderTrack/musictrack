import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  Disc3,
  Heart,
  ListPlus,
  Loader2,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import { useReproductor } from '@/core/audio/reproductor'
import { estimarLineasConTiempo, lineasConTiempo, type LineaLrc } from '@/core/audio/mp3'
import { pedirLetraSincronizada, type MotorSuno } from '@/core/ai/suno'
import { actualizarCancion } from '@/core/storage/canciones'
import { alternarEnLista, crearLista, EVENTO_LISTAS, leerListas, type ListaReproduccion } from '@/core/storage/listas'
import { leer, leerAjustes } from '@/core/storage/almacenamiento'
import { vibrar } from '@/core/natives/plataforma'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import type { Cancion, Letra } from '@/types'

// ═══════════════════════════════════════════════════════════
// 📱 REPRODUCTOR A PANTALLA COMPLETA (v0.11.0) — el «now
// playing» tipo Spotify: se abre tocando la portada o el título
// de la mini-barra. Tiene:
//   • portada grande, barra arrastrable y controles completos
//     (🔀 ⏮ ⏯ ⏭ 🔁 — repetir una canción o toda la cola)
//   • ❤️ favorita y ➕ agregar a listas al toque
//   • LETRA que avanza mientras suena: tiempos reales de Suno
//     (get-timestamped-lyrics) si existen, estimados si no —
//     tocá cualquier línea para saltar a ese momento
//   • COLA de lo que sigue, con salto directo a cualquier tema
//     (la barra «Sonando de» recuerda de qué lista salió)
// ═══════════════════════════════════════════════════════════

function formatoTiempo(seg: number): string {
  if (!Number.isFinite(seg) || seg < 0) return '0:00'
  const m = Math.floor(seg / 60)
  const s = Math.floor(seg % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** La letra de una canción: la que viajó al motor, o la de la
 * biblioteca de letras con la que se creó (las viejas). */
function letraDeCancion(c: Cancion): string {
  if (c.letraTexto) return c.letraTexto
  if (c.letraId) {
    const guardada = leer<Letra[]>('letras', []).find((l) => l.id === c.letraId)
    if (guardada?.texto) return guardada.texto
  }
  return ''
}

/** Las tres barritas de «está sonando» en la cola. */
function BarrasSonando() {
  return (
    <span className="flex h-4 items-end justify-center gap-[2.5px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-sm bg-acento"
          style={{ height: `${6 + (i % 2) * 4}px`, animation: `saltitos .9s ${i * 0.18}s infinite ease-in-out` }}
        />
      ))}
    </span>
  )
}

export function ReproductorCompleto() {
  const r = useReproductor()
  const { mostrar } = useToast()
  const c = r.actual

  const [panel, setPanel] = useState<'letra' | 'cola'>('letra')
  const [modalLista, setModalLista] = useState(false)
  const [listas, setListas] = useState<ListaReproduccion[]>(() => leerListas())
  const [nuevaLista, setNuevaLista] = useState('')
  /** Líneas con TIEMPOS REALES de Suno (null = todavía no sé / no hay). */
  const [reales, setReales] = useState<LineaLrc[] | null>(null)
  const [pidiendoLetra, setPidiendoLetra] = useState(false)

  const refsLineas = useRef(new Map<number, HTMLParagraphElement>())
  /** Último toque del usuario en el panel: la letra no lo persigue
   * unos segundos mientras lee o se mueve a mano. */
  const ultimoToqueRef = useRef(0)

  // ── listas frescas (crear / marcar desde acá o desde Biblioteca) ──
  useEffect(() => {
    const alCambiar = (e: Event) => setListas((e as CustomEvent<ListaReproduccion[]>).detail)
    window.addEventListener(EVENTO_LISTAS, alCambiar)
    return () => window.removeEventListener(EVENTO_LISTAS, alCambiar)
  }, [])

  // ── Esc cierra la pantalla completa ─────────────────────────
  useEffect(() => {
    if (!r.vistaCompleta) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') r.cerrarVista()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [r.vistaCompleta, r.cerrarVista])

  // ── letra con tiempos REALES de Suno (si la API los trae) ──
  const idCancion = c?.id
  useEffect(() => {
    setReales(null)
    setPidiendoLetra(false)
    if (!c || c.instrumental || !c.taskId || !c.audioId) return
    const ajustes = leerAjustes()
    if (!ajustes.tokenSuno) return
    const letra = letraDeCancion(c)
    const taskId = c.taskId
    const audioId = c.audioId
    if (!letra) return
    let vivo = true
    setPidiendoLetra(true)
    void (async () => {
      try {
        const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
        const palabras = await pedirLetraSincronizada(motor, taskId, audioId)
        if (!vivo) return
        if (palabras && palabras.length) {
          const ls = lineasConTiempo(letra, palabras)
          if (ls.length) setReales(ls)
        }
      } catch {
        /* la letra sincronizada es un plus — si no, la estimada */
      } finally {
        if (vivo) setPidiendoLetra(false)
      }
    })()
    return () => {
      vivo = false
    }
    // depende de la canción, no de sus datos frescos (corazón etc.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCancion])

  const letra = useMemo(() => (c && !c.instrumental ? letraDeCancion(c) : ''), [c])

  /** Estimadas al vuelo: cuando la duración se conoce (metadata),
   * la letra aparece sola sin pedirle nada a nadie. */
  const estimadas = useMemo<LineaLrc[]>(() => {
    if (!letra || r.duracionSeg < 10) return []
    return estimarLineasConTiempo(letra, r.duracionSeg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letra, r.duracionSeg])

  const lineas: LineaLrc[] = reales ?? estimadas
  const tipoLetra: 'real' | 'estimada' | 'ninguna' = reales
    ? 'real'
    : estimadas.length
      ? 'estimada'
      : 'ninguna'

  /** La línea que se está cantando (con 0,35 s de adelanto para
   * que encienda justo antes de que llegue la voz). */
  const idxActual = useMemo(() => {
    if (!lineas.length) return -1
    const t = r.posicionSeg + 0.35
    let idx = -1
    for (let i = 0; i < lineas.length; i++) if (lineas[i].startS <= t) idx = i
    return idx
  }, [lineas, r.posicionSeg])

  // ── auto-scroll suave de la letra (salvo que el usuario esté
  //    leyendo/moviéndose a mano: 4 s de respeto) ──────────────
  useEffect(() => {
    if (panel !== 'letra' || idxActual < 0) return
    if (Date.now() - ultimoToqueRef.current < 4000) return
    refsLineas.current.get(idxActual)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [idxActual, panel])

  const marcarToque = () => {
    ultimoToqueRef.current = Date.now()
  }

  function mandarALista(idLista: string) {
    if (!c) return
    const dentro = alternarEnLista(idLista, c.id)
    const nombre = leerListas().find((l) => l.id === idLista)?.nombre ?? 'la lista'
    mostrar(dentro ? `Agregada a «${nombre}» 🎵` : `La saqué de «${nombre}»`, 'info')
  }

  function crearYAgregar() {
    if (!c) return
    const nombre = nuevaLista.trim()
    if (!nombre) return
    const l = crearLista(nombre)
    if (!l.ids.includes(c.id)) alternarEnLista(l.id, c.id)
    setNuevaLista('')
    mostrar(`Lista «${nombre}» creada con esta canción 🎵`, 'info')
  }

  if (!c || !r.vistaCompleta) return null

  const posBarra = r.duracionSeg > 0 ? Math.min(r.posicionSeg, r.duracionSeg) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-neutral-950 text-white animate-[deslizar_.25s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="Reproductor a pantalla completa"
    >
      {/* brillo decorativo, como el ambiente de la portada en Spotify */}
      <div aria-hidden className="pointer-events-none absolute -top-28 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-acento/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-acento/10 blur-3xl" />

      {/* encabezado: cerrar + de dónde viene la cola */}
      <div className="relative flex items-center justify-between gap-2 px-3 pb-1 pt-[max(env(safe-area-inset-top),10px)]">
        <button
          type="button"
          onClick={() => {
            vibrar('ligera')
            r.cerrarVista()
          }}
          title="Volver (Esc)"
          aria-label="Cerrar el reproductor"
          className="rounded-full p-2 text-neutral-300 transition-colors hover:bg-white/10"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Sonando de</p>
          <p className="truncate text-xs font-semibold text-neutral-300">{r.etiquetaCola || 'Tu biblioteca'}</p>
        </div>
        <span className="w-10 shrink-0" aria-hidden />
      </div>

      {/* portada */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-8 py-3">
        {c.urlPortada ? (
          <img
            src={c.urlPortada}
            alt={`Portada de ${c.titulo}`}
            referrerPolicy="no-referrer"
            className="aspect-square h-full max-h-[300px] w-auto max-w-full rounded-2xl object-cover shadow-2xl shadow-black/60 ring-1 ring-white/10"
          />
        ) : (
          <div className="flex aspect-square h-full max-h-[300px] w-auto max-w-full items-center justify-center rounded-2xl bg-gradient-to-br from-acento/40 via-neutral-800 to-neutral-900 shadow-2xl shadow-black/60 ring-1 ring-white/10">
            <Disc3 className={`h-1/2 w-1/2 text-white/80 ${r.sonando ? 'animate-[girar_7s_linear_infinite]' : ''}`} />
          </div>
        )}
      </div>

      {/* título + corazón + lista */}
      <div className="relative flex items-center gap-1.5 px-6">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold sm:text-xl">{c.titulo}</h2>
          <p className="truncate text-xs text-neutral-400">
            {c.instrumental ? '🎹 Instrumental' : c.estilo || 'MusicTrack'}
            {c.version && ` · versión ${c.version}`}
            {(c.respaldada || c.audioLocal) && ' · 💾 en tu dispositivo'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            vibrar('ligera')
            actualizarCancion(c.id, { favorita: !c.favorita })
          }}
          title={c.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
          aria-label={c.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
            c.favorita ? 'text-red-500' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Heart className={`h-5 w-5 ${c.favorita ? 'fill-current' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => {
            vibrar('ligera')
            setModalLista(true)
          }}
          title="Agregar a una lista"
          aria-label="Agregar a una lista"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:text-white"
        >
          <ListPlus className="h-5 w-5" />
        </button>
      </div>

      {/* progreso */}
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

      {/* controles */}
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

      {/* pestañas: letra que avanza / lo que sigue */}
      <div className="relative flex items-center justify-center gap-2 border-t border-white/10 px-6 pb-2 pt-2.5">
        <button
          type="button"
          onClick={() => setPanel('letra')}
          aria-pressed={panel === 'letra'}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
            panel === 'letra' ? 'bg-white text-neutral-950' : 'text-neutral-300 hover:bg-white/10'
          }`}
        >
          Letra{tipoLetra === 'real' ? ' · sincronizada' : ''}
        </button>
        <button
          type="button"
          onClick={() => setPanel('cola')}
          aria-pressed={panel === 'cola'}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
            panel === 'cola' ? 'bg-white text-neutral-950' : 'text-neutral-300 hover:bg-white/10'
          }`}
        >
          Cola · {r.cola.length}
        </button>
      </div>

      {/* panel con scroll */}
      <div
        className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-[max(env(safe-area-inset-bottom),18px)] pt-1"
        onPointerDown={marcarToque}
        onWheel={marcarToque}
        onTouchMove={marcarToque}
      >
        {panel === 'letra' ? (
          c.instrumental ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Music2 className="h-8 w-8 text-neutral-600" />
              <p className="text-sm font-semibold text-neutral-400">Instrumental — esta canción no tiene letra</p>
            </div>
          ) : !letra ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Music2 className="h-8 w-8 text-neutral-600" />
              <p className="text-sm font-semibold text-neutral-400">Esta canción no tiene letra guardada</p>
            </div>
          ) : tipoLetra === 'ninguna' && (r.cargando || r.duracionSeg < 10 || pidiendoLetra) ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
              <p className="text-sm text-neutral-400">Cargando la letra…</p>
            </div>
          ) : tipoLetra === 'ninguna' ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Music2 className="h-8 w-8 text-neutral-600" />
              <p className="text-sm font-semibold text-neutral-400">No pude alinear esta letra con el audio</p>
            </div>
          ) : (
            <div className="space-y-3.5 pb-10">
              {lineas.map((l, i) => (
                <p
                  key={`${i}-${l.startS.toFixed(2)}`}
                  ref={(el) => {
                    if (el) refsLineas.current.set(i, el)
                    else refsLineas.current.delete(i)
                  }}
                  onClick={() => {
                    vibrar('ligera')
                    r.buscarSeg(Math.max(0, l.startS - 0.25))
                  }}
                  className={`cursor-pointer text-lg font-bold leading-snug transition-all duration-300 ${
                    i === idxActual
                      ? 'scale-[1.03] text-white'
                      : i < idxActual
                        ? 'text-neutral-600'
                        : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {l.texto || '♪'}
                </p>
              ))}
              {tipoLetra === 'estimada' && (
                <p className="pt-1 text-[10px] font-medium text-neutral-600">
                  ⏱ Tiempos estimados — tocá una línea para saltar a ese momento
                </p>
              )}
              {pidiendoLetra && (
                <p className="flex items-center gap-2 text-[10px] font-medium text-neutral-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> buscando los tiempos reales…
                </p>
              )}
            </div>
          )
        ) : (
          <div className="pb-10">
            <p className="pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
              A continuación
            </p>
            {r.cola.length === 0 ? (
              <p className="pt-4 text-center text-sm text-neutral-500">La cola está vacía</p>
            ) : (
              <ul>
                {r.cola.map((x, i) => {
                  const esActual = x.id === c.id
                  return (
                    <li key={x.id}>
                      <button
                        type="button"
                        onClick={() => {
                          vibrar('ligera')
                          if (esActual) r.alternar()
                          else r.reproducir(r.cola, x.id)
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
                      >
                        <span className="flex w-6 shrink-0 items-center justify-center">
                          {esActual ? (
                            r.cargando ? (
                              <Loader2 className="h-4 w-4 animate-spin text-acento" />
                            ) : r.sonando ? (
                              <BarrasSonando />
                            ) : (
                              <Play className="h-3.5 w-3.5 text-acento" />
                            )
                          ) : (
                            <span className="text-xs tabular-nums text-neutral-500">{i + 1}</span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm ${
                              esActual ? 'font-bold text-acento' : 'font-semibold text-neutral-100'
                            }`}
                          >
                            {x.titulo}
                          </span>
                          <span className="block truncate text-[11px] text-neutral-500">
                            {x.version ? `versión ${x.version} · ` : ''}
                            {x.instrumental ? 'Instrumental' : x.estilo || 'MusicTrack'}
                          </span>
                        </span>
                        {x.duracionSeg ? (
                          <span className="shrink-0 text-[11px] tabular-nums text-neutral-500">
                            {formatoTiempo(x.duracionSeg)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ➕ agregar esta canción a una lista */}
      <Modal
        abierto={modalLista}
        onCerrar={() => setModalLista(false)}
        titulo={`«${c.titulo}» → lista`}
      >
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          Marcá las listas donde querés esta canción — desmarcar la saca.
        </p>
        {listas.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {listas.map((l) => {
              const dentro = l.ids.includes(c.id)
              return (
                <li key={l.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 transition-colors hover:border-acento/40 dark:border-neutral-800">
                    <input
                      type="checkbox"
                      checked={dentro}
                      onChange={() => mandarALista(l.id)}
                      className="h-4 w-4 shrink-0 accent-acento"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">
                        {l.nombre}
                      </span>
                      <span className="text-[11px] text-neutral-400">
                        {l.ids.length} {l.ids.length === 1 ? 'canción' : 'canciones'}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <input
            value={nuevaLista}
            onChange={(e) => setNuevaLista(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') crearYAgregar()
            }}
            placeholder="Nueva lista — Anime, Gym, Para dormir…"
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-acento focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
          <button
            type="button"
            onClick={crearYAgregar}
            disabled={!nuevaLista.trim()}
            className="shrink-0 rounded-xl bg-acento px-4 py-2 text-sm font-bold text-black transition-opacity disabled:opacity-40"
          >
            Crear
          </button>
        </div>
      </Modal>
    </div>
  )
}
