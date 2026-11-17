import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Camera, Clapperboard, Loader2, Pause, Pencil, Play, RotateCcw, Square, Trash2, Video } from 'lucide-react'
import type { Cancion } from '@/types'
import { portadaDe } from '@/types'
import { leerAjustes, leer, guardar } from '@/core/storage/almacenamiento'
import { leerAudio } from '@/core/storage/audio'
import { necesitaRespaldo, respaldarCancion } from '@/core/storage/respaldo'
import { pedirLetraSincronizada, type MotorSuno } from '@/core/ai/suno'
import { lineasConTiempo, estimarLineasConTiempo, type LineaLrc } from '@/core/audio/mp3'
import { formatoTiempo, letraDeCancion } from '@/components/player/comunes'
import { guardarArchivoEnDescargas } from '@/core/natives/descargas'
import { elegirVariasImagenes, vibrar } from '@/core/natives/plataforma'
import { alinearLetraEditada, filtrarMarcasEstructura, repararPalabrasDeLineas, textoDeLineas } from '@/core/karaoke/letra'
import { Boton } from '@/components/ui/Boton'
import { Modal } from '@/components/ui/Modal'
import {
  ANIMACIONES_KARAOKE,
  FORMATOS_VIDEO,
  FUENTES_KARAOKE,
  PALETAS_KARAOKE,
  cargarFuentesKaraoke,
  dibujarCuadro,
  elegirMimeTypeVideo,
  estiloKaraokePorDefecto,
  extensionVideo,
  formatoDe,
  cargarImagenSegura,
  nombreVideoKaraoke,
  reducirImagenParaVideo,
  soportaGrabacionVideo,
  type EstiloKaraoke,
  type EstadoCuadro,
} from '@/core/video/karaoke'

// ═══════════════════════════════════════════════════════════
// 🎬 v0.21.0 — FASE 19 (pedido de Rudy): el ESTUDIO DE VIDEO
// KARAOKE. Elegís fotos de fondo, fuente, color de la palabra
// cantada y animación; la vista previa suena con la letra que
// avanza; y «Grabar» arma el video EN la app (canvas + audio,
// MediaRecorder) y lo baja a la carpeta de siempre. Cero
// créditos: todo pasa en tu dispositivo.
// ═══════════════════════════════════════════════════════════

/** Máximo de fotos de fondo (más es memoria al pedo: rotan igual). */
const MAX_FOTOS = 12

