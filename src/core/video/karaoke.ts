import type { LineaLrc } from '@/core/audio/mp3'

// ═══════════════════════════════════════════════════════════
// 🎬 VIDEO KARAOKE (v0.21.0) — FASE 19, pedido de Rudy: «un
// video karaoke con mis fotos, la letra avanzando con la música
// y la fuente y el estilo que yo elija». Todo DENTRO de la app
// y SIN gastar créditos: el video se dibuja cuadro a cuadro en
// un <canvas> (fotos de fondo rotando + la línea que se canta
// con la palabra encendida — los mismos tiempos del reproductor)
// y se graba en tiempo real con MediaRecorder
// (canvas.captureStream + el audio decodificado). El resultado
// baja como archivo a la carpeta de siempre, listo para
// WhatsApp / TikTok / YouTube.
//
// Este módulo es el MOTOR puro: catálogos, envoltura de texto,
// elección de formato de grabación y el dibujo del cuadro. La
// interfaz (elegir fotos, escuchar, grabar) vive en
// components/karaoke/ModalVideoKaraoke.tsx.
//
// 🎨 v0.23.0 — NIVEL 2 del estudio (pedido de Rudy): 16 fuentes
// (11 NUEVAS incluidas en el APK — así se ven igual en cualquier
// celular), control de TAMAÑO de la letra, 4 animaciones nuevas
// (Deslizar, Rebote, Neón y Máquina de escribir) y el filtro de
// marcas de estructura (letra.ts). Cero créditos, todo local.
// ═══════════════════════════════════════════════════════════

// ── catálogos que elige el usuario ──────────────────────────

export type IdFormatoVideo = 'vertical' | 'cuadrado' | 'horizontal'

export interface FormatoVideo {
  id: IdFormatoVideo
  emoji: string
  nombre: string
  detalle: string
  /** tamaño del lienzo en px */
  ancho: number
  alto: number
  /** tamaño de la letra relativo al ancho (0-1) */
  escalaTexto: number
  /** nombre corto para el archivo («… — karaoke vertical.mp4») */
  corto: string
}

export const FORMATOS_VIDEO: FormatoVideo[] = [
  {
    id: 'vertical',
    emoji: '📱',
    nombre: 'Vertical',
    detalle: '9:16 — WhatsApp, historias y TikTok',
    ancho: 720,
    alto: 1280,
    escalaTexto: 0.078,
    corto: 'vertical',
  },
  {
    id: 'cuadrado',
    emoji: '🖼️',
    nombre: 'Cuadrado',
    detalle: '1:1 — posts de Instagram',
    ancho: 900,
    alto: 900,
    escalaTexto: 0.066,
    corto: 'cuadrado',
  },
  {
    id: 'horizontal',
    emoji: '🖥️',
    nombre: 'Horizontal',
    detalle: '16:9 — YouTube y pantallas',
    ancho: 1280,
    alto: 720,
    escalaTexto: 0.05,
    corto: 'horizontal',
  },
]

export type IdFuenteKaraoke =
  | 'moderna'
  | 'clasica'
  | 'condensada'
  | 'maquina'
  | 'manuscrita'
  | 'impacto'
  | 'bebas'
  | 'slab'
  | 'cine'
  | 'festiva'
  | 'olas'
  | 'apunte'
  | 'marcador'
  | 'croquis'
  | 'comics'
  | 'futuro'

export interface FuenteKaraoke {
  id: IdFuenteKaraoke
  emoji: string
  nombre: string
  detalle: string
  /** pila CSS para el canvas (con fallbacks de Android) */
  familia: string
  peso: string
  /** 🎨 v0.23.0 — archivo TTF incluido EN el APK (public/fuentes);
   * las que no lo tienen usan las del sistema. */
  archivo?: string
}

