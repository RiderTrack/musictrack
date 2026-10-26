import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Minus, Music2, Play, Plus, RotateCcw } from 'lucide-react'
import { useReproductor } from '@/core/audio/reproductor'
import { estimarLineasConTiempo, lineasConTiempo, type LineaLrc } from '@/core/audio/mp3'
import { pedirLetraSincronizada, type MotorSuno } from '@/core/ai/suno'
import { leerAjustes, leer, guardar } from '@/core/storage/almacenamiento'
import { vibrar } from '@/core/natives/plataforma'
import { BarrasSonando, formatoTiempo, letraDeCancion } from '@/components/player/comunes'
import type { Cancion } from '@/types'

// ═══════════════════════════════════════════════════════════
// 📱 PANEL LETRA / COLA (v0.13.0) — el corazón del reproductor,
// compartido por la pantalla completa y la pestaña nueva:
//   • LETRA KARAOKE palabra por palabra: la palabra que se está
//     cantando se enciende dentro de la línea (tiempos reales de
//     Suno si existen; interpolados si son estimados)
//   • 🎚️ CALIBRACIÓN de la sincronía por canción: si la letra
//     llega antes o después del canto, un toque la adelanta o
//     la atrasa — y se acuerda para la próxima
//   • 💾 CACHÉ de los tiempos reales: la primera vez que Suno
//     da los tiempos, quedan guardados: la letra abre al toque
//   • COLA de lo que sigue con salto directo
//   • tocá cualquier línea (o palabra) para saltar a ese momento
// ═══════════════════════════════════════════════════════════

/** Adelanto base del resaltado: la voz tarde un pelín en sonar
 * después de la marca, así que la línea se enciende 0,35 s antes. */
const ADELANTO_BASE = 0.35
/** Paso de cada toque de calibración (segundos). */
const PASO_CALIBRACION = 0.25
/** Tope absoluto de calibración a cada lado. */
const TOPE_CALIBRACION = 3

