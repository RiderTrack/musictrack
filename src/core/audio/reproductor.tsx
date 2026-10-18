import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { leerAudio } from '@/core/storage/audio'
import { EVENTO_CANCIONES } from '@/core/storage/canciones'
import { useToast } from '@/components/ui/Toast'
import type { Cancion } from '@/types'

// ═══════════════════════════════════════════════════════════
// 🎧 REPRODUCTOR ÚNICO GLOBAL (v0.10.0) — «que se sienta como
// Spotify». Antes cada tarjeta tenía su propio <audio controls>:
// al cambiar de pestaña React lo desmontaba y la música SE
// CORTABA. Ahora hay UN solo <audio> que vive en este provider
// (por encima de las vistas) y nunca se desmonta:
//   • mini-barra fija abajo con play/pausa, ⏮ ⏭, 🔀 aleatorio
//     y barra de progreso
//   • mediaSession → controles en la PANTALLA DE BLOQUEO y
//     auriculares (play/pausa/siguiente/anterior/seek)
//   • la cola es la carpeta/lista/favoritas donde tocaste play,
//     así «siguiente» sigue lo que estabas escuchando
//   • el audio sale de la copia local (IndexedDB) si existe:
//     respaldada 💾 o Lyria — el CDN solo como respaldo
// ═══════════════════════════════════════════════════════════

interface CtxReproductor {
  /** La canción cargada ahora (datos frescos, no una foto vieja). */
  actual: Cancion | null
  cola: Cancion[]
  sonando: boolean
  aleatorio: boolean
  cargando: boolean
  posicionSeg: number
  duracionSeg: number
  /** Carga una cola (carpeta, lista, favoritas…) y arranca en esa canción. */
  reproducir: (canciones: Cancion[], idCancion: string) => void
  /** Play/pausa de la canción cargada. */
  alternar: () => void
  siguiente: () => void
  anterior: () => void
  alternarAleatorio: () => void
  buscarSeg: (seg: number) => void
  /** Cierra el reproductor (pausa y limpia la mini-barra). */
  cerrar: () => void
}

const Ctx = createContext<CtxReproductor | null>(null)