export const FUENTES_KARAOKE: FuenteKaraoke[] = [
  {
    id: 'moderna',
    emoji: '🅰️',
    nombre: 'Moderna',
    detalle: 'gruesa y limpia — estilo Spotify',
    familia: 'system-ui, Roboto, sans-serif',
    peso: '800',
  },
  {
    id: 'impacto',
    emoji: '🎯',
    nombre: 'Impacto',
    detalle: 'gigante y potente — estilo videoclip',
    familia: '"Anton", Impact, "Arial Black", sans-serif',
    peso: '400',
    archivo: 'anton.ttf',
  },
  {
    id: 'bebas',
    emoji: '🗞️',
    nombre: 'Bebas',
    detalle: 'angosta y alta — pega con todo',
    familia: '"Bebas Neue", "Roboto Condensed", sans-serif',
    peso: '400',
    archivo: 'bebas.ttf',
  },
  {
    id: 'clasica',
    emoji: '📜',
    nombre: 'Clásica',
    detalle: 'con serifas — estilo vinilo',
    familia: 'Georgia, "Noto Serif", serif',
    peso: '700',
  },
  {
    id: 'cine',
    emoji: '🎬',
    nombre: 'Cine',
    detalle: 'mayúsculas de película épica',
    familia: '"Cinzel", Georgia, serif',
    peso: '700',
    archivo: 'cinzel.ttf',
  },
  {
    id: 'slab',
    emoji: '🧱',
    nombre: 'Slab',
    detalle: 'serifas gordas — estilo cartel viejo',
    familia: '"Alfa Slab One", "Rockwell", serif',
    peso: '400',
    archivo: 'alfaslab.ttf',
  },
  {
    id: 'condensada',
    emoji: '🎒',
    nombre: 'Condensada',
    detalle: 'angosta — entra mucha letra por línea',
    familia: '"Roboto Condensed", "Arial Narrow", sans-serif-condensed',
    peso: '800',
  },
  {
    id: 'festiva',
    emoji: '🦞',
    nombre: 'Festiva',
    detalle: 'redondeada con onda — estilo retro',
    familia: '"Lobster", cursive',
    peso: '400',
    archivo: 'lobster.ttf',
  },
  {
    id: 'olas',
    emoji: '🌴',
    nombre: 'Olas',
    detalle: 'relajada, como firma de verano',
    familia: '"Pacifico", cursive',
    peso: '400',
    archivo: 'pacifico.ttf',
  },
  {
    id: 'apunte',
    emoji: '✏️',
    nombre: 'Apunte',
    detalle: 'escrita a mano, fina y rápida',
    familia: '"Caveat", cursive',
    peso: '600',
    archivo: 'caveat.ttf',
  },
  {
    id: 'marcador',
    emoji: '🖊️',
    nombre: 'Marcador',
    detalle: 'como escrita con marcador',
    familia: '"Patrick Hand", "Segoe Print", cursive',
    peso: '400',
    archivo: 'marcador.ttf',
  },
  {
    id: 'croquis',
    emoji: '📐',
    nombre: 'Croquis',
    detalle: 'letra de arquitecto, prolija y suelta',
    familia: '"Architects Daughter", cursive',
    peso: '400',
    archivo: 'croquis.ttf',
  },
  {
    id: 'comics',
    emoji: '💥',
    nombre: 'Comics',
    detalle: 'de historietica — ¡POW!',
    familia: '"Bangers", "Comic Sans MS", cursive',
    peso: '400',
    archivo: 'bangers.ttf',
  },
  {
    id: 'futuro',
    emoji: '🚀',
    nombre: 'Futuro',
    detalle: 'futurista — estilo sci-fi',
    familia: '"Orbitron", "Roboto Mono", monospace',
    peso: '700',
    archivo: 'orbitron.ttf',
  },
  {
    id: 'maquina',
    emoji: '⌨️',
    nombre: 'Máquina',
    detalle: 'de máquina de escribir',
    familia: '"Roboto Mono", Consolas, monospace',
    peso: '700',
  },
  {
    id: 'manuscrita',
    emoji: '✍️',
    nombre: 'Manuscrita',
    detalle: 'la que tenga tu equipo (del sistema)',
    familia: '"Segoe Print", "Comic Sans MS", cursive',
    peso: '700',
  },
]

export type IdPaletaKaraoke = 'violeta' | 'cian' | 'oro' | 'fuego' | 'esmeralda' | 'blanco'

export interface PaletaKaraoke {
  id: IdPaletaKaraoke
  emoji: string
  nombre: string
  /** color de la palabra que se está cantando */
  color: string
}

