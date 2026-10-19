import { useEffect, useRef, useState } from 'react'
import {
  Disc3,
  Download,
  FastForward,
  HardDriveDownload,
  Heart,
  Link2,
  ListMusic,
  ListPlus,
  Loader2,
  Music2,
  Pause,
  PenLine,
  Play,
  RefreshCw,
  Rocket,
  Search,
  Share2,
  Skull,
  Trash2,
} from 'lucide-react'
import { leerAjustes, leer } from '@/core/storage/almacenamiento'
import { leerAudio, borrarAudio } from '@/core/storage/audio'
import { agregarCanciones, actualizarCancion, borrarCancion, EVENTO_CANCIONES, guardarCanciones, leerCanciones } from '@/core/storage/canciones'
import { alternarEnLista, borrarLista, crearLista, EVENTO_LISTAS, leerListas, type ListaReproduccion } from '@/core/storage/listas'
import { necesitaRespaldo, respaldarCancion, respaldarPendientes } from '@/core/storage/respaldo'
import { useReproductor } from '@/core/audio/reproductor'
import { guardarMp3EnDescargas, guardarTextoEnDescargas, nombreMp3, nombreLrc, type ResultadoDescarga } from '@/core/natives/descargas'
import {
  consultarLetraConTiempos,
  consultarPistas,
  creditosRestantes,
  extenderMusica,
  pedirLetraSincronizada,
  type MotorSuno,
} from '@/core/ai/suno'
import { aplicarGrupo } from '@/core/ai/seguimiento'
import { pedirPermisoNotificaciones, programarRecordatorio } from '@/core/notificaciones/notificaciones'
import { armarLrc, estimarLineasConTiempo, incrustarEtiquetasMp3, lineasConTiempo, quitarId3, type LineaLrc } from '@/core/audio/mp3'
import { Boton } from '@/components/ui/Boton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { compartir, vibrar, abrirURL, copiarTexto } from '@/core/natives/plataforma'
import {
  GENEROS_MUSICALES,
  GRUPOS_TAGS_ESTILO,
  modeloSunoBonito,
  type Cancion,
  type Letra,
  type PestannaId,
} from '@/types'

// ═══════════════════════════════════════════════════════════
// 📚 BIBLIOTECA (v0.9.0) — la casa de TODAS las canciones. El
// usuario lo pidió así: crear queda en 🎧 Música y lo hecho se
// acumula acá, ordenadito: reproductor, ⏩ Extender, letra a la
// vista, compartir, eliminar… y la descarga MP3 CON LETRA:
//   • la letra va INCRIPTADA dentro del MP3 (tag ID3 USLT —
//     la leen los reproductores al reproducir)
//   • al lado baja un archivito .lrc con los tiempos de cada
//     línea (los reproductores tipo Musicolet/Poweramp lo usan
//     para pintar la letra que avanza con la música, como
//     Spotify). Los tiempos salen de la letra sincronizada de
//     Suno; si la API no la trae, se estiman.
// ═══════════════════════════════════════════════════════════

/** Minutos a partir de los cuales damos una tarea por MUERTA (v0.6.4):
 * la cola del intermediario en el peor caso llega a ~60 min; pasada
 * la hora y media, la tarea se cayó y lo honesto es decirlo en la
 * tarjeta — no dejarla pulsando «en cola» por 8 horas. */
const MIN_TAREA_MUERTA = 90