export function PanelNowPlaying({
  cancion,
  pestannaInicial = 'letra',
}: {
  cancion: Cancion
  pestannaInicial?: 'letra' | 'cola'
}) {
  const r = useReproductor()
  const c = cancion

  const [panel, setPanel] = useState<'letra' | 'cola'>(pestannaInicial)
  /** Líneas con TIEMPOS REALES de Suno (null = todavía no sé / no hay). */
  const [reales, setReales] = useState<LineaLrc[] | null>(null)
  const [pidiendoLetra, setPidiendoLetra] = useState(false)
  /** 🎚️ calibración personal de ESTA canción (segundos). */
  const [calibracion, setCalibracion] = useState(0)

  const refsLineas = useRef(new Map<number, HTMLParagraphElement>())
  /** El panel con scroll — el auto-scroll lo mueve SOLO a él. */
  const panelRef = useRef<HTMLDivElement | null>(null)
  /** Último toque del usuario: la letra no lo persigue 4 s. */
  const ultimoToqueRef = useRef(0)

  const idCancion = c.id
  const claveLrc = `lrc-${idCancion}`
  const claveSync = `sync-${idCancion}`

  // ── calibración recordada + caché de tiempos reales ────────
  useEffect(() => {
    setCalibracion(leer(claveSync, 0))
    const cache = leer<LineaLrc[]>(claveLrc, [])
    setReales(cache.length ? cache : null)
    setPidiendoLetra(false)
    if (cache.length) return // ya están: no le pedimos nada a nadie
    if (!c || c.instrumental || !c.taskId || !c.audioId) return
    const ajustes = leerAjustes()
    if (!ajustes.tokenSuno) return
    const letra = letraDeCancion(c)
    if (!letra) return
    const taskId = c.taskId
    const audioId = c.audioId
    let vivo = true
    setPidiendoLetra(true)
    void (async () => {
      try {
        const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
        const palabras = await pedirLetraSincronizada(motor, taskId, audioId)
        if (!vivo) return
        if (palabras && palabras.length) {
          const ls = lineasConTiempo(letra, palabras)
          if (ls.length) {
            guardar(claveLrc, ls) // 💾 quedan para la próxima
            setReales(ls)
          }
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
    // depende de la canción, no de sus datos frescos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCancion])

  const letra = useMemo(() => (c && !c.instrumental ? letraDeCancion(c) : ''), [c])

  /** Estimadas al vuelo cuando la duración se conoce. */
  const estimadas = useMemo<LineaLrc[]>(() => {
    if (reales?.length) return [] // las reales ganan siempre
    if (!letra || r.duracionSeg < 10) return []
    return estimarLineasConTiempo(letra, r.duracionSeg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letra, r.duracionSeg, reales])

  const lineas: LineaLrc[] = reales ?? estimadas
  const tipoLetra: 'real' | 'estimada' | 'ninguna' = reales?.length
    ? 'real'
    : estimadas.length
      ? 'estimada'
      : 'ninguna'

  /** El instante que se está cantando (con el adelanto calibrado). */
  const tAhora = r.posicionSeg + ADELANTO_BASE + calibracion

  const idxActual = useMemo(() => {
    if (!lineas.length) return -1
    let idx = -1
    for (let i = 0; i < lineas.length; i++) if (lineas[i].startS <= tAhora) idx = i
    return idx
  }, [lineas, tAhora])

  // ── auto-scroll suave (4 s de respeto tras un toque manual) ──
  useEffect(() => {
    if (panel !== 'letra' || idxActual < 0) return
    if (Date.now() - ultimoToqueRef.current < 4000) return
    const cont = panelRef.current
    const linea = refsLineas.current.get(idxActual)
    if (!cont || !linea) return
    const destino = linea.offsetTop - cont.clientHeight / 2 + linea.clientHeight / 2
    cont.scrollTo({ top: Math.max(0, destino), behavior: 'smooth' })
  }, [idxActual, panel])

  const marcarToque = () => {
    ultimoToqueRef.current = Date.now()
  }

  function ajustarCalibracion(delta: number) {
    vibrar('ligera')
    setCalibracion((prev) => {
      const nueva = Math.max(-TOPE_CALIBRACION, Math.min(TOPE_CALIBRACION, prev + delta))
      guardar(claveSync, nueva)
      return nueva
    })
  }

  const calibracionInfo =
    calibracion === 0
      ? 'al toque'
      : `${calibracion > 0 ? '+' : ''}${calibracion.toFixed(2).replace(/\.?0+$/, '')} s`

  return (
    <>
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
        ref={panelRef}
        className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-[max(env(safe-area-inset-bottom),18px)] pt-1"
        onPointerDown={marcarToque}
        onWheel={marcarToque}
        onTouchMove={marcarToque}
      >
        {panel === 'letra' ? (
          c.instrumental ? (
            <MensaSinLetra texto="Instrumental — esta canción no tiene letra" />
          ) : !letra ? (
            <MensaSinLetra texto="Esta canción no tiene letra guardada" />
          ) : tipoLetra === 'ninguna' && (r.cargando || r.duracionSeg < 10 || pidiendoLetra) ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
              <p className="text-sm text-neutral-400">Cargando la letra…</p>
            </div>
          ) : tipoLetra === 'ninguna' ? (
            <MensaSinLetra texto="No pude alinear esta letra con el audio" />
          ) : (
            <div className="space-y-3.5 pb-10">
              {/* 🎚️ calibración de la sincronía (v0.13.0) */}
              <div className="flex items-center justify-center gap-1.5 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">
                  ⏱ Sincronía
                </span>
                <button
                  type="button"
                  onClick={() => ajustarCalibracion(-PASO_CALIBRACION)}
                  title="La letra se enciende ANTES de la voz — atrasarla un toque"
                  aria-label="Atrasar la letra"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-neutral-300 transition-colors hover:bg-white/20 hover:text-white active:scale-95"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-14 text-center text-[11px] font-bold tabular-nums text-neutral-300">
                  {calibracionInfo}
                </span>
                <button
                  type="button"
                  onClick={() => ajustarCalibracion(PASO_CALIBRACION)}
                  title="La letra se enciende TARDE (ya cantaron esa línea) — adelantarla"
                  aria-label="Adelantar la letra"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-neutral-300 transition-colors hover:bg-white/20 hover:text-white active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                {calibracion !== 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      vibrar('ligera')
                      setCalibracion(0)
                      guardar(claveSync, 0)
                    }}
                    title="Volver a la sincronía de fábrica"
                    aria-label="Restablecer la sincronía"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-neutral-400 transition-colors hover:bg-white/20 hover:text-white active:scale-95"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </div>

              {lineas.map((l, i) => {
                const activa = i === idxActual
                return (
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
                      activa
                        ? 'scale-[1.03] text-white'
                        : i < idxActual
                          ? 'text-neutral-600'
                          : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {activa && l.palabras?.length ? (
                      /* 🎤 karaoke palabra por palabra: la palabra que
                       * se canta SE ENCIENDE dentro de la línea */
                      l.palabras.map((p, j) => (
                        <span
                          key={j}
                          className={`transition-all duration-200 ${
                            p.startS <= tAhora
                              ? 'rounded-[5px] bg-white/[0.07] px-[3px] text-white'
                              : 'text-neutral-400'
                          }`}
                        >
                          {p.texto}{' '}
                        </span>
                      ))
                    ) : (
                      l.texto || '♪'
                    )}
                  </p>
                )
              })}
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
    </>
  )
}

function MensaSinLetra({ texto }: { texto: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <Music2 className="h-8 w-8 text-neutral-600" />
      <p className="text-sm font-semibold text-neutral-400">{texto}</p>
    </div>
  )
}