export const PALETAS_KARAOKE: PaletaKaraoke[] = [
  { id: 'violeta', emoji: '💜', nombre: 'Violeta', color: '#a855f7' },
  { id: 'cian', emoji: '💙', nombre: 'Cian', color: '#22d3ee' },
  { id: 'oro', emoji: '💛', nombre: 'Oro', color: '#fbbf24' },
  { id: 'fuego', emoji: '❤️', nombre: 'Fuego', color: '#fb7185' },
  { id: 'esmeralda', emoji: '💚', nombre: 'Esmeralda', color: '#34d399' },
  { id: 'blanco', emoji: '🤍', nombre: 'Blanco', color: '#ffffff' },
]

export type IdAnimacionKaraoke = 'suave' | 'pop' | 'fija' | 'deslizar' | 'rebote' | 'neon' | 'maquina'

export interface AnimacionKaraoke {
  id: IdAnimacionKaraoke
  emoji: string
  nombre: string
  detalle: string
}

export const ANIMACIONES_KARAOKE: AnimacionKaraoke[] = [
  { id: 'suave', emoji: '🌊', nombre: 'Suave', detalle: 'cada línea llega flotando de abajo' },
  { id: 'pop', emoji: '🎈', nombre: 'Pop', detalle: 'cada línea salta al entrar y se acomoda' },
  { id: 'fija', emoji: '📌', nombre: 'Fija', detalle: 'sin movimiento — solo se enciende la palabra' },
  { id: 'deslizar', emoji: '↗️', nombre: 'Deslizar', detalle: 'la línea entra deslizándose del costado' },
  { id: 'rebote', emoji: '🏀', nombre: 'Rebote', detalle: 'la línea cae y rebota antes de quedarse' },
  { id: 'neon', emoji: '⚡', nombre: 'Neón', detalle: 'la palabra cantada brilla pulsando' },
  { id: 'maquina', emoji: '⌨️', nombre: 'Máquina', detalle: 'las palabras aparecen justo cuando se cantan' },
]

/** Las decisiones de estilo del video, juntas. */
export interface EstiloKaraoke {
  formato: IdFormatoVideo
  fuente: IdFuenteKaraoke
  paleta: IdPaletaKaraoke
  animacion: IdAnimacionKaraoke
  /** 🎨 v0.23.0 — multiplicador del tamaño de la letra (0.65–1.6). */
  tamanoTexto: number
  /** 🎨 v0.23.0 — esconder las marcas de estructura (Coro, Verso 1…)
   * del video — la letra guardada queda intacta. */
  ocultarMarcas: boolean
}

export function estiloKaraokePorDefecto(): EstiloKaraoke {
  return {
    formato: 'vertical',
    fuente: 'moderna',
    paleta: 'violeta',
    animacion: 'suave',
    tamanoTexto: 1,
    ocultarMarcas: true,
  }
}

export function formatoDe(id: IdFormatoVideo): FormatoVideo {
  return FORMATOS_VIDEO.find((f) => f.id === id) ?? FORMATOS_VIDEO[0]
}

function fuenteDe(id: IdFuenteKaraoke): FuenteKaraoke {
  return FUENTES_KARAOKE.find((f) => f.id === id) ?? FUENTES_KARAOKE[0]
}

function paletaDe(id: IdPaletaKaraoke): PaletaKaraoke {
  return PALETAS_KARAOKE.find((p) => p.id === id) ?? PALETAS_KARAOKE[0]
}

// ── 🎨 v0.23.0 — fuentes incluidas en el APK ───────────────

/** Registra en el navegador las 11 fuentes que VIAJAN en el
 * APK (public/fuentes) para que el canvas las pueda usar — las
 * del sistema no necesitan nada. Se llama una sola vez al abrir
 * el estudio; en equipos sin FontFace (tests, WebViews raros)
 * no hace nada y el canvas cae a los fallbacks de cada pila. */