function formatoDuracion(seg?: number): string {
  if (!seg || seg <= 0) return ''
  const m = Math.floor(seg / 60)
  const s = Math.round(seg % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Etapa REAL que reporta sunoapi.org para una canción en curso
 * (v0.4.5). paso: 1 = enviada ✓ · 2 = en cola · 3 = componiendo. */
function etapaDe(c: Cancion): { texto: string; paso: 1 | 2 | 3 } {
  if (c.estado === 'lista') return { texto: '¡Lista!', paso: 3 }
  const crudo = (c.estadoCrudo ?? 'PENDING').toUpperCase()
  if (crudo.includes('FIRST_SUCCESS')) return { texto: 'Primera versión lista — cocinando la segunda', paso: 3 }
  if (crudo === 'PENDING') return { texto: 'En cola en Suno (esperando turno)', paso: 2 }
  return { texto: 'Suno está componiendo 🎙️', paso: 3 } // TEXT_SUCCESS / STREAMING / etc.
}

/** Minutos (entero) desde que se envió el pedido a Suno. */
function edadMin(fecha: number): number {
  return Math.floor((Date.now() - fecha) / 60000)
}

/** Edad bonita: bajo 90 min «45 min»; después «8 h 20 min». */
function minutosDesde(fecha: number): string {
  const min = edadMin(fecha)
  if (min < 1) return 'menos de 1 min'
  if (min < 90) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto ? `${h} h ${resto} min` : `${h} h`
}

/** Consejo honesto según la edad de la espera. */
function hintEdad(fecha: number): string {
  const min = Math.floor((Date.now() - fecha) / 60000)
  if (min <= 3) return ''
  if (min <= 9) return ' — en horas pico la cola se demora'
  return ' — si falla, Suno devuelve los créditos solos'
}

// ═══════════════════════════════════════════════════════════
// 📁 v0.9.1 — CARPETAS POR ESTILO (pedido del usuario): «que se
// ordenen, todo lo que es power metal en una carpetita… y de ahí
// otra carpeta por ejemplo salsa». El género de cada canción sale
// de su estilo: el primer tag que sea un género conocido; si no
// hay ninguno, el primer tag; sin estilo → «Sin estilo».
// ═══════════════════════════════════════════════════════════
const GENEROS_PARA_CARPETA = new Set(
  [...GRUPOS_TAGS_ESTILO.flatMap((g) => g.tags), ...GENEROS_MUSICALES].map((t) => t.toLowerCase()),
)

/** La carpeta de una canción según su estilo. */
function carpetaDe(c: Cancion): string {
  const partes = c.estilo
    .toLowerCase()
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  for (const p of partes) {
    if (GENEROS_PARA_CARPETA.has(p)) return p
    // sin acentos: «reggaetón» escrito «reggaeton» también matchea
    const sinAcentos = p.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (GENEROS_PARA_CARPETA.has(sinAcentos)) return sinAcentos
  }
  return partes[0] ?? 'sin estilo'
}

/** «power metal» → «Power Metal» (para el título de la carpeta). */
function carpetaBonita(nombre: string): string {
  if (nombre === 'sin estilo') return 'Sin estilo'
  return nombre.replace(/(^|[\s\-·])([a-záéíóúñ])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}

/** v0.8.0 — la parte de la letra que QUEDÓ SIN CANTARSE sabiendo
 * cuántas palabras se cantaron: recorre línea por línea (las marcas
 * [Coro] no cuentan) y junta desde la primera línea incompleta
 * hasta el final — mejor re-cantar una línea entera que dejarla
 * cortada a la mitad. */
function restanteDeLetra(texto: string, palabrasCantadas: number): string {
  if (!texto.trim() || palabrasCantadas <= 0) return ''
  let cantadas = 0
  let modoRestante = false
  const restantes: string[] = []
  for (const linea of texto.split('\n')) {
    const esMarca = /^\s*\[[^\]]*\]\s*$/.test(linea)
    if (esMarca) {
      if (modoRestante) restantes.push(linea)
      continue
    }
    const palabras = linea.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length
    if (palabras === 0) {
      if (modoRestante) restantes.push(linea)
      continue
    }
    if (!modoRestante && cantadas + palabras <= palabrasCantadas) {
      cantadas += palabras // línea cantada entera
      continue
    }
    modoRestante = true
    restantes.push(linea)
  }
  return restantes.join('\n').trim()
}

/** v0.8.0 — RESPALDO sin letra sincronizada: las últimas estrofas
 * de la letra (el usuario dijo que lo que se corta es el final). */
function colaDeLetra(texto: string): string {
  const bloques = texto
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  if (!bloques.length) return ''
  const cuantas = Math.max(1, Math.ceil(bloques.length * 0.25))
  return bloques.slice(-cuantas).join('\n\n')
}

/** 🎧 v0.10.0 — el audio ya NO vive en cada tarjeta: el
 * reproductor ÚNICO global (mini-barra fija abajo + pantalla de
 * bloqueo) lo resuelve todo — CDN de Suno o copia local 💾. */

const claseInput =
  'h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors focus:border-acento dark:border-neutral-700'

export function BibliotecaView({ irA }: { irA: (p: PestannaId) => void }) {
  const { mostrar } = useToast()
  const ajustes = leerAjustes()
  const letras = leer<Letra[]>('letras', [])

  const [canciones, setCanciones] = useState<Cancion[]>(() => leerCanciones())
  const [busqueda, setBusqueda] = useState('')
  // ✏️ v0.9.1 — EDITAR EL TÍTULO (pedido del usuario: «cuando ya
  // la canción esté terminada puede editar el título»): al
  // confirmar, actualizarCancion avisa a toda la app sola.
  const [renombrando, setRenombrando] = useState<{ id: string; valor: string } | null>(null)

  // 🎧 v0.10.0 — el reproductor ÚNICO global (mini-barra abajo)
  const reproductor = useReproductor()

  // ❤️🚫 v0.10.0 — favoritas y listas del usuario («Anime», «Gym»…)
  const [listas, setListas] = useState<ListaReproduccion[]>(() => leerListas())
  const [modalListas, setModalListas] = useState<Cancion | null>(null)
  const [nuevaLista, setNuevaLista] = useState('')
  const [creandoLista, setCreandoLista] = useState<string | null>(null)

  // 💾 v0.10.0 — respaldo local de los MP3 de Suno
  const [respaldando, setRespaldando] = useState(false)

  // 🔎 filtro por título o estilo
  const q = busqueda.trim().toLowerCase()
  const visibles = q ? canciones.filter((c) => `${c.titulo} ${c.estilo}`.toLowerCase().includes(q)) : canciones

  // 📁 v0.9.1 — el agrupamiento de la biblioteca: las «en curso»
  // van sueltas arriba (son transitorias) y las terminadas en
  // CARPETAS por estilo, ordenadas por su canción más reciente.
  const enCurso = visibles.filter((c) => c.estado !== 'lista')
  const carpetasOrdenadas = (() => {
    const m = new Map<string, Cancion[]>()
    for (const c of visibles) {
      if (c.estado !== 'lista') continue
      const clave = carpetaDe(c)
      m.set(clave, [...(m.get(clave) ?? []), c])
    }
    return [...m.entries()].sort(
      (a, b) => Math.max(...b[1].map((x) => x.fecha)) - Math.max(...a[1].map((x) => x.fecha)),
    )
  })()

  // ❤️ v0.10.0 — FAVORITAS: el corazón de cada tarjeta las junta acá
  const favoritasVisibles = visibles.filter((c) => c.estado === 'lista' && c.favorita)

  // 🎵 v0.10.0 — las canciones de una lista (vivas y que matcheen
  // el buscador si hay una búsqueda activa)
  function cancionesDeLista(l: ListaReproduccion): Cancion[] {
    const porId = new Map(visibles.map((c) => [c.id, c]))
    return l.ids.map((id) => porId.get(id)).filter((c): c is Cancion => !!c)
  }

  // ⏱️ Reloj independiente (v0.4.5): re-render cada 10 s para que los
  // minutos y el semáforo de conexión sigan vivos aunque el polling
  // falle en silencio (internet lento) — sin esto el contador se congela.
  const [, setTic] = useState(0)
  useEffect(() => {
    const i = window.setInterval(() => setTic((t) => t + 1), 10000)
    return () => window.clearInterval(i)
  }, [])

  // 🟢 Marca de la última respuesta exitosa de Suno (semáforo).
  const [ultimoContacto, setUltimoContacto] = useState<number | null>(() => Date.now())

  // 👁️ El polling vive a nivel app (seguimiento.ts): nos enteramos
  // por EVENTO_CANCIONES. Acá refrescamos tarjetas, avisamos con
  // toast/vibración y alimentamos el semáforo de conexión.
  const previasRef = useRef<Cancion[]>(canciones)
  useEffect(() => {
    function alActualizar(e: Event) {
      const nuevas = (e as CustomEvent<Cancion[]>).detail
      const previas = previasRef.current
      nuevas
        .filter((n) => n.estado === 'lista' && previas.find((p) => p.id === n.id)?.estado === 'generando')
        .forEach((n) => {
          vibrar()
          mostrar(`¡«${n.titulo}»${n.version ? ` (versión ${n.version})` : ''} lista! 🎧`, 'ok')
        })
      nuevas
        .filter((n) => n.estado === 'error' && previas.find((p) => p.id === n.id)?.estado === 'generando')
        .forEach((n) => mostrar(`«${n.titulo}» falló — Suno devuelve los créditos`, 'info', 4500))
      previasRef.current = nuevas
      setCanciones(nuevas)
      setUltimoContacto(Date.now())
    }
    window.addEventListener(EVENTO_CANCIONES, alActualizar)
    return () => window.removeEventListener(EVENTO_CANCIONES, alActualizar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🎵 las listas también avisan cuando cambian
  useEffect(() => {
    function alCambiarListas() {
      setListas(leerListas())
    }
    window.addEventListener(EVENTO_LISTAS, alCambiarListas)
    return () => window.removeEventListener(EVENTO_LISTAS, alCambiarListas)
  }, [])

  // 💾 v0.10.0 — RESPALDO AUTOMÁTICO al entrar a la Biblioteca:
  // las canciones que todavía no tienen copia local se bajan del
  // CDN una por una, en silencio. Si no hay nada pendiente, no
  // hace nada (y el botón 💾 de arriba deja reintentarlo a mano).
  const autoRespaldoHecho = useRef(false)
  useEffect(() => {
    if (autoRespaldoHecho.current) return
    autoRespaldoHecho.current = true
    void (async () => {
      const r = await respaldarPendientes()
      if (r.ok > 0) {
        mostrar(
          `💾 Respaldo local: ${r.ok} ${r.ok === 1 ? 'canción copiada' : 'canciones copiadas'} a tu dispositivo — ya no dependen del enlace de Suno`,
          'ok',
          6000,
        )
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function actualizarCreditos() {
    if (!ajustes.tokenSuno) return
    try {
      await creditosRestantes({ url: ajustes.urlSuno, token: ajustes.tokenSuno })
    } catch {
      /* informativo */
    }
  }

  /** La letra de una canción: la que viajó con la tarjeta o, si no,
   * la de la biblioteca de letras con la que se creó. */
  function letraDe(c: Cancion): string {
    return c.letraTexto ?? letras.find((l) => l.id === c.letraId)?.texto ?? ''
  }

  /** Consulta inmediata de una tarea, sin esperar al ciclo de 6 s.
   * Aplica todas las versiones que haya listas (A, B…) al toque. */
  const [revisandoId, setRevisandoId] = useState<string | null>(null)
  async function revisarAhora(c: Cancion) {
    if (!ajustes.tokenSuno || revisandoId || !c.taskId) return
    setRevisandoId(c.id)
    try {
      const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
      const pistas = await consultarPistas(motor, c.taskId, c.titulo)
      setUltimoContacto(Date.now())
      // guarda + dispara el evento → la propia vista se refresca y
      // los toasts de «¡lista!» salen del listener (una sola vez)
      const despues = aplicarGrupo(leerCanciones(), c.taskId, pistas)
      guardarCanciones(despues)
      // 💾 v0.10.0 — apenas quedan listas, copia del CDN al dispositivo
      despues.filter((x) => x.taskId === c.taskId).forEach((x) => void respaldarCancion(x))
      if (pistas.some((p) => p.estado === 'lista') || pistas.some((p) => p.estado === 'error')) {
        vibrar()
        void actualizarCreditos()
      } else {
        // v0.6.4: si la tarea ya tiene edad de muerta, no le vendemos
        // ilusión al usuario aunque la API siga diciendo «PENDING».
        const muerta = edadMin(c.fecha) >= MIN_TAREA_MUERTA
        mostrar(
          muerta
            ? 'La API dice «en cola», pero a esta altura la tarea está muerta — los 12 créditos deberían haber vuelto solos'
            : `Sigue en camino: ${etapaDe({ ...c, estadoCrudo: pistas[0]?.estadoCrudo }).texto.toLowerCase()} ⏳`,
          'info',
          5000,
        )
      }
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'No se pudo consultar ahora', 'error', 4000)
    } finally {
      setRevisandoId(null)
    }
  }

  function borrar(id: string) {
    vibrar('media')
    const cancion = canciones.find((c) => c.id === id)
    if (cancion?.audioLocal || cancion?.respaldada) void borrarAudio(id)
    borrarCancion(id)
    mostrar('Canción eliminada de la biblioteca', 'info')
  }

  async function compartirCancion(c: Cancion) {
    const motorTxt = c.motor === 'lyria' ? 'Lyria de Google' : 'Suno'
    const ok = await compartir({
      titulo: c.titulo,
      texto: `🎵 «${c.titulo}» — hecha con MusicTrack (letra: Claude · música: ${motorTxt})`,
      url: c.motor === 'lyria' ? undefined : c.urlAudio,
    })
    if (!ok) mostrar('Compartir no disponible en esta plataforma', 'info')
  }

  /** 🚀 Válvula de escape (v0.6.1): si la cola de sunoapi.org está
   * muerta, la misma letra se puede musicalizar YA en suno.com con
   * la cuenta Google (50 créditos/día, cola oficial). */
  async function hacerlaYaEnSuno(c: Cancion) {
    const letraTxt = letraDe(c)
    vibrar()
    const copiado = letraTxt ? await copiarTexto(letraTxt) : false
    await abrirURL('https://suno.com/create')
    mostrar(
      copiado
        ? `Letra de «${c.titulo}» copiada ✔ — en Suno usá Custom Mode y el estilo: ${c.estilo}`
        : 'Abrí Custom Mode en Suno y pegá tu letra',
      'info',
      6500,
    )
  }

  /** v0.9.0 — recupera el audioId de una canción vieja (pre-v0.8.0)
   * consultando la tarea y matcheando la versión por su URL. */
  async function recuperarAudioId(c: Cancion): Promise<string | undefined> {
    if (!c.taskId || !ajustes.tokenSuno) return undefined
    const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
    const pistas = await consultarPistas(motor, c.taskId, c.titulo)
    const pista = pistas.find((p) => p.urlAudio && p.urlAudio === c.urlAudio) ?? pistas.find((p) => p.audioId)
    return pista?.audioId
  }

  // ═══════════════════════════════════════════════════════════
  // 💾 DESCARGA CON LETRA (v0.9.0) — el corazón de «que mi
  // reproductor siga la letra como Spotify»: el MP3 sale con la
  // letra incrustada (ID3 USLT) + título/artista/álbum/género/
  // portada, y al lado un .lrc con los tiempos por línea.
  // ═══════════════════════════════════════════════════════════
  interface ResultadoGuardado {
    res: ResultadoDescarga
    conLrc: boolean
    sincronizada: boolean
  }

  async function guardarAudioConLetra(
    c: Cancion,
    blob: Blob,
    opciones?: { tituloFinal?: string; letraFinal?: string; duracionFinal?: number; soloEstimado?: boolean },
  ): Promise<ResultadoGuardado> {
    const carpeta = ajustes.carpetaDescargas
    const tituloFinal = opciones?.tituloFinal ?? c.titulo
    const letra = opciones?.letraFinal ?? (c.instrumental ? '' : letraDe(c))
    const dur = opciones?.duracionFinal ?? c.duracionSeg

    // 1) líneas con TIEMPOS REALES de Suno (si la API los trae)
    let lineas: LineaLrc[] = []
    let sincronizada = false
    if (letra.trim()) {
      if (!opciones?.soloEstimado && c.motor !== 'lyria' && c.taskId && ajustes.tokenSuno) {
        try {
          let audioId = c.audioId
          if (!audioId) {
            audioId = await recuperarAudioId(c)
            if (audioId) actualizarCancion(c.id, { audioId })
          }
          if (audioId) {
            const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
            const palabras = await pedirLetraSincronizada(motor, c.taskId, audioId)
            if (palabras) {
              lineas = lineasConTiempo(letra, palabras)
              sincronizada = lineas.length > 0
            }
          }
        } catch {
          /* la letra sincronizada es un plus — seguimos con la estimada */
        }
      }
      // 2) respaldo: repartir la letra a lo largo de la duración
      if (!lineas.length) lineas = estimarLineasConTiempo(letra, dur)
    }

    // 3) portada (best effort — si el CDN no deja, el MP3 sigue)
    let portada: Blob | undefined
    if (c.urlPortada) {
      try {
        const r = await fetch(c.urlPortada)
        if (r.ok) portada = await r.blob()
      } catch {
        /* sin portada */
      }
    }

    // 4) MP3 con TODO adentro + guardado en la carpeta de siempre
    const mp3 = await incrustarEtiquetasMp3(blob, {
      titulo: tituloFinal,
      artista: 'MusicTrack',
      album: carpeta || 'MusicTrack',
      genero: c.estilo,
      letra: letra.trim() ? letra : undefined,
      portada,
    })
    const res = await guardarMp3EnDescargas(mp3, nombreMp3(tituloFinal, c.version), carpeta)
    if (!res.ok) throw new Error(res.error)

    // 5) el .lrc al lado del MP3 (mismo nombre — los reproductores
    //    los emparejan solos)
    if (lineas.length) {
      const lrc = armarLrc(lineas, { titulo: tituloFinal, artista: 'MusicTrack', duracionSeg: dur })
      await guardarTextoEnDescargas(lrc, nombreLrc(tituloFinal, c.version), carpeta)
    }
    return { res, conLrc: lineas.length > 0, sincronizada }
  }

  const [bajandoId, setBajandoId] = useState<string | null>(null)
  async function descargarMp3(c: Cancion) {
    if (bajandoId || (!c.urlAudio && !c.audioLocal)) return
    setBajandoId(c.id)
    try {
      let blob: Blob | null = null
      // v0.10.0 — primero la copia LOCAL (respaldada 💾 o Lyria):
      // más rápida y funciona aunque el CDN ya haya caducado
      if (c.audioLocal || c.respaldada) {
        const dataUrl = await leerAudio(c.id)
        if (dataUrl) blob = await (await fetch(dataUrl)).blob()
      }
      if (!blob && c.urlAudio) {
        const resp = await fetch(c.urlAudio)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        blob = await resp.blob()
      }
      if (!blob) throw new Error('sin audio')
      const { res, conLrc, sincronizada } = await guardarAudioConLetra(c, blob)
      vibrar()
      mostrar(
        conLrc
          ? `MP3 ${sincronizada ? 'con letra sincronizada' : 'con letra (tiempos estimados)'} guardado en ${res.ruta} 💾 — tu reproductor puede seguir la letra 🎼`
          : `MP3 guardado en ${res.ruta} 💾`,
        'ok',
        6500,
      )
    } catch {
      if (c.urlAudio) {
        await abrirURL(c.urlAudio)
        mostrar('No pude bajarla directo — la abrí para que la guardes', 'info', 4500)
      } else {
        mostrar('No encontré el audio de esa canción', 'error')
      }
    } finally {
      setBajandoId(null)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ⏩ v0.8.0 — EXTENDER UNA CANCIÓN YA HECHA (el arreglo para las
  // que se cortaron antes de terminar la letra): Suno continúa la
  // pista desde el segundo elegido cantando lo que falte, en el
  // mismo estilo. Al abrir el modal se intenta detectar el corte
  // exacto con la letra sincronizada de la API.
  // ═══════════════════════════════════════════════════════════
  const [extModal, setExtModal] = useState<Cancion | null>(null)
  const [extAudioId, setExtAudioId] = useState('')
  const [extResolviendo, setExtResolviendo] = useState(false)
  const [extDetectado, setExtDetectado] = useState('')
  const [extContinueAt, setExtContinueAt] = useState(0)
  const [extLetra, setExtLetra] = useState('')
  const [extEstilo, setExtEstilo] = useState('')
  const [extTitulo, setExtTitulo] = useState('')
  const [extEnviando, setExtEnviando] = useState(false)
  const extLetraTocada = useRef(false)

  async function abrirExtender(c: Cancion) {
    if (!ajustes.tokenSuno || c.motor === 'lyria') return
    vibrar()
    extLetraTocada.current = false
    setExtModal(c)
    setExtDetectado('')
    setExtAudioId(c.audioId ?? '')
    setExtEstilo(c.estilo)
    setExtTitulo(`${c.titulo} — continuación`)
    const dur = c.duracionSeg ?? 240
    // pre-relleno de respaldo (mientras/o por si la API no ayuda):
    // las últimas estrofas — lo que se corta siempre es el final
    setExtContinueAt(Math.max(5, Math.floor(dur - 10)))
    setExtLetra(c.instrumental ? '' : colaDeLetra(letraDe(c)))
    if (!c.taskId) return
    const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
    setExtResolviendo(true)
    try {
      let audioId = c.audioId
      if (!audioId) {
        // canción vieja (pre-v0.8.0): el audioId se recupera de
        // record-info, matcheando la versión por su URL de audio
        audioId = await recuperarAudioId(c)
        if (audioId) actualizarCancion(c.id, { audioId })
      }
      if (audioId) {
        setExtAudioId(audioId)
        const tiempos = await consultarLetraConTiempos(motor, c.taskId, audioId)
        if (tiempos) {
          if (tiempos.finUltimoCanto) {
            setExtContinueAt(Math.floor(Math.min(Math.max(tiempos.finUltimoCanto - 2, 5), Math.max(5, dur - 3))))
          }
          if (!extLetraTocada.current && !c.instrumental) {
            const restante = restanteDeLetra(letraDe(c), tiempos.palabrasCantadas)
            if (restante) setExtLetra(restante)
          }
          setExtDetectado(
            tiempos.finUltimoCanto
              ? `✔ detecté el corte: el canto termina en ${formatoDuracion(tiempos.finUltimoCanto)} de ${formatoDuracion(dur)} — te cargué la letra que faltó (revisala igual)`
              : '✔ Suno cantó toda la letra de esta pista — si igual falta algo, escribilo a mano',
          )
        } else {
          setExtDetectado('no pude leer la letra sincronizada de esta pista — te cargué las últimas estrofas: borrá las que ya se cantaron')
        }
      } else {
        setExtDetectado('no pude recuperar el audioId de esta pista (¿tarea vieja en Suno?) — probá con la otra versión')
      }
    } catch {
      setExtDetectado('no pude consultar Suno para detectar el corte — armá la continuación a mano')
    } finally {
      setExtResolviendo(false)
    }
  }

  async function enviarExtension() {
    const c = extModal
    if (!c || extEnviando) return
    if (!extAudioId) {
      mostrar('Todavía no tengo el audioId de esa pista — esperá un segundito o reabrí el modal', 'info', 4000)
      return
    }
    if (extContinueAt <= 0 || (c.duracionSeg && extContinueAt >= c.duracionSeg)) {
      mostrar('El segundo de corte tiene que estar DENTRO de la canción', 'error', 4000)
      return
    }
    if (!c.instrumental && extLetra.trim().length < 10) {
      mostrar('Escribí la letra que falta cantar (o tocá Cancelar)', 'info', 3500)
      return
    }
    setExtEnviando(true)
    try {
      const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
      const tituloFin = extTitulo.trim() || `${c.titulo} — continuación`
      const estiloFin = extEstilo.trim() || c.estilo
      const pistas = await extenderMusica(motor, {
        audioId: extAudioId,
        taskId: c.taskId || undefined,
        continueAt: extContinueAt,
        letra: extLetra.trim(),
        estilo: estiloFin,
        titulo: tituloFin,
        instrumental: c.instrumental,
        // ⚠️ el modelo tiene que ser el MISMO de la original
        modelo: c.modelo || ajustes.modeloSuno,
      })
      const nuevas: Cancion[] = pistas
        .filter((p) => p.taskId)
        .map((p, i) => ({
          id: `${Date.now()}-ext${i}`,
          taskId: p.taskId,
          audioId: p.audioId,
          titulo: tituloFin,
          estilo: estiloFin,
          letraTexto: c.instrumental ? undefined : extLetra.trim(),
          instrumental: c.instrumental,
          modelo: c.modelo || ajustes.modeloSuno,
          motor: 'suno' as const,
          continuacionDe: c.id,
          continueAtSeg: extContinueAt,
          estado: 'generando' as const,
          fecha: Date.now(),
        }))
      if (!nuevas.length) throw new Error('La API no devolvió pistas')
      agregarCanciones(nuevas)
      void actualizarCreditos()
      void (async () => {
        if (await pedirPermisoNotificaciones()) {
          for (const n of nuevas) if (n.taskId) void programarRecordatorio(n.taskId, tituloFin)
        }
      })()
      vibrar()
      mostrar('Continuación en el horno 🔥 — te aviso cuando llegue 🔔', 'ok', 4500)
      setExtModal(null)
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló la extensión', 'error', 4500)
    } finally {
      setExtEnviando(false)
    }
  }

  /** 🔗 v0.8.0 — une original + continuación en un solo MP3 y lo baja
   * como «— completa» (v0.9.0: también con la letra adentro). */
  const [uniendoId, setUniendoId] = useState<string | null>(null)
  async function unirYDescargar(c: Cancion) {
    if (uniendoId || !c.urlAudio) return
    const original = canciones.find((o) => o.id === c.continuacionDe)
    if (!original?.urlAudio) {
      mostrar('No encontré la canción original (¿la borraste?) — bajá las dos partes por separado', 'info', 4500)
      return
    }
    setUniendoId(c.id)
    try {
      const yaCompleta = (c.duracionSeg ?? 0) > (c.continueAtSeg ?? 0) + 45
      let blob: Blob
      if (yaCompleta) {
        const resp = await fetch(c.urlAudio)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        blob = await resp.blob()
      } else {
        const [r1, r2] = await Promise.all([fetch(original.urlAudio), fetch(c.urlAudio)])
        if (!r1.ok || !r2.ok) throw new Error('no pude bajar los audios')
        const [b1, b2] = await Promise.all([r1.blob(), r2.blob()])
        blob = new Blob([b1, await quitarId3(b2)], { type: 'audio/mpeg' })
      }
      // la letra de la COMPLETA es la de la original (la continuación
      // solo trae el pedazo que faltaba) y la duración, la suma
      const tituloCompl = c.titulo.replace('— continuación', '— completa')
      const durTotal = yaCompleta
        ? c.duracionSeg
        : Math.max((original.duracionSeg ?? 0) + (c.duracionSeg ?? 0) - (c.continueAtSeg ?? 0), 0)
      const { res, conLrc } = await guardarAudioConLetra(c, blob, {
        tituloFinal: tituloCompl,
        letraFinal: letraDe(original),
        duracionFinal: durTotal,
        soloEstimado: true, // los tiempos reales no sirven: la original ya corrió
      })
      vibrar()
      mostrar(
        yaCompleta
          ? `Suno ya devolvió la canción COMPLETA${conLrc ? ' (con letra adentro)' : ''} — guardada en ${res.ruta} 💾`
          : `Canción completa${conLrc ? ' (con letra adentro)' : ''} guardada en ${res.ruta} 💾 (si escuchás un saltito donde se unen, es normal)`,
        'ok',
        6000,
      )
    } catch {
      mostrar('No pude unir los MP3 — bajá las dos partes por separado', 'error', 5000)
    } finally {
      setUniendoId(null)
    }
  }

  const generando = canciones.filter((c) => c.estado === 'generando').length
  // Semáforo: hace cuánto que Suno no contesta un polling exitoso
  const segundosSinRespuesta = ultimoContacto ? Math.max(0, Math.round((Date.now() - ultimoContacto) / 1000)) : null
  const sunoMudo = generando > 0 && ultimoContacto !== null && (segundosSinRespuesta ?? 0) > 45
  const hayListas = canciones.some((c) => c.estado === 'lista')

  /** 🎧 v0.10.0 — tocar ▶ en una tarjeta: si ya es la que suena,
   * pausa/reanuda; si no, arma la cola con su sección (carpeta,
   * favoritas, lista) y arranca ahí. */
  function alternarReproduccion(c: Cancion, seccion: Cancion[], etiqueta = '📚 Biblioteca') {
    vibrar('ligera')
    if (reproductor.actual?.id === c.id) {
      reproductor.alternar()
      return
    }
    reproductor.reproducir(seccion, c.id, etiqueta)
  }

  /** ❤️ v0.10.0 — marcar / desmarcar favorita. */
  function alternarFavorita(c: Cancion) {
    actualizarCancion(c.id, { favorita: !c.favorita })
  }

  /** 💾 v0.10.0 — respaldo manual (el automático corre al entrar). */
  async function respaldarTodo() {
    if (respaldando) return
    const pendientes = canciones.filter(necesitaRespaldo).length
    if (!pendientes) {
      mostrar('Todas tus canciones ya tienen su copia local 💾', 'ok')
      return
    }
    setRespaldando(true)
    try {
      const r = await respaldarPendientes()
      vibrar()
      if (r.ok > 0) {
        mostrar(`💾 ${r.ok} ${r.ok === 1 ? 'canción copiada' : 'canciones copiadas'} a tu dispositivo`, 'ok', 5000)
      } else {
        mostrar('No pude bajar ninguna — revisá tu conexión y probá de nuevo', 'error', 5000)
      }
    } finally {
      setRespaldando(false)
    }
  }

  /** 🎵 v0.10.0 — crea una lista desde la sección de listas. */
  function confirmarListaNueva() {
    const nombre = (creandoLista ?? '').trim()
    setCreandoLista(null)
    if (!nombre) return
    crearLista(nombre)
    vibrar()
    mostrar(`Lista «${nombre}» creada ✓ — agregale canciones con el ➕ de cada tarjeta`, 'ok', 5000)
  }

  /** 🎵 v0.10.0 — crea una lista y mete la canción del modal adentro. */
  function crearListaYAgregar() {
    if (!modalListas || !nuevaLista.trim()) return
    const lista = crearLista(nuevaLista.trim())
    alternarEnLista(lista.id, modalListas.id)
    vibrar()
    mostrar(`«${modalListas.titulo}» entró a «${lista.nombre}» ✓`, 'ok')
    setNuevaLista('')
    setModalListas(null)
  }

  // ✏️ v0.9.1 — confirma el renombre de la tarjeta en edición.
  function confirmarRenombre() {
    if (!renombrando) return
    const nuevo = renombrando.valor.trim()
    const actual = canciones.find((c) => c.id === renombrando.id)
    if (actual && nuevo && nuevo !== actual.titulo) {
      actualizarCancion(renombrando.id, { titulo: nuevo })
      vibrar()
      mostrar(`Ahora se llama «${nuevo}» ✓`, 'ok')
    }
    setRenombrando(null)
  }

  /** v0.9.1 — la TARJETA de una canción (antes era el map directo
   * de la lista): ahora se dibuja en «En curso» y adentro de cada
   * CARPETA de estilo. Novedad: el título se puede EDITAR (✏️). */
  function renderTarjeta(c: Cancion, seccion: Cancion[], etiqueta = '📚 Biblioteca') {
    // v0.6.4: tarea «generando» con edad de muerta → la tarjeta
    // cambia de cara (ámbar, sin spinner) y deja de prometer.
    const muerta = c.estado === 'generando' && c.motor !== 'lyria' && edadMin(c.fecha) >= MIN_TAREA_MUERTA
    return (
              <li
                key={c.id}
                className={`rounded-2xl border p-4 ${
                  muerta
                    ? 'border-amber-400/60 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-950/20'
                    : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  {c.urlPortada ? (
                    <img src={c.urlPortada} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${
                        muerta ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-acento/10 text-acento'
                      }`}
                    >
                      <Disc3 className={`h-6 w-6 ${c.estado === 'generando' && !muerta ? 'animate-spin' : ''}`} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1">
                        {renombrando?.id === c.id ? (
                          <>
                            <input
                              autoFocus
                              value={renombrando.valor}
                              onChange={(e) => setRenombrando({ id: c.id, valor: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmarRenombre()
                                if (e.key === 'Escape') setRenombrando(null)
                              }}
                              maxLength={80}
                              aria-label="Nuevo título"
                              className="h-8 min-w-0 flex-1 rounded-lg border border-acento bg-transparent px-2 text-sm font-semibold text-neutral-900 outline-none dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={confirmarRenombre}
                              title="Guardar el nuevo título"
                              className="shrink-0 rounded-lg bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-600 transition-colors hover:bg-emerald-500/25 dark:text-emerald-400"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenombrando(null)}
                              title="Cancelar"
                              className="shrink-0 rounded-lg px-2 py-0.5 font-bold text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="min-w-0 truncate font-semibold text-neutral-900 dark:text-white">{c.titulo}</p>
                            {/* ✏️ v0.9.1 — editar el título: funciona en
                                cualquier tarjeta, lista o en curso */}
                            <button
                              type="button"
                              onClick={() => {
                                vibrar('ligera')
                                setRenombrando({ id: c.id, valor: c.titulo })
                              }}
                              title="Editar el título"
                              className="shrink-0 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-acento"
                            >
                              <PenLine className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                      {c.version && (
                        <span className="shrink-0 rounded-full bg-acento/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-acento">
                          Versión {c.version}
                        </span>
                      )}
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          c.estado === 'lista'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : c.estado === 'error'
                              ? 'bg-red-500/15 text-red-500'
                              : muerta
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'bg-acento/15 text-acento'
                        }`}
                      >
                        {c.estado === 'lista' ? '✓ Lista' : c.estado === 'error' ? 'Error' : muerta ? '⚠ Se cayó' : 'Generando'}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {[
                        c.motor === 'lyria' ? '🎹 Lyria' : c.continuacionDe ? '⏩ continuación' : '🎵 Suno',
                        c.audioLocal || c.respaldada ? '💾 en tu dispositivo' : '',
                        c.estilo,
                        c.duracionSeg ? formatoDuracion(c.duracionSeg) : '',
                        c.instrumental ? 'instrumental' : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>

                    {c.estado === 'generando' &&
                      (() => {
                        const et = etapaDe(c)
                        return (
                          <div className="mt-2">
                            {/* Barrita de etapas: en tarea muerta se apaga
                                (ámbar fijo) — ya no hay nada que esperar */}
                            <div className="flex items-center gap-1" aria-hidden="true">
                              {[1, 2, 3].map((p) => (
                                <span
                                  key={p}
                                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                                    muerta
                                      ? 'bg-amber-500/50'
                                      : et.paso > p
                                        ? 'bg-acento'
                                        : et.paso === p
                                          ? 'animate-pulse bg-acento'
                                          : 'bg-neutral-200 dark:bg-neutral-800'
                                  }`}
                                />
                              ))}
                            </div>
                            {muerta ? (
                              <>
                                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                                  <Skull className="h-3.5 w-3.5 shrink-0" /> Esta generación se cayó — van {minutosDesde(c.fecha)} en la cola
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                                  A esta altura la tarea no viene más. Lo más probable es que Suno ya te haya devuelto los 12 créditos
                                  de este pedido. Podés quitar la tarjeta sin miedo, o hacerla ya gratis en la cola oficial 👇
                                </p>
                              </>
                            ) : (
                              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-400">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {et.texto} · {minutosDesde(c.fecha)}
                                {hintEdad(c.fecha)}
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => void revisarAhora(c)}
                              disabled={revisandoId !== null}
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-400 transition-colors hover:text-acento disabled:opacity-50"
                            >
                              <RefreshCw className={`h-3 w-3 ${revisandoId === c.id ? 'animate-spin' : ''}`} />
                              {revisandoId === c.id ? 'consultando…' : muerta ? 'Verificar una última vez' : 'Revisar ahora'}
                            </button>
                            {/* 🚀 Válvula de escape: a los 20 min de cola, ofrecer
                                la vía oficial gratis (misma letra, otros minutos). */}
                            {edadMin(c.fecha) >= 20 && (
                              <button
                                type="button"
                                onClick={() => void hacerlaYaEnSuno(c)}
                                className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition-colors ${
                                  muerta
                                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'
                                    : 'border-acento/40 bg-acento/10 text-acento hover:bg-acento/20'
                                }`}
                              >
                                <Rocket className="h-3.5 w-3.5" /> Hacerla ya en suno.com — gratis, cola oficial (~2 min)
                              </button>
                            )}
                          </div>
                        )
                      })()}
                    {c.estado === 'error' && (
                      <p className="mt-2 text-xs text-red-500">{c.error ?? 'La generación falló — probá de nuevo'}</p>
                    )}
                    {c.estado === 'lista' && (
                      <div className="mt-2.5 flex items-center gap-2">
                        {/* ❤️ favorita */}
                        <button
                          type="button"
                          onClick={() => {
                            vibrar('ligera')
                            alternarFavorita(c)
                          }}
                          title={c.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
                          aria-label={c.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                            c.favorita
                              ? 'border-red-500/40 bg-red-500/10 text-red-500'
                              : 'border-neutral-200 text-neutral-400 hover:border-red-500/40 hover:text-red-500 dark:border-neutral-800'
                          }`}
                        >
                          <Heart className={`h-4 w-4 ${c.favorita ? 'fill-current' : ''}`} />
                        </button>
                        {/* ▶ reproducir (o ⏸ si es la que suena) */}
                        {(() => {
                          const esActual = reproductor.actual?.id === c.id
                          return (
                            <button
                              type="button"
                              onClick={() => alternarReproduccion(c, seccion, etiqueta)}
                              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors ${
                                esActual
                                  ? 'bg-acento text-black hover:brightness-110'
                                  : 'bg-acento/10 text-acento hover:bg-acento/20'
                              }`}
                            >
                              {esActual && reproductor.sonando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                              {esActual ? (reproductor.sonando ? 'Pausar' : 'Seguir sonando') : 'Reproducir'}
                            </button>
                          )
                        })()}
                        {/* ➕ a una lista */}
                        <button
                          type="button"
                          onClick={() => {
                            vibrar('ligera')
                            setModalListas(c)
                            setNuevaLista('')
                          }}
                          title="Agregar a una lista (Anime, Gym…)"
                          aria-label="Agregar a una lista"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 transition-colors hover:border-acento/40 hover:text-acento dark:border-neutral-800"
                        >
                          <ListPlus className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* ⏩ v0.8.0 — EXTENDER: la canción quedó corta / se
                    cortó la letra? Suno la continúa cantando lo que
                    falte, en el mismo estilo, sin rehacerla. */}
                {c.estado === 'lista' && c.motor !== 'lyria' && (
                  <button
                    type="button"
                    onClick={() => void abrirExtender(c)}
                    title="Suno sigue la canción desde donde elijas, cantando la letra que falte en el mismo estilo"
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-acento/40 bg-acento/10 px-3 py-2 text-[11px] font-bold text-acento transition-colors hover:bg-acento/20"
                  >
                    <FastForward className="h-3.5 w-3.5" /> Extender — ¿se cortó la letra? Completala acá
                  </button>
                )}

                {c.estado === 'lista' && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Boton variante="secundario" tamano="sm" icono={<Share2 className="h-3.5 w-3.5" />} onClick={() => compartirCancion(c)}>
                      Compartir
                    </Boton>
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      icono={<Download className="h-3.5 w-3.5" />}
                      cargando={bajandoId === c.id}
                      onClick={() => void descargarMp3(c)}
                    >
                      MP3 + letra
                    </Boton>
                    <Boton variante="fantasma" tamano="sm" icono={<Trash2 className="h-3.5 w-3.5" />} onClick={() => borrar(c.id)}>
                      Eliminar
                    </Boton>
                  </div>
                )}

                {/* 🔗 v0.8.0 — en las continuaciones: unir original +
                    continuación y bajar el MP3 de la canción completa. */}
                {c.estado === 'lista' && c.continuacionDe && (
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    className="mt-2 w-full"
                    icono={<Link2 className="h-3.5 w-3.5" />}
                    cargando={uniendoId === c.id}
                    onClick={() => void unirYDescargar(c)}
                  >
                    Unir con la original y bajar la completa
                  </Boton>
                )}

                {/* 📝 v0.9.0 — la letra a la vista: cantarla, revisarla
                    o copiarla sin ir a la pestaña Letras. */}
                {c.estado === 'lista' && !c.instrumental && letraDe(c) && (
                  <details className="group mt-2">
                    <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 text-[11px] font-bold text-neutral-400 transition-colors hover:text-acento [&::-webkit-details-marker]:hidden">
                      <span className="transition-transform group-open:rotate-90">▸</span> 📝 Ver la letra
                    </summary>
                    <pre className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 font-sans text-xs leading-relaxed text-neutral-600 dark:bg-neutral-950 dark:text-neutral-300">
                      {letraDe(c)}
                    </pre>
                  </details>
                )}

                {c.estado !== 'lista' && (
                  <Boton variante="fantasma" tamano="sm" className="mt-2 w-full" icono={<Trash2 className="h-3.5 w-3.5" />} onClick={() => borrar(c.id)}>
                    {muerta ? 'Quitar la tarjeta caída' : 'Quitar de la lista'}
                  </Boton>
                )}
              </li>
    )
  }

  return (
    <div className="space-y-4">
      {/* Encabezado + buscador */}
      <section aria-label="Biblioteca de canciones">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            {canciones.length} {canciones.length === 1 ? 'canción' : 'canciones'}
            {generando > 0 && <span className="ml-2 text-acento">· {generando} en el horno</span>}
          </h3>
          {canciones.length > 0 && (
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => void respaldarTodo()}
                disabled={respaldando}
                title="Copiar los MP3 de Suno a tu dispositivo (respaldo local)"
                className="flex items-center gap-1 text-xs font-semibold text-neutral-400 transition-colors hover:text-acento disabled:opacity-50"
              >
                <HardDriveDownload className={`h-3.5 w-3.5 ${respaldando ? 'animate-pulse' : ''}`} />
                {respaldando ? 'respaldando…' : canciones.some(necesitaRespaldo) ? '💾 Respaldo' : '💾 a salvo'}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-acento"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refrescar
              </button>
            </div>
          )}
        </div>

        {canciones.length > 0 && (
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por título o estilo…"
              className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
              aria-label="Buscar canciones"
            />
          </div>
        )}

        {/* 💡 el dato bueno: los MP3 salen con la letra adentro */}
        {hayListas && (
          <p className="mb-2 rounded-xl bg-acento/10 px-3 py-2 text-[11px] leading-relaxed text-acento">
            💾 Al tocar <b>MP3</b>, la canción baja con la <b>letra adentro</b> y un archivito <b>.lrc</b> al lado (mismo
            nombre) — los reproductores como Musicolet o Poweramp los leen solos y te muestran la letra avanzando con la
            música, como en Spotify 🎼
          </p>
        )}

        {/* 💾 v0.10.0 — mientras queden canciones sin copia local, se
            enseña el respaldo (desaparece cuando todo está a salvo) */}
        {canciones.some(necesitaRespaldo) && (
          <p className="mb-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400">
            📼 Cada canción de Suno se copia <b>sola a tu dispositivo</b> al quedar lista (y las viejas, al entrar acá) —
            así, aunque el enlace del CDN caduque con el tiempo, tus canciones no se pierden: suenan y se bajan desde la
            copia local 💾
          </p>
        )}

        {/* Semáforo de conexión con Suno (v0.4.5) */}
        {generando > 0 && (
          <p className={`mb-2 text-[11px] font-semibold ${sunoMudo ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400'}`}>
            {ultimoContacto === null
              ? '🟡 contactando con Suno…'
              : sunoMudo
                ? `⚠️ Suno no responde hace ${segundosSinRespuesta}s — puede ser tu conexión; sigo reintentando`
                : `🟢 consultando Suno cada 6s · última respuesta hace ${segundosSinRespuesta}s`}
          </p>
        )}

        {canciones.length === 0 ? (
          <EmptyState
            icono={<Music2 className="h-7 w-7" />}
            titulo="Tu biblioteca está vacía"
            descripcion="Las canciones que generés se acumulan acá para siempre: escucharlas, extenderlas, ver su letra y bajarlas como MP3 con la letra adentro. La primera está a un paso: andá a Música, elegí una letra y tocá Generar."
            accion={<Boton onClick={() => irA('musica')}>Crear mi primera canción</Boton>}
          />
        ) : visibles.length === 0 ? (
          <EmptyState
            icono={<Search className="h-7 w-7" />}
            titulo={`Nada con «${busqueda.trim()}»`}
            descripcion="Probá con otra palabra del título o del estilo — o limpiá el buscador para ver todas."
          />
        ) : (
          <>
          {/* ⏳ v0.9.1 — las que se están cocinando (o fallaron) van
              arriba, sueltas: son transitorias — al quedar listas
              migran a su carpeta de estilo. */}
          {enCurso.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                ⏳ En curso · {enCurso.length}
              </p>
              <ul className="space-y-2.5">{enCurso.map((c) => renderTarjeta(c, enCurso))}</ul>
            </div>
          )}

          {/* ❤️ v0.10.0 — FAVORITAS: el corazón de cada tarjeta las
              junta acá, a un toque (como una carpeta más). */}
          {favoritasVisibles.length > 0 && (
            <details className="group rounded-2xl border border-red-500/20 bg-red-500/5">
              <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="truncate text-sm font-bold text-neutral-700 dark:text-neutral-200">❤️ Favoritas</span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      reproductor.reproducir(favoritasVisibles, favoritasVisibles[0].id, '❤️ Favoritas')
                    }}
                    title="Reproducir las favoritas"
                    className="rounded-lg p-1 text-acento transition-colors hover:bg-acento/10"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-500">
                    {favoritasVisibles.length} {favoritasVisibles.length === 1 ? 'canción' : 'canciones'}
                  </span>
                  <span className="text-neutral-400 transition-transform group-open:rotate-90">▸</span>
                </span>
              </summary>
              <ul className="space-y-2.5 border-t border-red-500/10 px-3 py-2.5">
                {favoritasVisibles.map((c) => renderTarjeta(c, favoritasVisibles, '❤️ Favoritas'))}
              </ul>
            </details>
          )}

          {/* 🎵 v0.10.0 — LISTAS propias: «Anime», «Gym», «Para
              dormir»… se arman con el ➕ de cada canción. */}
          <details className="group rounded-2xl border border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/40">
            <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="truncate text-sm font-bold text-neutral-700 dark:text-neutral-200">🎵 Mis listas</span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="rounded-full bg-acento/15 px-2 py-0.5 text-[10px] font-bold text-acento">
                  {listas.length} {listas.length === 1 ? 'lista' : 'listas'}
                </span>
                <span className="text-neutral-400 transition-transform group-open:rotate-90">▸</span>
              </span>
            </summary>
            <div className="space-y-2.5 border-t border-neutral-200/70 px-3 py-2.5 dark:border-neutral-800/70">
              {listas.length === 0 && (
                <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Todavía no tenés listas — tocá el <b>➕</b> de cualquier canción para meterla en una («Anime», «Gym»,
                  «Para dormir»…) o creá la primera acá 👇
                </p>
              )}
              {listas.map((l) => {
                const cs = cancionesDeLista(l)
                return (
                  <details key={l.id} className="rounded-xl bg-white dark:bg-neutral-900">
                    <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-2.5 py-2 [&::-webkit-details-marker]:hidden">
                      <ListMusic className="h-4 w-4 shrink-0 text-acento" />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-800 dark:text-neutral-100">
                        {l.nombre}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (cs.length) reproductor.reproducir(cs, cs[0].id, `🎵 ${l.nombre}`)
                          }}
                          title={`Reproducir «${l.nombre}»`}
                          className="rounded-lg p-1 text-acento transition-colors hover:bg-acento/10"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </button>
                        <span className="rounded-full bg-acento/15 px-2 py-0.5 text-[10px] font-bold text-acento">
                          {cs.length}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            borrarLista(l.id)
                            vibrar('media')
                            mostrar(`Lista «${l.nombre}» eliminada — las canciones siguen en tu Biblioteca`, 'info')
                          }}
                          title="Borrar la lista (no borra las canciones)"
                          className="rounded-lg p-1 text-neutral-400 transition-colors hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-neutral-400 transition-transform group-open:rotate-90">▸</span>
                      </span>
                    </summary>
                    {cs.length ? (
                      <ul className="space-y-2.5 px-2 pb-2 pt-1">{cs.map((c) => renderTarjeta(c, cs, `🎵 ${l.nombre}`))}</ul>
                    ) : (
                      <p className="px-2.5 pb-2 pt-1 text-xs text-neutral-400">
                        Vacía — tocá el ➕ de cualquier canción para agregarla
                      </p>
                    )}
                  </details>
                )
              })}
              {creandoLista === null ? (
                <button
                  type="button"
                  onClick={() => setCreandoLista('')}
                  className="text-xs font-bold text-acento transition-colors hover:brightness-110"
                >
                  ＋ Nueva lista
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={creandoLista}
                    onChange={(e) => setCreandoLista(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmarListaNueva()
                      if (e.key === 'Escape') setCreandoLista(null)
                    }}
                    maxLength={40}
                    placeholder="Anime, Gym, Para dormir…"
                    aria-label="Nombre de la nueva lista"
                    className="h-9 min-w-0 flex-1 rounded-xl border border-acento bg-transparent px-3 text-sm text-neutral-900 outline-none dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={confirmarListaNueva}
                    title="Crear la lista"
                    className="shrink-0 rounded-lg bg-emerald-500/15 px-2.5 py-1 font-bold text-emerald-600 transition-colors hover:bg-emerald-500/25 dark:text-emerald-400"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreandoLista(null)}
                    title="Cancelar"
                    className="shrink-0 rounded-lg px-2 py-1 font-bold text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </details>

          {/* 📁 v0.9.1 — CARPETAS POR ESTILO (pedido del usuario):
              «todo lo que es power metal en una carpetita… y de ahí
              otra carpeta por ejemplo salsa». La carpeta con la
              canción más reciente queda abierta; el buscador filtra
              adentro de las carpetas igual que antes. */}
          {carpetasOrdenadas.length > 0 && (
            <div className="space-y-2">
              {enCurso.length === 0 && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  📁 En carpetas por estilo — tocá una para abrirla
                </p>
              )}
              {carpetasOrdenadas.map(([nombre, cs], i) => (
                <details
                  key={nombre}
                  open={i === 0}
                  className="group rounded-2xl border border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/40"
                >
                  <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                    <span className="truncate text-sm font-bold text-neutral-700 dark:text-neutral-200">
                      📁 {carpetaBonita(nombre)}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          reproductor.reproducir(cs, cs[0].id, `📁 ${carpetaBonita(nombre)}`)
                        }}
                        title={`Reproducir la carpeta ${carpetaBonita(nombre)}`}
                        className="rounded-lg p-1 text-acento transition-colors hover:bg-acento/10"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <span className="rounded-full bg-acento/15 px-2 py-0.5 text-[10px] font-bold text-acento">
                        {cs.length} {cs.length === 1 ? 'canción' : 'canciones'}
                      </span>
                      <span className="text-neutral-400 transition-transform group-open:rotate-90">▸</span>
                    </span>
                  </summary>
                  <ul className="space-y-2.5 border-t border-neutral-200/70 px-3 py-2.5 dark:border-neutral-800/70">
                    {cs.map((c) => renderTarjeta(c, cs, `📁 ${carpetaBonita(nombre)}`))}
                  </ul>
                </details>
              ))}
            </div>
          )}
          </>
        )}
      </section>

      {/* ⏩ v0.8.0 — MODAL EXTENDER: arma la continuación de una
          canción que se cortó antes de terminar la letra (o que
          simplemente se quiere alargar). */}
      <Modal
        abierto={!!extModal}
        onCerrar={() => {
          if (!extEnviando) setExtModal(null)
        }}
        titulo={`⏩ Extender «${extModal?.titulo ?? ''}»`}
      >
        {extModal && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              Suno sigue esta canción desde el segundo que elijas y canta la letra que falte en el MISMO estilo. Cuando
              llegue queda como tarjeta nueva — después podés unir las dos y bajar el MP3 completo.
            </p>
            {extResolviendo && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-acento">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> mirando dónde se cortó el canto…
              </p>
            )}
            {extDetectado && (
              <p className="rounded-xl bg-acento/10 px-3 py-2 text-[11px] font-semibold leading-relaxed text-acento">
                {extDetectado}
              </p>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                Continuar desde el segundo {formatoDuracion(extContinueAt)} de{' '}
                {formatoDuracion(extModal.duracionSeg) || 'la canción'}
              </span>
              <input
                type="number"
                min={5}
                step={1}
                value={extContinueAt}
                onChange={(e) => setExtContinueAt(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className={claseInput}
              />
            </label>
            {!extModal.instrumental && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  Letra que falta cantar
                </span>
                <textarea
                  value={extLetra}
                  onChange={(e) => {
                    extLetraTocada.current = true
                    setExtLetra(e.target.value)
                  }}
                  rows={7}
                  placeholder={'[Coro]\nLo que quedó sin cantarse…'}
                  className="min-h-[120px] w-full resize-y rounded-xl border border-neutral-300 bg-transparent p-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
                />
              </label>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Estilo</span>
                <input
                  value={extEstilo}
                  onChange={(e) => setExtEstilo(e.target.value)}
                  maxLength={200}
                  className={claseInput}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Título</span>
                <input value={extTitulo} onChange={(e) => setExtTitulo(e.target.value)} maxLength={80} className={claseInput} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Boton variante="secundario" onClick={() => setExtModal(null)}>
                Cancelar
              </Boton>
              <Boton
                icono={<FastForward className="h-4 w-4" />}
                cargando={extEnviando}
                disabled={extResolviendo || !extAudioId}
                onClick={() => void enviarExtension()}
              >
                Extender
              </Boton>
            </div>
            <p className="text-center text-[11px] text-neutral-400">
              Consume créditos como una generación · el modelo es el mismo de la original (
              {modeloSunoBonito(extModal.modelo)})
            </p>
          </div>
        )}
      </Modal>

      {/* 🎵 v0.10.0 — MODAL AGREGAR A LISTA: tocás el ➕ de una
          canción y elegís la lista (o la creás al toque). */}
      <Modal
        abierto={!!modalListas}
        onCerrar={() => setModalListas(null)}
        titulo={`➕ «${modalListas?.titulo ?? ''}» → lista`}
      >
        {modalListas && (
          <div className="space-y-2.5">
            {listas.length === 0 && (
              <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                Todavía no tenés listas — creá la primera y la canción entra solita:
              </p>
            )}
            {listas.map((l) => {
              const dentro = l.ids.includes(modalListas.id)
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    vibrar('ligera')
                    const quedo = alternarEnLista(l.id, modalListas.id)
                    mostrar(quedo ? `Entró a «${l.nombre}» ✓` : `Salió de «${l.nombre}»`, 'info')
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                    dentro
                      ? 'border-acento/50 bg-acento/10 text-acento'
                      : 'border-neutral-200 text-neutral-800 hover:border-acento/40 dark:border-neutral-800 dark:text-neutral-100'
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {dentro ? '✓ ' : ''}
                    {l.nombre}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-neutral-400">{l.ids.length}</span>
                </button>
              )
            })}
            <div className="flex gap-2 pt-1">
              <input
                value={nuevaLista}
                onChange={(e) => setNuevaLista(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') crearListaYAgregar()
                }}
                maxLength={40}
                placeholder="Nueva lista (Anime, Gym…)"
                aria-label="Nombre de la nueva lista"
                className={claseInput}
              />
              <Boton onClick={crearListaYAgregar} disabled={!nuevaLista.trim()}>
                Crear
              </Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