export function ReproductorProvider({ children }: { children: ReactNode }) {
  const { mostrar } = useToast()

  const [actual, setActual] = useState<Cancion | null>(null)
  const [cola, setCola] = useState<Cancion[]>([])
  const [sonando, setSonando] = useState(false)
  const [aleatorio, setAleatorio] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [posicionSeg, setPosicionSeg] = useState(0)
  const [duracionSeg, setDuracionSeg] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const actualRef = useRef<Cancion | null>(null)
  const colaRef = useRef<Cancion[]>([])
  const aleatorioRef = useRef(false)
  /** src resuelto por canción (data: de IndexedDB o URL del CDN). */
  const srcCache = useRef(new Map<string, string>())

  function fijarActual(c: Cancion | null) {
    actualRef.current = c
    setActual(c)
  }

  /** El audio de una canción: primero la copia local del
   * dispositivo (respaldo 💾 o Lyria), después el CDN de Suno. */
  async function resolverSrc(c: Cancion): Promise<string | null> {
    const cacheado = srcCache.current.get(c.id)
    if (cacheado) return cacheado
    if (c.audioLocal || c.respaldada) {
      const local = await leerAudio(c.id)
      if (local) {
        srcCache.current.set(c.id, local)
        return local
      }
    }
    if (c.urlAudio) {
      srcCache.current.set(c.id, c.urlAudio)
      return c.urlAudio
    }
    return null
  }

  // ── cargar y sonar la canción actual ───────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !actual) return
    const idCancion = actual.id
    let vivo = true
    // 🩹 el clásico «play() interrumpido por la nueva carga»: al
    // cambiar de src mientras sonaba otra canción, Chromium puede
    // pausar el elemento y rechazar el play inmediato (AbortError
    // silencioso). La cura: reintentar cuando el audio nuevo está
    // listo (canplay) — si ya estaba sonando, play() es no-op.
    const sonarCuandoListo = () => {
      if (vivo && actualRef.current?.id === idCancion) void audio.play().catch(() => {})
    }
    setCargando(true)
    setPosicionSeg(0)
    setDuracionSeg(actual.duracionSeg ?? 0)
    void (async () => {
      const src = await resolverSrc(actual)
      if (!vivo) return
      setCargando(false)
      if (!src) {
        mostrar(`No encontré el audio de «${actual.titulo}»`, 'error')
        return
      }
      audio.addEventListener('canplay', sonarCuandoListo, { once: true })
      audio.src = src
      void audio.play().catch(() => {})
    })()
    return () => {
      vivo = false
      audio.removeEventListener('canplay', sonarCuandoListo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual?.id])

  // ── eventos del <audio> ─────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const alSonar = () => setSonando(true)
    const alPausar = () => setSonando(false)
    const alTiempo = () => {
      setPosicionSeg(audio.currentTime)
      if ('mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            position: Math.min(audio.currentTime, audio.duration),
            playbackRate: audio.playbackRate,
          })
        } catch {
          /* algunos navegadores lo llaman antes de los metadatos */
        }
      }
    }
    const alDuracion = () => setDuracionSeg(Number.isFinite(audio.duration) ? audio.duration : 0)
    const alTerminar = () => accionesRef.current.siguiente()
    const alFallar = () => {
      const c = actualRef.current
      if (!c) return
      srcCache.current.delete(c.id) // que el próximo intento resuelva fresco
      setSonando(false)
      mostrar(`No pude cargar el audio de «${c.titulo}» — probá de nuevo o bajala con MP3`, 'error', 5000)
    }
    audio.addEventListener('play', alSonar)
    audio.addEventListener('pause', alPausar)
    audio.addEventListener('timeupdate', alTiempo)
    audio.addEventListener('durationchange', alDuracion)
    audio.addEventListener('loadedmetadata', alDuracion)
    audio.addEventListener('ended', alTerminar)
    audio.addEventListener('error', alFallar)
    return () => {
      audio.removeEventListener('play', alSonar)
      audio.removeEventListener('pause', alPausar)
      audio.removeEventListener('timeupdate', alTiempo)
      audio.removeEventListener('durationchange', alDuracion)
      audio.removeEventListener('loadedmetadata', alDuracion)
      audio.removeEventListener('ended', alTerminar)
      audio.removeEventListener('error', alFallar)
    }
  }, [])

  // ── controles ───────────────────────────────────────────────
  const alternar = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !actualRef.current) return
    if (audio.paused) void audio.play().catch(() => {})
    else audio.pause()
  }, [])

  const siguiente = useCallback(() => {
    const lista = colaRef.current
    if (!lista.length) return
    const i = lista.findIndex((c) => c.id === actualRef.current?.id)
    if (i < 0) return
    if (aleatorioRef.current && lista.length > 1) {
      let j = i
      while (j === i) j = Math.floor(Math.random() * lista.length)
      fijarActual(lista[j])
    } else if (i < lista.length - 1) {
      fijarActual(lista[i + 1])
    } else {
      // fin de la cola: queda en la última, al principio, en pausa
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
    }
  }, [])

  const anterior = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    const lista = colaRef.current
    const i = lista.findIndex((c) => c.id === actualRef.current?.id)
    if (i > 0) fijarActual(lista[i - 1])
    else if (audio) audio.currentTime = 0
  }, [])

  const alternarAleatorio = useCallback(() => {
    setAleatorio((a) => {
      aleatorioRef.current = !a
      return !a
    })
  }, [])

  const buscarSeg = useCallback((seg: number) => {
    const audio = audioRef.current
    if (!audio) return
    const tope = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : seg
    const destino = Math.max(0, Math.min(seg, tope))
    audio.currentTime = destino
    setPosicionSeg(destino)
  }, [])

  const reproducir = useCallback(
    (canciones: Cancion[], idCancion: string) => {
      const lista = canciones.filter(
        (c) => c.estado === 'lista' && (c.urlAudio || c.audioLocal || c.respaldada),
      )
      const objetivo = lista.find((c) => c.id === idCancion) ?? null
      if (!objetivo) {
        mostrar('Esa canción todavía no tiene audio', 'info')
        return
      }
      colaRef.current = lista
      setCola(lista)
      if (actualRef.current?.id === idCancion) {
        // ya está cargada: solo reanudar (o arrancar de nuevo si terminó)
        const audio = audioRef.current
        if (audio) {
          if (audio.ended) audio.currentTime = 0
          void audio.play().catch(() => {})
        }
        return
      }
      fijarActual(objetivo)
    },
    [mostrar],
  )

  const cerrar = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    colaRef.current = []
    setCola([])
    fijarActual(null)
    setSonando(false)
    setPosicionSeg(0)
    setDuracionSeg(0)
  }, [])

  // ── refs a los controles (para los handlers de mediaSession
  //    y el evento ended, que se registran una sola vez) ──────
  const accionesRef = useRef({ alternar, siguiente, anterior, buscarSeg })
  useEffect(() => {
    accionesRef.current = { alternar, siguiente, anterior, buscarSeg }
  }, [alternar, siguiente, anterior, buscarSeg])

  // ── mediaSession: controles de la pantalla de bloqueo ───────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (actual) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: actual.titulo,
        artist: 'MusicTrack',
        album: actual.estilo || 'Biblioteca',
        artwork: actual.urlPortada ? [{ src: actual.urlPortada, sizes: '512x512' }] : [],
      })
    } else {
      navigator.mediaSession.metadata = null
    }
    navigator.mediaSession.playbackState = sonando ? 'playing' : 'paused'
  }, [actual, sonando])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const set = (accion: MediaSessionAction, handler: ((d: MediaSessionActionDetails) => void) | null) => {
      try {
        ms.setActionHandler(accion, handler)
      } catch {
        /* ese control no existe en este navegador */
      }
    }
    set('play', () => accionesRef.current.alternar())
    set('pause', () => accionesRef.current.alternar())
    set('previoustrack', () => accionesRef.current.anterior())
    set('nexttrack', () => accionesRef.current.siguiente())
    set('seekto', (d) => {
      if (typeof d.seekTime === 'number') accionesRef.current.buscarSeg(d.seekTime)
    })
    set('seekbackward', () => {
      const a = audioRef.current
      if (a) accionesRef.current.buscarSeg(a.currentTime - 10)
    })
    set('seekforward', () => {
      const a = audioRef.current
      if (a) accionesRef.current.buscarSeg(a.currentTime + 10)
    })
    return () => {
      // al desmontar el provider, soltar los handlers
      for (const a of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward'] as const)
        set(a, null)
    }
  }, [])

  // ── la biblioteca cambió (renombró, respaldó, borró…) ──────
  useEffect(() => {
    function alCambiar(e: Event) {
      const nuevas = (e as CustomEvent<Cancion[]>).detail
      const idsCola = new Set(colaRef.current.map((c) => c.id))
      const id = actualRef.current?.id
      if (!id) return
      const viejoIdx = colaRef.current.findIndex((c) => c.id === id)
      const refrescada = idsCola.size ? nuevas.filter((c) => idsCola.has(c.id)) : []
      colaRef.current = refrescada
      setCola(refrescada)
      const fresca = nuevas.find((c) => c.id === id)
      if (fresca) {
        fijarActual(fresca) // título nuevo, respaldada 💾 recién llegada…
      } else {
        // borraron la que sonaba → sigue la que venía detrás
        const reemplazo = refrescada[viejoIdx] ?? refrescada[viejoIdx - 1]
        if (reemplazo) fijarActual(reemplazo)
        else {
          audioRef.current?.pause()
          fijarActual(null)
        }
      }
    }
    window.addEventListener(EVENTO_CANCIONES, alCambiar)
    return () => window.removeEventListener(EVENTO_CANCIONES, alCambiar)
  }, [])

  const valor = useMemo<CtxReproductor>(
    () => ({
      actual,
      cola,
      sonando,
      aleatorio,
      cargando,
      posicionSeg,
      duracionSeg,
      reproducir,
      alternar,
      siguiente,
      anterior,
      alternarAleatorio,
      buscarSeg,
      cerrar,
    }),
    [actual, cola, sonando, aleatorio, cargando, posicionSeg, duracionSeg, reproducir, alternar, siguiente, anterior, alternarAleatorio, buscarSeg, cerrar],
  )

  return (
    <Ctx.Provider value={valor}>
      {/* EL audio de la app: vive acá, por encima de las pestañas —
          por eso la música sigue al cambiar de vista. */}
      <audio ref={audioRef} preload="metadata" className="hidden" />
      {children}
    </Ctx.Provider>
  )
}

export function useReproductor(): CtxReproductor {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useReproductor debe usarse dentro de <ReproductorProvider>')
  return ctx
}

/** ¿Hay una copia local del audio de esta canción en el dispositivo? */
export function tieneAudioLocal(c: Cancion): boolean {
  return Boolean(c.audioLocal || c.respaldada)
}