let promesaFuentes: Promise<void> | null = null
export function cargarFuentesKaraoke(): Promise<void> {
  if (promesaFuentes) return promesaFuentes
  const arrancar = async (): Promise<void> => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return
    // base './' del build (Pages, WebView y dev server andan igual)
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
    await Promise.allSettled(
      FUENTES_KARAOKE.filter((f) => f.archivo).map(async (f) => {
        const nombre = f.familia.split(',')[0].replace(/["']/g, '').trim()
        const ff = new FontFace(nombre, `url(${base}fuentes/${f.archivo})`)
        await ff.load()
        document.fonts.add(ff)
      }),
    )
  }
  promesaFuentes = arrancar().catch(() => undefined)
  return promesaFuentes
}

// ── grabación: qué sabe grabar este navegador ───────────────

/** En orden de preferencia: MP4 primero (WhatsApp y las galerías
 * lo abren directo); WebM como respaldo (Android lo reproduce y
 * las apps grandes lo aceptan). */
const MIMES_PREFERIDOS = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

/** El mejor formato de video que este equipo puede grabar
 * (null = no puede grabar video). */
export function elegirMimeTypeVideo(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const m of MIMES_PREFERIDOS) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* siga con el siguiente */
    }
  }
  return null
}

/** Extensión de archivo según el mime grabado. */
export function extensionVideo(mime: string): '.mp4' | '.webm' {
  return mime.includes('mp4') ? '.mp4' : '.webm'
}

/** ¿Este navegador puede grabar el canvas con audio? (WebViews
 * viejos no: mejor avisarlo antes de que elija las fotos). */
export function soportaGrabacionVideo(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    elegirMimeTypeVideo() !== null
  )
}

/** «Mi canción (A) — karaoke vertical.webm» (misma higiene de
 * nombres que el MP3 y los stems). */
export function nombreVideoKaraoke(
  titulo: string,
  version: string | undefined,
  formato: IdFormatoVideo,
  extension: '.mp4' | '.webm',
): string {
  const t = titulo
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const sufijo = version ? ` (${version})` : ''
  return `${t || 'Mi canción'}${sufijo} — karaoke ${formatoDe(formato).corto}${extension}`
}

// ── texto: envolver y ubicar en el tiempo ───────────────────

/** Envuelve un texto en filas que quepan en `anchoMax` (la
 * medición se inyecta: en la app es ctx.measureText, en los
 * tests una función de mentira). Palabra más ancha que el
 * máximo queda sola (no se parte). */
export function envolverTexto(medir: (s: string) => number, texto: string, maxAncho: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean)
  if (!palabras.length) return []
  const filas: string[] = []
  let fila = ''
  for (const p of palabras) {
    const prueba = fila ? `${fila} ${p}` : p
    if (fila && medir(prueba) > maxAncho) {
      filas.push(fila)
      fila = p
    } else {
      fila = prueba
    }
  }
  if (fila) filas.push(fila)
  return filas
}

/** Índice de la línea que se está cantando en el segundo t (la
 * última que arrancó; -1 = todavía no empezó ninguna). Misma
 * lógica que el panel de letra del reproductor. */
export function indiceLineaActual(lineas: LineaLrc[], t: number): number {
  let idx = -1
  for (let i = 0; i < lineas.length; i++) if (lineas[i].startS <= t) idx = i
  return idx
}

// ── imágenes de fondo (sin ensuciar el canvas) ──────────────

/** Carga una imagen pasándola por fetch → blob → URL local: así
 * el canvas NUNCA queda «tainted» (una foto cross-origin dibujada
 * directo bloquea captureStream y la grabación revienta). Si algo
 * falla, null — el video sigue con el fondo degradé. */
export function cargarImagenSegura(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolver) => {
    if (!url) {
      resolver(null)
      return
    }
    void (async () => {
      try {
        const resp = await fetch(url)
        if (!resp.ok) {
          resolver(null)
          return
        }
        const blob = await resp.blob()
        const urlLocal = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => resolver(img)
        img.onerror = () => {
          URL.revokeObjectURL(urlLocal)
          resolver(null)
        }
        img.src = urlLocal
      } catch {
        resolver(null)
      }
    })()
  })
}

/** Achica una foto de la galería antes de usarla de fondo (las
 * de 12 MP pesan 30 MB en memoria y el video no las necesita):
 * devuelve un JPEG dataURL de lado ≤ ladoMax, o el original si
 * ya es chico. null si no se pudo. */