export function ModalVideoKaraoke({
  cancion,
  onCerrar,
  aviso,
}: {
  cancion: Cancion | null
  onCerrar: () => void
  aviso: (mensaje: string, tipo?: 'ok' | 'error' | 'info', duracionMs?: number) => void
}) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** audio decodificado (lo que se graba) + fuente para escuchar */
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [srcAudio, setSrcAudio] = useState<string | null>(null)
  const [duracion, setDuracion] = useState(0)
  /** la letra ALINEADA (con la edición de Rudy si la hizo) — antes
   * del filtro de marcas; `lineas` (abajo) es la que se dibuja */
  const [lineasBase, setLineasBase] = useState<LineaLrc[]>([])
  const [tipoLetra, setTipoLetra] = useState<'real' | 'estimada'>('estimada')
  // 🎨 v0.23.0 — el estilo se recuerda entre canciones y sesiones
  const [estilo, setEstilo] = useState<EstiloKaraoke>(() => ({
    ...estiloKaraokePorDefecto(),
    ...leer<Partial<EstiloKaraoke>>('estilo-karaoke', {}),
  }))
  const [fotos, setFotos] = useState<string[]>([])
  const [imagenes, setImagenes] = useState<HTMLImageElement[]>([])
  const [portada, setPortada] = useState<HTMLImageElement | null>(null)
  const [sonando, setSonando] = useState(false)
  const [grabando, setGrabando] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null)
  const [tPrevia, setTPrevia] = useState(0)
  // ✏️ v0.23.0 — editor de letra del video (solo para el video)
  const [editandoLetra, setEditandoLetra] = useState(false)
  const [textoEdicion, setTextoEdicion] = useState('')
  const [hayEdicion, setHayEdicion] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const calibracionRef = useRef(0)
  const canceladoRef = useRef(false)
  const grabadorRef = useRef<MediaRecorder | null>(null)
  const actxRef = useRef<AudioContext | null>(null)
  const fuenteRef = useRef<AudioBufferSourceNode | null>(null)
  const rafRef = useRef(0)
  const despertarRef = useRef<{ release?: () => Promise<void> } | null>(null)
  /** la letra con tiempos TAL CUAL se cargó (para «volver a la original») */
  const originalesRef = useRef<LineaLrc[]>([])

  const c = cancion

  // 🙈 v0.23.0 — la letra que se DIBUJA: sin marcas (Coro), (Verso
  // 1)… si Rudy así lo quiere. La base queda intacta.
  const lineas = useMemo(
    () => (estilo.ocultarMarcas ? filtrarMarcasEstructura(lineasBase, true) : lineasBase),
    [lineasBase, estilo.ocultarMarcas],
  )

  // 💾 el estilo elegido se recuerda (fuente, tamaño, animación…)
  useEffect(() => {
    if (!cargando && !error) guardar('estilo-karaoke', estilo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estilo])

  // ── cargar audio + letra al abrir ─────────────────────────
  useEffect(() => {
    if (!c) return
    let vivo = true
    setCargando(true)
    setError(null)
    setGuardadoEn(null)
    setEditandoLetra(false)
    setHayEdicion(false)
    calibracionRef.current = leer(`sync-${c.id}`, 0)
    void (async () => {
      try {
        if (!soportaGrabacionVideo()) {
          throw new Error(
            'Este equipo no sabe grabar video 😕 — probá actualizar «Android System WebView» desde la Play Store y volvé a abrir el karaoke',
          )
        }
        // 🎨 v0.23.0 — las fuentes nuevas viajan en el APK: se
        // registran mientras prepara el audio (máx 2,5 s de espera;
        // si alguna falla, el canvas cae a los fallbacks)
        await Promise.race([
          cargarFuentesKaraoke(),
          new Promise((r) => setTimeout(r, 2500)),
        ])
        // ── AUDIO: copia local → respaldo → URL del CDN ──
        let src: string | null = null
        if (c.audioLocal || c.respaldada) src = await leerAudio(c.id)
        if (!src && necesitaRespaldo(c) && (await respaldarCancion(c))) src = await leerAudio(c.id)
        if (!src && c.urlAudio) {
          // último recurso: bajar del CDN (en el celu suele andar;
          // en la web puede frenarlo el CORS)
          try {
            const resp = await fetch(c.urlAudio)
            if (resp.ok) src = c.urlAudio
          } catch {
            /* abajo se explica */
          }
        }
        if (!src) throw new Error('No pude conseguir el audio de esta canción — probá con conexión y de nuevo')
        let buf: AudioBuffer | null = null
        try {
          const actx = new AudioContext()
          const crudo = await (await fetch(src)).arrayBuffer()
          buf = await actx.decodeAudioData(crudo)
          void actx.close()
        } catch {
          buf = null // escuchar se puede igual; grabar no
        }
        if (!vivo) return
        setSrcAudio(src)
        setBuffer(buf)
        const dur = buf?.duration ?? c.duracionSeg ?? 0
        setDuracion(dur)

        // ── LETRA: caché → tiempos reales de Suno → estimada ──
        const letra = letraDeCancion(c)
        let ls = leer<LineaLrc[]>(`lrc-${c.id}`, [])
        let tipo: 'real' | 'estimada' = 'real'
        if (!ls.length && letra && c.motor !== 'lyria' && c.taskId && c.audioId) {
          const ajustes = leerAjustes()
          if (ajustes.tokenSuno) {
            try {
              const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
              const palabras = await pedirLetraSincronizada(motor, c.taskId, c.audioId)
              if (palabras?.length) {
                ls = lineasConTiempo(letra, palabras)
                if (ls.length) guardar(`lrc-${c.id}`, ls)
              }
            } catch {
              /* la estimada alcanza */
            }
          }
        }
        if (!ls.length && letra && dur > 10) {
          ls = estimarLineasConTiempo(letra, dur)
          tipo = 'estimada'
        }
        // 🩹 v0.23.2 — los cachés lrc- guardados por versiones
        // viejos traen las marcas de Suno ([Verse 1], (Coro)…)
        // PEGADAS a las palabras, con los tiempos corridos — era
        // lo que hacía que la vista previa y el video mostraran
        // corchetes aunque «Solo la letra» estuviera activado.
        // Se repara una sola vez y el caché queda sano siempre.
        if (ls.length) {
          const reparadas = repararPalabrasDeLineas(ls)
          if (reparadas !== ls) {
            ls = reparadas
            guardar(`lrc-${c.id}`, ls)
          }
        }
        if (!vivo) return
        // ✏️ v0.23.0 — si Rudy ya editó la letra de ESTE video, se
        // alinea con los tiempos de la original; si no, va directa
        originalesRef.current = ls
        const editada = leer<string>(`karaoke-edit-${c.id}`, '')
        const base = editada.trim() ? alinearLetraEditada(ls, editada) : ls
        setHayEdicion(!!editada.trim())
        setLineasBase(base)
        setTipoLetra(tipo)
        if (!ls.length) throw new Error('Esta canción no tiene letra con tiempos para seguir')

        // ── portada de arranque (fondo si no elige fotos) ──
        const urlPortada = portadaDe(c)
        if (urlPortada) setPortada(await cargarImagenSegura(urlPortada))
        if (!vivo) return
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No pude preparar el karaoke')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
    // depende de la canción, no de sus datos frescos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id])

  // ── tamaño del lienzo según el formato ────────────────────
  useEffect(() => {
    const lienzo = canvasRef.current
    if (!lienzo) return
    const fmt = formatoDe(estilo.formato)
    lienzo.width = fmt.ancho
    lienzo.height = fmt.alto
    ctxRef.current = lienzo.getContext('2d')
  }, [estilo.formato, cargando, error, lineas])

  // ── fotos elegidas → imágenes listas para dibujar ─────────
  useEffect(() => {
    let vivo = true
    void (async () => {
      const cargadas: HTMLImageElement[] = []
      for (const f of fotos) {
        const img = await cargarImagenSegura(f)
        if (img) cargadas.push(img)
      }
      if (vivo) setImagenes(cargadas)
    })()
    return () => {
      vivo = false
    }
  }, [fotos])

  /** estado del cuadro para el segundo t. */
  function estadoEn(t: number): EstadoCuadro | null {
    const lienzo = canvasRef.current
    if (!lienzo || !c) return null
    return {
      ancho: lienzo.width,
      alto: lienzo.height,
      t,
      duracion: duracion || c.duracionSeg || 0,
      lineas,
      estilo,
      imagenes: imagenes.length ? imagenes : portada ? [portada] : [],
      titulo: c.titulo,
      subtitulo: c.estilo || c.modelo || 'MusicTrack',
      calibracion: calibracionRef.current,
    }
  }

  function dibujar(t: number): void {
    const ctx = ctxRef.current
    const e = estadoEn(t)
    if (!ctx || !e) return
    dibujarCuadro(ctx, e)
  }

  /** cuadro congelado (mientras no suena): una línea visible de
   * una para que se vea el estilo al elegirlo. */
  function dibujarDemo(): void {
    const t = lineas.length ? Math.min(lineas[0].startS + 1.2, duracion - 0.5) : 1
    dibujar(Math.max(0, t))
  }

  // ── vista previa: redibujar al cambiar algo estando pausado ─
  useEffect(() => {
    if (sonando || grabando || cargando || error || !lineas.length) return
    dibujarDemo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estilo, imagenes, portada, lineas, sonando, grabando, cargando, error])

  // ── loop de la vista previa (el audio manda) ──────────────
  useEffect(() => {
    if (!sonando || grabando) return
    let vivo = true
    let ultima = -1
    const paso = () => {
      if (!vivo) return
      const a = audioRef.current
      const t = a?.currentTime ?? 0
      if (t !== ultima) {
        dibujar(t)
        setTPrevia(t)
        ultima = t
      }
      rafRef.current = requestAnimationFrame(paso)
    }
    rafRef.current = requestAnimationFrame(paso)
    return () => {
      vivo = false
      cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sonando, grabando, estilo, imagenes, lineas])

  // ── limpieza al cerrar ────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      canceladoRef.current = true
      try {
        if (grabadorRef.current && grabadorRef.current.state !== 'inactive') grabadorRef.current.stop()
      } catch {
        /* ya estaba parado */
      }
      try {
        fuenteRef.current?.stop()
      } catch {
        /* nada */
      }
      void actxRef.current?.close().catch(() => undefined)
      try {
        void despertarRef.current?.release?.()
      } catch {
        /* nada */
      }
      audioRef.current?.pause()
    }
  }, [])

  function alternarPrevia(): void {
    const a = audioRef.current
    if (!a || grabando) return
    vibrar('ligera')
    if (a.paused) {
      if (a.currentTime >= duracion - 0.05) a.currentTime = 0
      void a.play()
    } else {
      a.pause()
    }
  }

  async function agregarFotos(): Promise<void> {
    if (grabando) return
    vibrar('ligera')
    const crudas = await elegirVariasImagenes()
    if (!crudas.length) return
    const hueco = MAX_FOTOS - fotos.length
    if (hueco <= 0) {
      aviso(`Ya tenés las ${MAX_FOTOS} fotos máximas — sacá alguna primero`, 'info', 3500)
      return
    }
    const listas: string[] = []
    for (const d of crudas.slice(0, hueco)) {
      const r = await reducirImagenParaVideo(d, 1440)
      if (r) listas.push(r)
    }
    if (!listas.length) {
      aviso('No pude leer esas fotos 😕 — probá de nuevo', 'error', 3500)
      return
    }
    setFotos((prev) => [...prev, ...listas].slice(0, MAX_FOTOS))
    aviso(`${listas.length} foto${listas.length > 1 ? 's' : ''} listas 🖼️ — rotan solas durante el video`, 'ok', 3000)
  }

  /** 🎥 LA grabación: pinta el canvas y lo graba con el audio,
   * en tiempo real (dura lo que la canción). */
  async function grabar(): Promise<void> {
    const lienzo = canvasRef.current
    if (!lienzo || !c || grabando) return
    // 🩹 v0.23.1 — si con las marcas escondidas no queda letra,
    // avisar en vez de quedarse mudo (antes el botón no hacía nada)
    if (!lineas.length) {
      aviso('Con las marcas escondidas esta letra quedó vacía — activá «Letra con marcas» o editá la letra', 'error', 5000)
      return
    }
    const mime = elegirMimeTypeVideo()
    if (!mime) {
      aviso('Este equipo no puede grabar video 😕', 'error', 4000)
      return
    }
    let actx: AudioContext | null = null
    try {
      if (!buffer) throw new Error('no tengo el audio decodificado — probá reabrir el karaoke')
      audioRef.current?.pause()
      setGrabando(true)
      setProgreso(0)
      setGuardadoEn(null)
      canceladoRef.current = false

      // pantalla prendida mientras graba (si el equipo lo soporta)
      try {
        despertarRef.current =
          (await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen')) ?? null
      } catch {
        /* WebView viejo: seguimos igual */
      }

      actx = new AudioContext()
      actxRef.current = actx
      await actx.resume()
      const destino = actx.createMediaStreamDestination()
      const fuente = actx.createBufferSource()
      fuente.buffer = buffer
      fuente.connect(destino)
      fuente.connect(actx.destination) // se escucha mientras graba
      fuenteRef.current = fuente

      const pistaVideo = lienzo.captureStream(30)
      const corriente = new MediaStream([...pistaVideo.getVideoTracks(), ...destino.stream.getAudioTracks()])
      const rec = new MediaRecorder(corriente, {
        mimeType: mime,
        // 🩹 v0.23.2 — 4,5 Mbps (antes 6): para fotos con zoom +
        // letra se ve igual de nítido y el archivo queda 25%
        // más liviano — menos memoria en riesgo al guardarlo
        videoBitsPerSecond: 4_500_000,
        audioBitsPerSecond: 160_000,
      })
      grabadorRef.current = rec
      const pedazos: Blob[] = []
      rec.ondataavailable = (ev) => {
        if (ev.data.size) pedazos.push(ev.data)
      }
      const alTerminar = new Promise<Blob>((resolver) => {
        rec.onstop = () => resolver(new Blob(pedazos, { type: mime }))
      })
      rec.start(1000)

      // el audio arraca apenas después: el primer cuadro sale limpio
      const t0 = actx.currentTime + 0.12
      fuente.start(t0)
      let ultimoPct = -1
      const paso = () => {
        const t = Math.max(0, actx!.currentTime - t0)
        dibujar(t)
        const pct = Math.min(1, t / duracion)
        if (Math.floor(pct * 200) !== ultimoPct) {
          ultimoPct = Math.floor(pct * 200)
          setProgreso(pct)
        }
        if (canceladoRef.current) return
        if (t < duracion + 0.4) rafRef.current = requestAnimationFrame(paso)
      }
      rafRef.current = requestAnimationFrame(paso)
      fuente.onended = () => {
        try {
          if (rec.state !== 'inactive') rec.stop()
        } catch {
          /* ya paró */
        }
      }
      const blob = await alTerminar
      cancelAnimationFrame(rafRef.current)
      if (canceladoRef.current) {
        aviso('Grabación cancelada — no se guardó nada', 'info', 3000)
        return
      }
      // 💾 a la carpeta de siempre
      const ajustes = leerAjustes()
      const nombre = nombreVideoKaraoke(c.titulo, c.version, estilo.formato, extensionVideo(mime))
      const res = await guardarArchivoEnDescargas(blob, nombre, ajustes.carpetaDescargas)
      if (res.ok) {
        vibrar()
        setGuardadoEn(res.ruta)
        aviso(`¡Video listo! 🎬 ${formatoTiempo(duracion)} — guardado en ${res.ruta}`, 'ok', 6500)
      } else {
        aviso(`No pude guardar el video: ${res.error}`, 'error', 6000)
      }
    } catch (e) {
      aviso(e instanceof Error ? e.message : 'La grabación falló', 'error', 5000)
    } finally {
      cancelAnimationFrame(rafRef.current)
      try {
        void despertarRef.current?.release?.()
      } catch {
        /* nada */
      }
      despertarRef.current = null
      try {
        void actx?.close().catch(() => undefined)
      } catch {
        /* nada */
      }
      actxRef.current = null
      fuenteRef.current = null
      grabadorRef.current = null
      setGrabando(false)
      setProgreso(0)
      dibujarDemo()
    }
  }

  function cancelarGrabacion(): void {
    canceladoRef.current = true
    cancelAnimationFrame(rafRef.current)
    try {
      fuenteRef.current?.stop()
    } catch {
      /* nada */
    }
    try {
      if (grabadorRef.current && grabadorRef.current.state !== 'inactive') grabadorRef.current.stop()
    } catch {
      /* nada */
    }
  }

  // ✏️ v0.23.0 — EDITOR DE LETRA DEL VIDEO: Rudy toca «Editar»,
  // cambia lo que quiera (sacar líneas, corregir, agregar) y al
  // «Usar» cada línea hereda el tiempo de su original (las nuevas
  // se interpolan). SOLO cambia el video — la letra guardada de
  // la canción queda intacta, y se recuerda por si reabre.
  function abrirEditor(): void {
    vibrar('ligera')
    setTextoEdicion(textoDeLineas(lineas))
    setEditandoLetra(true)
  }

  function aplicarEdicion(): void {
    if (!c) return
    const texto = textoEdicion.trim()
    if (!texto) {
      volverALetraOriginal()
      return
    }
    setLineasBase(alinearLetraEditada(originalesRef.current, texto))
    guardar(`karaoke-edit-${c.id}`, texto)
    setHayEdicion(true)
    setEditandoLetra(false)
    vibrar()
    aviso('Letra del video actualizada ✏️ — los tiempos se acomodan solos', 'ok', 3500)
  }

  function volverALetraOriginal(): void {
    if (!c) return
    setLineasBase(originalesRef.current)
    guardar(`karaoke-edit-${c.id}`, '')
    setHayEdicion(false)
    setEditandoLetra(false)
    aviso('Volviste a la letra original de la canción', 'info', 3000)
  }

  // ── render ────────────────────────────────────────────────
  return (
    <Modal abierto={!!c} onCerrar={grabando ? () => undefined : onCerrar} titulo={`🎬 Video karaoke — «${c?.titulo ?? ''}»`}>
      {cargando ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-acento" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Preparando el karaoke…</p>
        </div>
      ) : error ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-red-500">{error}</p>
          <Boton variante="secundario" className="w-full" onClick={onCerrar}>
            Cerrar
          </Boton>
        </div>
      ) : (
        c && (
          <div className="space-y-3">
            {/* vista previa */}
            <div className="relative overflow-hidden rounded-2xl bg-neutral-950">
              <canvas
                ref={canvasRef}
                className="mx-auto block h-auto max-h-[38vh] w-auto max-w-full"
                aria-label="Vista previa del video karaoke"
              />
              {/* play/pausa encima de la preview */}
              <button
                type="button"
                onClick={alternarPrevia}
                disabled={grabando || !srcAudio}
                aria-label={sonando ? 'Pausar la vista previa' : 'Escuchar la vista previa'}
                className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-transform active:scale-95 disabled:opacity-40"
              >
                {sonando ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
              </button>
              {/* badge del tipo de letra */}
              <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">
                {tipoLetra === 'real' ? '✓ letra sincronizada' : '~ tiempos estimados'}
              </span>
              <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold tabular-nums text-white backdrop-blur">
                {formatoTiempo(sonando ? tPrevia : 0)} / {formatoTiempo(duracion)}
              </span>
            </div>

            {/* formato */}
            <Seccion titulo="Formato">
              <div className="grid grid-cols-3 gap-2">
                {FORMATOS_VIDEO.map((f) => (
                  <Chip key={f.id} activo={estilo.formato === f.id} onClick={() => setEstilo((s) => ({ ...s, formato: f.id }))}>
                    {f.emoji} {f.nombre}
                    <span className="block text-[10px] font-normal opacity-70">{f.ancho}×{f.alto}</span>
                  </Chip>
                ))}
              </div>
            </Seccion>

            {/* fuente */}
            <Seccion titulo="Fuente de la letra">
              <div className="grid grid-cols-2 gap-2">
                {FUENTES_KARAOKE.map((f) => (
                  <Chip key={f.id} activo={estilo.fuente === f.id} onClick={() => setEstilo((s) => ({ ...s, fuente: f.id }))}>
                    {/* cada chip se ve CON SU PROPIA fuente (preview en vivo) */}
                    <span style={{ fontFamily: f.familia }}>
                      {f.emoji} {f.nombre}
                    </span>
                    <span className="block text-[10px] font-normal opacity-70" style={{ fontFamily: f.familia }}>
                      {f.detalle}
                    </span>
                  </Chip>
                ))}
              </div>
            </Seccion>

            {/* 🎨 v0.23.0 — tamaño de la letra */}
            <Seccion titulo={`Tamaño de la letra — ${Math.round((estilo.tamanoTexto || 1) * 100)}%`}>
              <div className="flex items-center gap-3 px-1">
                <span className="text-[10px] font-black text-neutral-400">A</span>
                <input
                  type="range"
                  min={0.65}
                  max={1.6}
                  step={0.05}
                  value={estilo.tamanoTexto || 1}
                  onChange={(ev) => setEstilo((s) => ({ ...s, tamanoTexto: Number(ev.target.value) }))}
                  disabled={grabando}
                  aria-label="Tamaño de la letra"
                  className="h-2 flex-1 accent-acento"
                />
                <span className="text-2xl font-black leading-none text-neutral-500 dark:text-neutral-300">A</span>
              </div>
            </Seccion>

            {/* color de la palabra cantada */}
            <Seccion titulo="Color de la palabra que se canta">
              <div className="flex flex-wrap gap-2">
                {PALETAS_KARAOKE.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={grabando}
                    onClick={() => {
                      vibrar('ligera')
                      setEstilo((s) => ({ ...s, paleta: p.id }))
                    }}
                    title={p.nombre}
                    aria-label={p.nombre}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-transform active:scale-95 ${
                      estilo.paleta === p.id ? 'border-acento scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: p.color }}
                  >
                    {estilo.paleta === p.id && <span className="text-xs font-black text-black/60">✓</span>}
                  </button>
                ))}
              </div>
            </Seccion>

            {/* animación */}
            <Seccion titulo="Animación">
              <div className="grid grid-cols-3 gap-2">
                {ANIMACIONES_KARAOKE.map((a) => (
                  <Chip key={a.id} activo={estilo.animacion === a.id} onClick={() => setEstilo((s) => ({ ...s, animacion: a.id }))}>
                    {a.emoji} {a.nombre}
                    <span className="block text-[10px] font-normal opacity-70">{a.detalle}</span>
                  </Chip>
                ))}
              </div>
            </Seccion>

            {/* ✏️ v0.23.0 — LETRA DEL VIDEO: marcas escondidas + editor */}
            <Seccion titulo="Letra del video">
              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  activo={estilo.ocultarMarcas}
                  onClick={() => setEstilo((s) => ({ ...s, ocultarMarcas: !s.ocultarMarcas }))}
                >
                  {/* 🩹 v0.23.1 — el nombre que Rudy tenía en la cabeza:
                      «la opción para que solo se vean las letras» */}
                  {estilo.ocultarMarcas ? '🙈 Solo la letra' : '👁️ Letra con marcas'}
                  <span className="block text-[10px] font-normal opacity-70">todo lo que esté entre ( ) o [ ] se esconde</span>
                </Chip>
                <Boton
                  variante="fantasma"
                  tamano="sm"
                  icono={<Pencil className="h-3.5 w-3.5" />}
                  disabled={grabando}
                  onClick={abrirEditor}
                >
                  Editar
                </Boton>
                {hayEdicion && (
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    icono={<RotateCcw className="h-3.5 w-3.5" />}
                    disabled={grabando}
                    onClick={volverALetraOriginal}
                  >
                    Original
                  </Boton>
                )}
              </div>
              {editandoLetra && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={textoEdicion}
                    onChange={(ev) => setTextoEdicion(ev.target.value)}
                    rows={8}
                    spellCheck={false}
                    aria-label="Letra del video"
                    placeholder="Cada línea es una línea de la letra…"
                    className="w-full resize-y rounded-xl border border-neutral-200 bg-white p-3 font-mono text-xs leading-relaxed text-neutral-800 focus:border-acento focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                  <div className="flex gap-2">
                    <Boton tamano="sm" onClick={aplicarEdicion} disabled={!textoEdicion.trim()}>
                      Usar esta letra
                    </Boton>
                    <Boton variante="fantasma" tamano="sm" onClick={() => setEditandoLetra(false)}>
                      Cancelar
                    </Boton>
                  </div>
                  <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    Solo cambia lo que se ve en ESTE video — la letra guardada de la canción queda intacta. Cada línea
                    mantiene su tiempo; si agregás o sacás líneas, los tiempos se acomodan solos.
                  </p>
                </div>
              )}
            </Seccion>

            {/* fotos de fondo */}
            <Seccion titulo="Fotos de fondo">
              <div className="flex flex-wrap items-center gap-2">
                <Boton variante="secundario" tamano="sm" icono={<Camera className="h-3.5 w-3.5" />} onClick={() => void agregarFotos()} cargando={false}>
                  Agregar fotos
                </Boton>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {fotos.length ? `${fotos.length}/${MAX_FOTOS} — rotan solas` : 'opcional: sin fotos va la portada'}
                </span>
              </div>
              {fotos.length > 0 && (
                <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {fotos.map((f, i) => (
                    <li key={`${i}-${f.slice(24, 40)}`} className="relative shrink-0">
                      <img src={f} alt={`Foto de fondo ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          vibrar('ligera')
                          setFotos((prev) => prev.filter((_, j) => j !== i))
                        }}
                        aria-label={`Sacar la foto ${i + 1}`}
                        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-white shadow"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Seccion>

            {/* grabar */}
            <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
              {!grabando ? (
                <>
                  <Boton
                    className="w-full"
                    variante="primario"
                    icono={<Video className="h-4 w-4" />}
                    cargando={false}
                    disabled={!buffer}
                    onClick={() => void grabar()}
                  >
                    🎥 Grabar el video — {formatoTiempo(duracion)} en tiempo real
                  </Boton>
                  {!buffer && (
                    <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                      No pude decodificar el audio para grabar (solo para escuchar). Cerrá y abrí el karaoke de nuevo con
                      buena conexión — la copia local del audio se usa apenas existe.
                    </p>
                  )}
                  <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    La grabación dura lo que la canción y necesita la app abierta con la pantalla prendida
                    (mantené el celu despierto). Se oye mientras graba — así sabés que va.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-acento">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-acento opacity-60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-acento" />
                      </span>
                      Grabando… {Math.round(progreso * 100)}%
                    </p>
                    <Boton variante="fantasma" tamano="sm" icono={<Square className="h-3.5 w-3.5" />} onClick={cancelarGrabacion}>
                      Cancelar
                    </Boton>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div className="h-full rounded-full bg-acento transition-[width] duration-200" style={{ width: `${progreso * 100}%` }} />
                  </div>
                </>
              )}
              {guardadoEn && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Clapperboard className="h-3.5 w-3.5 shrink-0" /> Guardado en {guardadoEn}
                </p>
              )}
            </div>
          </div>
        )
      )}
      {/* el audio de la vista previa (invisible) */}
      {srcAudio && <audio ref={audioRef} src={srcAudio} preload="auto" onPlay={() => setSonando(true)} onPause={() => setSonando(false)} onEnded={() => setSonando(false)} className="hidden" />}
    </Modal>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="pb-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-400">{titulo}</h3>
      {children}
    </div>
  )
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => {
        vibrar('ligera')
        onClick()
      }}
      className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
        activo
          ? 'border-acento bg-acento/10 text-acento'
          : 'border-neutral-200 text-neutral-600 hover:border-acento/40 dark:border-neutral-800 dark:text-neutral-300'
      }`}
    >
      {children}
    </button>
  )
}