export function reducirImagenParaVideo(dataUrl: string, ladoMax = 1440): Promise<string | null> {
  return new Promise((resolver) => {
    const img = new Image()
    img.onload = () => {
      try {
        const lado = Math.max(img.width || 1, img.height || 1)
        const escala = Math.min(1, ladoMax / lado)
        if (escala >= 1) {
          resolver(dataUrl)
          return
        }
        const lienzo = document.createElement('canvas')
        lienzo.width = Math.max(1, Math.round((img.width || 1) * escala))
        lienzo.height = Math.max(1, Math.round((img.height || 1) * escala))
        const c = lienzo.getContext('2d')
        if (!c) {
          resolver(null)
          return
        }
        c.drawImage(img, 0, 0, lienzo.width, lienzo.height)
        resolver(lienzo.toDataURL('image/jpeg', 0.82))
      } catch {
        resolver(null)
      }
    }
    img.onerror = () => resolver(null)
    img.src = dataUrl
  })
}

// ── el cuadro ───────────────────────────────────────────────

/** Todo lo que hace falta para dibujar un instante del video. */
export interface EstadoCuadro {
  ancho: number
  alto: number
  /** segundo actual de la canción */
  t: number
  /** duración total en segundos */
  duracion: number
  /** letra con tiempos (los del reproductor) */
  lineas: LineaLrc[]
  estilo: EstiloKaraoke
  /** fotos de fondo ya cargadas ([] = portada o degradé) */
  imagenes: HTMLImageElement[]
  titulo: string
  subtitulo?: string
  /** calibración de sincronía que el usuario ajustó en el
   * reproductor (segundos) — el video queda igual de afinado */
  calibracion?: number
}

/** curva de frenado suave (0→1) */
function relajado(x: number): number {
  return 1 - (1 - x) * (1 - x) * (1 - x)
}

/** Dibuja el cuadro completo del karaoke para el segundo t:
 * fondo (fotos rotando con zoom lento + velo oscuro) → tarjeta
 * del título (arranque) → letra con la palabra encendida →
 * barra de progreso. */
export function dibujarCuadro(ctx: CanvasRenderingContext2D, e: EstadoCuadro): void {
  dibujarFondo(ctx, e)
  dibujarTitulo(ctx, e)
  dibujarLetra(ctx, e)
  dibujarProgreso(ctx, e)
  // higiene: el próximo cuadro arranca limpio
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
}

/** fondo tipo «object-fit: cover» con un zoom lento (Ken Burns). */
function dibujarPortada(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number, escala: number): void {
  const iw = img.width || 1
  const ih = img.height || 1
  const r = Math.max(W / iw, H / ih) * escala
  const dw = iw * r
  const dh = ih * r
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

function dibujarFondo(ctx: CanvasRenderingContext2D, e: EstadoCuadro): void {
  const { ancho: W, alto: H, imagenes, t, duracion } = e
  if (imagenes.length) {
    // cada foto tiene su tramo parejo de la canción
    const tramo = Math.max(1, duracion / imagenes.length)
    const i = Math.min(imagenes.length - 1, Math.floor(t / tramo))
    const local = Math.min(1, Math.max(0, (t - i * tramo) / tramo))
    dibujarPortada(ctx, imagenes[i], W, H, 1.06 + 0.08 * local)
    // fundido con la siguiente en el final del tramo (1,4 s)
    const FADE = 1.4
    const restante = (i + 1) * tramo - t
    if (i < imagenes.length - 1 && tramo > FADE && restante < FADE) {
      ctx.globalAlpha = 1 - Math.min(1, Math.max(0, restante / FADE))
      dibujarPortada(ctx, imagenes[i + 1], W, H, 1.06)
      ctx.globalAlpha = 1
    }
  } else {
    // sin fotos: degradé oscuro con un murmullo del acento
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#0b0b12')
    g.addColorStop(1, '#150f22')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  // velo oscuro: la letra se lee siempre, aun sobre fotos claras
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, 0, W, H)
}

/** tarjeta de arranque: título + estilo, los primeros 4 s. */
function dibujarTitulo(ctx: CanvasRenderingContext2D, e: EstadoCuadro): void {
  const DURACION = 4
  if (e.t >= DURACION || !e.titulo) return
  const { ancho: W, alto: H } = e
  const alfa = e.t < 3 ? 1 : 1 - (e.t - 3) / (DURACION - 3)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alfa))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = W * 0.03
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${Math.round(W * 0.062)}px ${fuenteDe(e.estilo.fuente).familia}`
  const filas = envolverTexto((s) => ctx.measureText(s).width, e.titulo, W * 0.8)
  const altoFila = Math.round(W * 0.082)
  const y0 = H * 0.42 - ((filas.length - 1) * altoFila) / 2
  filas.forEach((f, i) => ctx.fillText(f, W / 2, y0 + i * altoFila))
  if (e.subtitulo) {
    ctx.font = `500 ${Math.round(W * 0.03)}px system-ui, Roboto, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.shadowBlur = W * 0.02
    ctx.fillText(e.subtitulo, W / 2, y0 + (filas.length - 1) * altoFila + altoFila * 1.1)
  }
  ctx.restore()
}

/** Una palabra de la línea, lista para dibujar (con su posición
 * ORIGINAL en la línea: las repetidas — «no no no» — se encienden
 * cada una cuando le toca). */
interface PalabraDibujar {
  texto: string
  startS: number
  ancho: number
  /** índice en linea.palabras (-1 = línea sin tiempos por palabra) */
  i: number
}

interface FilaPalabras {
  palabras: PalabraDibujar[]
  ancho: number
}

/** Parte la línea en filas que quepan en maxAncho, palabra por
 * palabra (para no cortar una palabra a la mitad y poder encender
 * cada una cuando le toca). */
function envolverPalabras(ctx: CanvasRenderingContext2D, linea: LineaLrc, maxAncho: number): FilaPalabras[] {
  const espacio = ctx.measureText(' ').width || 1
  const base: PalabraDibujar[] = (
    linea.palabras?.length
      ? linea.palabras.map((p, i) => ({ texto: p.texto, startS: p.startS, i }))
      : [{ texto: linea.texto, startS: linea.startS, i: -1 }]
  ).map((p) => ({ ...p, ancho: ctx.measureText(p.texto).width }))
  const filas: FilaPalabras[] = []
  let fila: FilaPalabras = { palabras: [], ancho: 0 }
  for (const p of base) {
    const extra = fila.palabras.length ? espacio + p.ancho : p.ancho
    if (fila.palabras.length && fila.ancho + extra > maxAncho) {
      filas.push(fila)
      fila = { palabras: [p], ancho: p.ancho }
    } else {
      fila.palabras.push(p)
      fila.ancho += extra
    }
  }
  if (fila.palabras.length) filas.push(fila)
  return filas
}

/** La letra: la línea actual grande con la palabra que se canta
 * ENCENDIDA (color elegido + brillo), la que viene en chiquita
 * abajo y la anterior más tenue arriba. */
function dibujarLetra(ctx: CanvasRenderingContext2D, e: EstadoCuadro): void {
  const { ancho: W, alto: H, lineas, estilo } = e
  if (!lineas.length) return
  const tc = e.t + (e.calibracion ?? 0)
  const idx = indiceLineaActual(lineas, tc)
  if (idx < 0) return
  const actual = lineas[idx]
  const pal = paletaDe(estilo.paleta)
  const fu = fuenteDe(estilo.fuente)
  const fmt = formatoDe(estilo.formato)
  // 🎨 v0.23.0 — el TAMAÑO ahora lo elige el usuario (0.65–1.6)
  const multiplicador = estilo.tamanoTexto > 0 ? estilo.tamanoTexto : 1
  const tam = Math.round(W * fmt.escalaTexto * multiplicador)
  const paso = Math.round(tam * 1.16)
  const yCentro = H * 0.62
  const maxAncho = W * 0.86

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${fu.peso} ${tam}px ${fu.familia}`
  const filas = envolverPalabras(ctx, actual, maxAncho)
  const altoBloque = (filas.length - 1) * paso
  const yPrimera = yCentro - altoBloque / 2

  // animación de entrada de la línea actual
  const desde = Math.max(0, tc - (actual.palabras?.[0]?.startS ?? actual.startS))
  let despl = 0
  let desplX = 0
  let escala = 1
  if (estilo.animacion === 'suave') {
    despl = (1 - relajado(Math.min(1, desde / 0.45))) * (H * 0.045)
  } else if (estilo.animacion === 'pop') {
    escala = 1 + 0.14 * (1 - relajado(Math.min(1, desde / 0.4)))
  } else if (estilo.animacion === 'deslizar') {
    // 🎨 v0.23.0 — entra deslizándose del costado derecho
    desplX = (1 - relajado(Math.min(1, desde / 0.5))) * (W * 0.22)
  } else if (estilo.animacion === 'rebote') {
    // 🎨 v0.23.0 — cae y rebota (oscilación amortiguada)
    const x = Math.min(1, desde / 0.6)
    despl = (1 - relajado(x)) * (H * 0.05) + Math.sin(x * Math.PI * 3) * Math.exp(-3 * x) * (H * 0.03)
  }
  ctx.translate(W / 2 + desplX, despl)
  if (escala !== 1) {
    // el salto crece desde el centro de la línea, no del borde
    ctx.translate(0, yPrimera + altoBloque / 2)
    ctx.scale(escala, escala)
    ctx.translate(0, -(yPrimera + altoBloque / 2))
  }

  // contorno suave para que la letra se lea sobre cualquier foto
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = tam * 0.2
  // la que ya pasó (arriba, tenue)
  if (lineas[idx - 1]) {
    ctx.font = `${fu.peso} ${Math.round(tam * 0.5)}px ${fu.familia}`
    ctx.fillStyle = 'rgba(255,255,255,0.30)'
    ctx.fillText(lineas[idx - 1].texto, 0, yPrimera - tam * 1.45)
  }
  // la que viene (abajo, modo aviso)
  if (lineas[idx + 1]) {
    ctx.font = `${fu.peso} ${Math.round(tam * 0.5)}px ${fu.familia}`
    ctx.fillStyle = 'rgba(255,255,255,0.42)'
    ctx.fillText(lineas[idx + 1].texto, 0, yPrimera + altoBloque + tam * 1.45)
  }

  // 🎨 v0.23.0 — «Máquina»: las palabras que todavía no se cantan
  // NO se dibujan (aparecen justo cuando les toca, como escritas
  // al vuelo). Las líneas sin tiempo por palabra se muestran
  // enteras (no hay con qué adivinar el corte).
  const ocultarFuturas = estilo.animacion === 'maquina'

  // la línea actual, palabra por palabra: cantadas en blanco, la
  // que SUENA en el color elegido con brillo, las próximas opacas
  ctx.font = `${fu.peso} ${tam}px ${fu.familia}`
  const espacio = ctx.measureText(' ').width || 1
  let idxViva = -1
  actual.palabras?.forEach((p, i) => {
    if (p.startS <= tc) idxViva = i
  })
  filas.forEach((fila, f) => {
    const y = yPrimera + f * paso
    let x = -fila.ancho / 2
    for (const p of fila.palabras) {
      if (ocultarFuturas && p.i > idxViva) continue
      if (p.i === idxViva) {
        // la que se está cantando: color elegido + brillo
        ctx.fillStyle = pal.color
        ctx.shadowColor = pal.color
        // 🎨 v0.23.0 — «Neón»: el brillo pulsa con la música
        ctx.shadowBlur =
          estilo.animacion === 'neon'
            ? tam * (0.3 + 0.16 * (0.5 + 0.5 * Math.sin(tc * 7)))
            : tam * 0.32
      } else {
        ctx.fillStyle = p.i >= 0 && p.i < idxViva ? '#ffffff' : 'rgba(255,255,255,0.42)'
        ctx.shadowColor = 'rgba(0,0,0,0.55)'
        ctx.shadowBlur = tam * 0.16
      }
      ctx.fillText(p.texto, x + p.ancho / 2, y)
      x += p.ancho + espacio
    }
  })
  ctx.restore()
}

/** barra de progreso abajo (cuánto falta de la canción). */
function dibujarProgreso(ctx: CanvasRenderingContext2D, e: EstadoCuadro): void {
  const { ancho: W, alto: H, t, duracion, estilo } = e
  if (!duracion || duracion <= 0) return
  const altoBarra = Math.max(4, Math.round(H * 0.006))
  const y = H - altoBarra * 2.2
  const x0 = W * 0.06
  const anchoTotal = W * 0.88
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.fillRect(x0, y, anchoTotal, altoBarra)
  ctx.fillStyle = paletaDe(estilo.paleta).color
  ctx.fillRect(x0, y, anchoTotal * Math.min(1, Math.max(0, t / duracion)), altoBarra)
}
