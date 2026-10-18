import { useEffect, useRef, useState } from 'react'
import {
  Disc3,
  Download,
  FastForward,
  Link2,
  Loader2,
  Music2,
  Piano,
  RefreshCw,
  Rocket,
  Share2,
  Skull,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { leerAjustes, leer, guardar, borrarClave } from '@/core/storage/almacenamiento'
import { guardarAudio, leerAudio, borrarAudio } from '@/core/storage/audio'
import { guardarMp3EnDescargas, nombreMp3 } from '@/core/natives/descargas'
import {
  consultarLetraConTiempos,
  consultarPistas,
  creditosRestantes,
  extenderMusica,
  generarMusica,
  modeloSunoSoportaDuracion,
  type MotorSuno,
} from '@/core/ai/suno'
import { aplicarGrupo, EVENTO_CANCIONES } from '@/core/ai/seguimiento'
import { pedirPermisoNotificaciones, programarRecordatorio } from '@/core/notificaciones/notificaciones'
import { generarMusicaLyria, armarPromptLyria, type MotorLyria } from '@/core/ai/lyria'
import { Boton } from '@/components/ui/Boton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { compartir, vibrar, abrirURL, copiarTexto } from '@/core/natives/plataforma'
import {
  ENERGIAS_ESTILO,
  ESTILOS_RAPIDOS,
  GRUPOS_TAGS_ESTILO,
  INSTRUMENTOS_ESTILO,
  MODELOS_LYRIA,
  TEMPOS_ESTILO,
  VOZ_CANTANTE,
  modeloSunoBonito,
  type Cancion,
  type Letra,
  type MotorMusica,
  type PestannaId,
} from '@/types'

// ═══════════════════════════════════════════════════════════
// 🎧 MÚSICA (FASE 3 — motor doble → triple): elegí una letra
// de la biblioteca (o pegá una), definí el estilo y elegí motor:
//   🎵 Suno — 2 versiones por pedido, polling en vivo (API paga)
//   🎹 Google Lyria — canción o clip de 30s, con tu API key de
//      Google AI Studio (la misma cuenta Google del Firebase)
// Si un motor se queda sin créditos, cambiás al otro y seguís.
// ═══════════════════════════════════════════════════════════

const CLAVE_CANCIONES = 'canciones'
const CLAVE_LETRA_A_MUSICALIZAR = 'letraMusicalizar'

/** Chip del estudio de estilo (v0.7.0): mismo look para géneros,
 * energía, voz, instrumentos y tempo. */
function claseChip(activo: boolean): string {
  return `rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
    activo
      ? 'border-acento bg-acento/15 text-acento'
      : 'border-neutral-200 bg-transparent text-neutral-500 hover:border-acento/60 dark:border-neutral-700 dark:text-neutral-400'
  }`
}

/** Minutos a partir de los cuales damos una tarea por MUERTA (v0.6.4):
 * la cola del intermediario en el peor caso llega a ~60 min; pasada
 * la hora y media, la tarea se cayó y lo honesto es decirlo en la
 * tarjeta — no dejarla pulsando «en cola» por 8 horas. */
const MIN_TAREA_MUERTA = 90

// ⏱️ v0.8.0 — DURACIÓN ESTIMADA: velocidad de canto promedio
// (power metal ~2,8 palabras/s, balada ~1,8 — 2,35 pisa el medio)
// + aire instrumental fijo (intro, solo, final). Con esto se
// calcula cuántos segundos necesita una letra para cantarse entera.
const PALABRAS_POR_SEGUNDO = 2.35
const SEGUNDOS_INSTRUMENTALES = 35

/** Palabras CANTABLES de una letra: sin las marcas de sección
 * ([Coro], [Verso 1]…) que Suno lee pero no canta. */
function contarPalabrasCantables(texto: string): number {
  return texto
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
}

/** Estima la duración que necesita una letra para cantarse entera.
 * Devuelve null si no hay letra; `capada` avisa que la letra pide
 * más de los 6:00 máximo de la API (360 s) — `cruda` es lo que
 * pediría sin ese techo, para el aviso honesto. */
function estimarDuracion(texto: string): { seg: number; cruda: number; capada: boolean } | null {
  const palabras = contarPalabrasCantables(texto)
  if (!palabras) return null
  const bruto = Math.ceil((palabras / PALABRAS_POR_SEGUNDO + SEGUNDOS_INSTRUMENTALES) / 10) * 10
  return { seg: Math.min(360, Math.max(60, bruto)), cruda: Math.max(60, bruto), capada: bruto > 360 }
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
 * de la letra (el usuario dijo que lo que se corta es el final).
 * Corta por estrofas completas (bloques separados por línea
 * vacía), así el pre-relleno queda prolijo y solo hay que borrar
 * lo que sí se cantó. */
function colaDeLetra(texto: string): string {
  const bloques = texto
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  if (!bloques.length) return ''
  const cuantas = Math.max(1, Math.ceil(bloques.length * 0.25))
  return bloques.slice(-cuantas).join('\n\n')
}

/** v0.8.0 — le saca la cabecera ID3v2 a un MP3 para poder pegarlo
 * después de otro sin dejar el tag en el medio del archivo. */
async function sinId3(blob: Blob): Promise<Blob> {
  const cabeza = new Uint8Array(await blob.slice(0, 10).arrayBuffer())
  if (cabeza.length < 10 || cabeza[0] !== 0x49 || cabeza[1] !== 0x44 || cabeza[2] !== 0x33) return blob // "ID3"
  const tamanio = (cabeza[6] << 21) | (cabeza[7] << 14) | (cabeza[8] << 7) | cabeza[9]
  return blob.slice(10 + tamanio)
}

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

/** Reproductor que resuelve el audio venga de CDN (Suno) o IndexedDB (Lyria). */
function Reproductor({ cancion }: { cancion: Cancion }) {
  const [src, setSrc] = useState<string | null>(cancion.urlAudio ?? null)
  useEffect(() => {
    let vivo = true
    if (!src && cancion.audioLocal) {
      leerAudio(cancion.id).then((url) => {
        if (vivo) setSrc(url)
      })
    }
    return () => {
      vivo = false
    }
  }, [cancion.id, cancion.audioLocal, src])
  if (!src) {
    return (
      <p className="mt-2.5 flex items-center gap-1.5 text-xs text-neutral-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> cargando el audio…
      </p>
    )
  }
  return <audio controls preload="none" src={src} className="mt-2.5 h-10 w-full" />
}

export function MusicaView({ irA }: { irA: (p: PestannaId) => void }) {
  const { mostrar } = useToast()
  const ajustes = leerAjustes()
  const letras = leer<Letra[]>('letras', [])

  // Formulario
  const [motor, setMotor] = useState<MotorMusica>(() => (ajustes.tokenSuno ? 'suno' : ajustes.tokenLyria ? 'lyria' : 'suno'))
  const [letraId, setLetraId] = useState('')
  const [texto, setTexto] = useState('')
  const [titulo, setTitulo] = useState('')
  const [estilo, setEstilo] = useState('')
  const [instrumental, setInstrumental] = useState(false)
  const [cargando, setCargando] = useState(false)

  // ⏱️ v0.8.0 — DURACIÓN: 'auto' (Suno decide, como siempre),
  // 'letra' (se calcula según la letra para que alcance entera —
  // el fix del corte) o un número fijo de segundos (2 a 6 min).
  const [duracion, setDuracion] = useState<'auto' | 'letra' | number>('letra')
  const estimacion = duracion === 'letra' && !instrumental ? estimarDuracion(texto) : null

  // Biblioteca de canciones
  const [canciones, setCanciones] = useState<Cancion[]>(() => leer<Cancion[]>(CLAVE_CANCIONES, []))

  // Créditos de sunoapi.org a la vista (v0.4.4): se actualizan al
  // entrar a la pestaña, al mandar un pedido y cuando una pista
  // termina — así el gasto (y el reembolso si algo falla) se ven solos.
  const [creditos, setCreditos] = useState<number | null>(null)
  async function actualizarCreditos() {
    if (!ajustes.tokenSuno) return
    try {
      setCreditos(await creditosRestantes({ url: ajustes.urlSuno, token: ajustes.tokenSuno }))
    } catch {
      /* el contador es informativo — si falla, no pasa nada */
    }
  }
  useEffect(() => {
    void actualizarCreditos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ⏱️ Reloj independiente (v0.4.5): re-render cada 10 s para que los
  // minutos y el semáforo de conexión sigan vivos aunque el polling
  // falle en silencio (internet lento) — sin esto el contador se congela.
  const [, setTic] = useState(0)
  useEffect(() => {
    const i = window.setInterval(() => setTic((t) => t + 1), 10000)
    return () => window.clearInterval(i)
  }, [])

  // 🟢 Marca de la última respuesta exitosa de Suno (semáforo).
  // v0.6.5: arranca “ahora” — si Suno nunca contesta (red caída,
  // clave vencida), a los 45 s el semáforo escala a «no responde»
  // en vez de quedarse en «contactando…» para siempre.
  const [ultimoContacto, setUltimoContacto] = useState<number | null>(() => Date.now())

  // Persistencia de la biblioteca
  useEffect(() => {
    guardar(CLAVE_CANCIONES, canciones)
  }, [canciones])

  // Llegada desde CrearView → «Musicalizar con Suno»: trae la
  // letra preseleccionada una sola vez y limpia la clave.
  useEffect(() => {
    const idPendiente = leer<string>(CLAVE_LETRA_A_MUSICALIZAR, '')
    if (!idPendiente) return
    borrarClave(CLAVE_LETRA_A_MUSICALIZAR)
    const letra = letras.find((l) => l.id === idPendiente)
    if (letra) {
      setLetraId(letra.id)
      setTexto(letra.texto)
      setTitulo(letra.titulo)
      setEstilo(estiloDesdeLetra(letra))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 👁️ El polling vive a nivel app (seguimiento.ts) desde la v0.5.0:
  // la generación sigue aunque estés en otra pestaña. Acá solo
  // escuchamos las actualizaciones para refrescar tarjetas, avisar
  // con toast/vibración y alimentar el semáforo de conexión.
  const previasRef = useRef(canciones)
  useEffect(() => {
    previasRef.current = canciones
  }, [canciones])
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
      setCanciones(nuevas)
      setUltimoContacto(Date.now())
    }
    window.addEventListener(EVENTO_CANCIONES, alActualizar)
    return () => window.removeEventListener(EVENTO_CANCIONES, alActualizar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function elegirLetra(id: string) {
    setLetraId(id)
    const letra = letras.find((l) => l.id === id)
    if (letra) {
      setTexto(letra.texto)
      setTitulo(letra.titulo)
      setEstilo(estiloDesdeLetra(letra))
    } else {
      setTexto('')
      setTitulo('')
      setEstilo('')
    }
  }

  /** v0.7.0 — el estilo inicial al llegar una letra de la
   * biblioteca: género + mood + voz (si la letra la definió). */
  function estiloDesdeLetra(letra: Letra): string {
    const vozTag =
      letra.voz === 'Masculina'
        ? 'voz masculina'
        : letra.voz === 'Femenina'
          ? 'voz femenina'
          : letra.voz === 'Dúo'
            ? 'dúo de voces'
            : ''
    return [letra.genero, letra.mood, vozTag].filter(Boolean).join(', ').toLowerCase()
  }

  // 🎛️ v0.6.0 — COMBINAR estilos: cada etiqueta tocada se suma
  // (o se quita) al campo estilo, separada por comas. El campo
  // sigue siendo texto libre: las etiquetas solo escriben por vos.
  const partesEstilo = estilo
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
  function alternarTag(tag: string) {
    vibrar()
    const partes = estilo
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const i = partes.findIndex((p) => p.toLowerCase() === tag.toLowerCase())
    if (i >= 0) partes.splice(i, 1)
    else partes.push(tag.toLowerCase())
    setEstilo(partes.join(', '))
  }

  // 🎤 v0.7.0 — VOZ: exclusiva (elegir una quita la otra). Se
  // agrega al estilo como tag que Suno entiende y respeta.
  const TAGS_VOZ = ['voz masculina', 'voz femenina', 'dúo de voces']
  const vozActiva = partesEstilo.includes('voz masculina')
    ? 'Masculina'
    : partesEstilo.includes('voz femenina')
      ? 'Femenina'
      : partesEstilo.includes('dúo de voces')
        ? 'Dúo'
        : 'Cualquiera'
  function fijarVoz(v: string) {
    vibrar()
    const partes = estilo
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const sinVoz = partes.filter((p) => !TAGS_VOZ.includes(p.toLowerCase()))
    const tag = v === 'Masculina' ? 'voz masculina' : v === 'Femenina' ? 'voz femenina' : 'dúo de voces'
    // tocar la voz activa la apaga (vuelve a Cualquiera)
    if (v === 'Cualquiera' || partes.some((p) => p.toLowerCase() === tag)) {
      setEstilo(sinVoz.join(', '))
      return
    }
    setEstilo([...sinVoz, tag].join(', '))
  }

  // ⏱️ v0.7.0 — TEMPO: exclusivo, agrega el BPM al estilo.
  const TAGS_TEMPO: string[] = TEMPOS_ESTILO.map((t) => t.tag)
  function fijarTempo(tag: string) {
    vibrar()
    const partes = estilo
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const sinTempo = partes.filter((p) => !TAGS_TEMPO.includes(p.toLowerCase()))
    if (partes.some((p) => p.toLowerCase() === tag)) {
      setEstilo(sinTempo.join(', '))
      return
    }
    setEstilo([...sinTempo, tag].join(', '))
  }

  async function generar() {
    if (cargando) return
    if (motor === 'lyria') {
      await generarConLyria()
      return
    }
    await generarConSuno()
  }

  async function generarConSuno() {
    if (!ajustes.tokenSuno) {
      irA('ajustes')
      mostrar('Configurá tu clave de Suno en Ajustes', 'info', 3200)
      return
    }
    const textoLimpio = texto.trim()
    if (!instrumental && textoLimpio.length < 20) {
      mostrar('Elegí una letra de tu biblioteca o pegála (mínimo unas líneas)', 'info', 3500)
      return
    }
    const tituloLimpio = titulo.trim() || 'Mi canción'
    const estiloLimpio = estilo.trim() || 'pop latino'
    // Duración que se manda a la API: 'letra' calcula según las
    // palabras (en instrumental no hay letra que ajustar → auto).
    const duracionSeg =
      duracion === 'auto' || instrumental
        ? undefined
        : duracion === 'letra'
          ? (estimarDuracion(textoLimpio)?.seg ?? undefined)
          : duracion
    vibrar()
    setCargando(true)
    try {
      const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
      const pistas = await generarMusica(motor, {
        letra: textoLimpio,
        estilo: estiloLimpio,
        titulo: tituloLimpio,
        instrumental,
        modelo: ajustes.modeloSuno,
        duracionSeg,
      })
      const nuevas: Cancion[] = pistas
        .filter((p) => p.taskId)
        .map((p, i) => ({
          id: `${Date.now()}-${i}`,
          taskId: p.taskId,
          titulo: p.titulo || tituloLimpio,
          estilo: estiloLimpio,
          letraId: letraId || undefined,
          letraTexto: instrumental ? undefined : textoLimpio,
          instrumental,
          modelo: ajustes.modeloSuno,
          motor: 'suno' as const,
          estado: 'generando' as const,
          fecha: Date.now(),
        }))
      if (!nuevas.length) throw new Error('La API no devolvió pistas')
      setCanciones((cs) => [...nuevas, ...cs])
      void actualizarCreditos()
      // 🔔 v0.5.0: avisar cuando llegue, aunque estés en otra pestaña o
      // cierres la app — el recordatorio lo agenda el sistema operativo.
      void (async () => {
        if (await pedirPermisoNotificaciones()) {
          for (const n of nuevas) if (n.taskId) void programarRecordatorio(n.taskId, tituloLimpio)
        }
      })()
      mostrar(`${nuevas.length} ${nuevas.length === 1 ? 'versión' : 'versiones'} en el horno 🔥 — te aviso cuando lleguen 🔔`, 'ok', 4500)
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló Suno', 'error', 4500)
    } finally {
      setCargando(false)
    }
  }

  /** Google Lyria: la llamada espera hasta que el MP3 llega completo
   * (sincrónica — hasta ~3 min para canción entera). */
  async function generarConLyria() {
    if (!ajustes.tokenLyria) {
      irA('ajustes')
      mostrar('Configurá tu API key de Google (Lyria) en Ajustes', 'info', 3200)
      return
    }
    const textoLimpio = texto.trim()
    if (!instrumental && textoLimpio.length < 20) {
      mostrar('Elegí una letra de tu biblioteca o pegála (mínimo unas líneas)', 'info', 3500)
      return
    }
    const tituloLimpio = titulo.trim() || 'Mi canción'
    const estiloLimpio = estilo.trim() || 'pop latino'
    vibrar()
    setCargando(true)
    try {
      const motorL: MotorLyria = { token: ajustes.tokenLyria }
      const resultado = await generarMusicaLyria(motorL, {
        prompt: armarPromptLyria({
          estilo: estiloLimpio,
          titulo: tituloLimpio,
          letra: textoLimpio,
          instrumental,
        }),
        modelo: ajustes.modeloLyria,
      })
      const id = `${Date.now()}`
      await guardarAudio(id, resultado.audioBase64, resultado.mime)
      const nueva: Cancion = {
        id,
        taskId: '',
        titulo: tituloLimpio,
        estilo: estiloLimpio,
        letraId: letraId || undefined,
        letraTexto: instrumental ? undefined : textoLimpio,
        instrumental,
        modelo: ajustes.modeloLyria,
        motor: 'lyria',
        audioLocal: true,
        estado: 'lista',
        fecha: Date.now(),
      }
      setCanciones((cs) => [nueva, ...cs])
      vibrar()
      mostrar(`¡«${tituloLimpio}» lista! 🎹`, 'ok')
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló Lyria', 'error', 5000)
    } finally {
      setCargando(false)
    }
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
      setCanciones((cs) => aplicarGrupo(cs, c.taskId, pistas))
      const listas = pistas.filter((p) => p.estado === 'lista')
      if (listas.length) {
        vibrar()
        mostrar(`¡${listas.length} ${listas.length === 1 ? 'versión lista' : 'versiones listas'} de «${c.titulo}»! 🎧`, 'ok')
        void actualizarCreditos()
      } else if (pistas.some((p) => p.estado === 'error')) {
        mostrar(`«${c.titulo}» falló — Suno devuelve los créditos de esa generación`, 'info', 4000)
        void actualizarCreditos()
      } else {
        // v0.6.4: si la tarea ya tiene edad de muerta, no le vendemos
        // ilusión al usuario aunque la API siga diciendo «PENDING».
        const muerta = edadMin(c.fecha) >= MIN_TAREA_MUERTA
        mostrar(
          muerta
            ? 'La API dice «en cola», pero a esta altura la tarea está muerta — los 12 créditos deberían haber vuelto solos (mirá el contador 💰 de arriba)'
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
    if (cancion?.audioLocal) void borrarAudio(id)
    setCanciones((cs) => cs.filter((c) => c.id !== id))
    mostrar('Canción eliminada', 'info')
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

  /** ⚡ (v0.6.3) La cola oficial de Suno no se vende como API:
   * vive en suno.com o su app oficial (Suno, Inc.) — gratis con tu
   * Google (50 créditos/día) o Pro ($8/mes, prioritaria). Este atajo
   * copia la letra del formulario y abre Custom Mode. */
  async function urgenteSunoCom() {
    const letraTxt = texto.trim()
    vibrar()
    const copiado = letraTxt.length >= 20 ? await copiarTexto(letraTxt) : false
    await abrirURL('https://suno.com/create')
    mostrar(
      copiado
        ? `Letra copiada ✔ — en Suno usá Custom Mode con el estilo: ${estilo.trim() || 'el que quieras'}`
        : 'Abrí Custom Mode en Suno y pegá tu letra',
      'info',
      6500,
    )
  }

  /** 🚀 Válvula de escape (v0.6.1): si la cola de sunoapi.org está
   * muerta, la misma letra se puede musicalizar YA en suno.com con
   * la cuenta Google (50 créditos/día, cola oficial — la misma que
   * usan las apps que generan en minutos). No toca los créditos de
   * la API ni cancela la tarea pendiente: si después llega, mejor. */
  async function hacerlaYaEnSuno(c: Cancion) {
    const letraTxt = c.letraTexto ?? letras.find((l) => l.id === c.letraId)?.texto ?? ''
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

  /** 💾 v0.7.1 — baja el MP3 al dispositivo y lo guarda DE VERDAD:
   * en el APK va a Descargas/<tu carpeta>/ (plugin nativo — el
   * truco del <a download> no descargaba nada en la WebView);
   * en web, la descarga clásica del navegador. Si el CDN bloquea
   * (CORS) o la red no da, abre el audio para guardarlo a mano. */
  const [bajandoId, setBajandoId] = useState<string | null>(null)
  async function descargarMp3(c: Cancion) {
    if (bajandoId || (!c.urlAudio && !c.audioLocal)) return
    setBajandoId(c.id)
    try {
      let blob: Blob | null = null
      if (c.audioLocal) {
        const dataUrl = await leerAudio(c.id)
        if (!dataUrl) throw new Error('sin audio local')
        blob = await (await fetch(dataUrl)).blob()
      } else if (c.urlAudio) {
        const resp = await fetch(c.urlAudio)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        blob = await resp.blob()
      }
      if (!blob) throw new Error('sin audio')
      const nombre = nombreMp3(c.titulo, c.version)
      const resultado = await guardarMp3EnDescargas(blob, nombre, ajustes.carpetaDescargas)
      if (!resultado.ok) throw new Error(resultado.error)
      vibrar()
      mostrar(`MP3 guardado en ${resultado.ruta} 💾`, 'ok', 5000)
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

  const claseInput =
    'h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors focus:border-acento dark:border-neutral-700'

  // ═══════════════════════════════════════════════════════════
  // ⏩ v0.8.0 — EXTENDER UNA CANCIÓN YA HECHA (el arreglo para las
  // que se cortaron antes de terminar la letra): Suno continúa la
  // pista desde el segundo elegido cantando lo que falte, en el
  // mismo estilo. Al abrir el modal se intenta detectar el corte
  // exacto con la letra sincronizada de la API (qué líneas quedaron
  // sin cantarse y en qué segundo terminó el canto).
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
    setExtLetra(c.instrumental ? '' : colaDeLetra(c.letraTexto ?? ''))
    if (!c.taskId) return
    const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
    setExtResolviendo(true)
    try {
      let audioId = c.audioId
      if (!audioId) {
        // canción vieja (pre-v0.8.0): el audioId se recupera de
        // record-info, matcheando la versión por su URL de audio
        const pistas = await consultarPistas(motor, c.taskId, c.titulo)
        const pista = pistas.find((p) => p.urlAudio && p.urlAudio === c.urlAudio) ?? pistas.find((p) => p.audioId)
        audioId = pista?.audioId
        if (audioId) setCanciones((cs) => cs.map((x) => (x.id === c.id ? { ...x, audioId } : x)))
      }
      if (audioId) {
        setExtAudioId(audioId)
        const tiempos = await consultarLetraConTiempos(motor, c.taskId, audioId)
        if (tiempos) {
          if (tiempos.finUltimoCanto) {
            setExtContinueAt(Math.floor(Math.min(Math.max(tiempos.finUltimoCanto - 2, 5), Math.max(5, dur - 3))))
          }
          if (!extLetraTocada.current && !c.instrumental) {
            const restante = restanteDeLetra(c.letraTexto ?? '', tiempos.palabrasCantadas)
            if (restante) setExtLetra(restante)
          }
          setExtDetectado(
            tiempos.finUltimoCanto
              ? `✔ detecté el corte: el canto termina en ${formatoDuracion(tiempos.finUltimoCanto)} de ${formatoDuracion(
                  dur,
                )} — te cargué la letra que faltó (revisala igual)`
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
      setCanciones((cs) => [...nuevas, ...cs])
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
   * como «— completa». Si Suno ya devolvió la continuación CON la
   * parte original adentro (pasa: la versión final ya viene entera),
   * se baja directa. La unión es por concatenación de blobs: puede
   * quedar un mini-salto donde se juntan — normal, no está re-grabada. */
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
      const nombre = nombreMp3(c.titulo.replace('— continuación', '— completa'))
      let blob: Blob
      if (yaCompleta) {
        const resp = await fetch(c.urlAudio)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        blob = await resp.blob()
      } else {
        const [r1, r2] = await Promise.all([fetch(original.urlAudio), fetch(c.urlAudio)])
        if (!r1.ok || !r2.ok) throw new Error('no pude bajar los audios')
        const [b1, b2] = await Promise.all([r1.blob(), r2.blob()])
        blob = new Blob([b1, await sinId3(b2)], { type: 'audio/mpeg' })
      }
      const res = await guardarMp3EnDescargas(blob, nombre, ajustes.carpetaDescargas)
      if (!res.ok) throw new Error(res.error)
      vibrar()
      mostrar(
        yaCompleta
          ? `Suno ya devolvió la canción COMPLETA — guardada en ${res.ruta} 💾`
          : `Canción completa guardada en ${res.ruta} 💾 (si escuchás un saltito donde se unen, es normal)`,
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
  const tokenDelMotor = motor === 'suno' ? ajustes.tokenSuno : ajustes.tokenLyria
  const modeloActual = motor === 'suno' ? `Suno ${modeloSunoBonito(ajustes.modeloSuno ?? 'V4_5')}` : (MODELOS_LYRIA.find((m) => m.id === ajustes.modeloLyria)?.etiqueta ?? ajustes.modeloLyria)
  const etiquetaModelo = MODELOS_LYRIA.find((m) => m.id === ajustes.modeloLyria)?.etiqueta.split(' · ')[0] ?? 'Lyria'

  return (
    <div className="space-y-4">
      {/* Formulario */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Disc3 className="h-4 w-4" /> Nueva canción
        </h2>

        {/* Selector de motor (triple motor): Suno 🎵 o Google Lyria 🎹 */}
        <div
          role="tablist"
          aria-label="Motor de música"
          className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <button
            type="button"
            role="tab"
            aria-selected={motor === 'suno'}
            onClick={() => setMotor('suno')}
            className={`flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
              motor === 'suno'
                ? 'bg-white text-acento shadow-sm dark:bg-neutral-800'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            🎵 Suno
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={motor === 'lyria'}
            onClick={() => setMotor('lyria')}
            className={`flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
              motor === 'lyria'
                ? 'bg-white text-acento shadow-sm dark:bg-neutral-800'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            <Piano className="h-4 w-4" /> Google Lyria
          </button>
        </div>

        {!tokenDelMotor ? (
          motor === 'suno' ? (
            <EmptyState
              icono={<Music2 className="h-7 w-7" />}
              titulo="Falta tu clave de Suno"
              descripcion="Claude ya escribe las letras; para convertirlas en canción necesitás el segundo motor: tu clave de Suno API (se configura una vez en Ajustes, igual que el token de Claude). Mientras tanto, desde cualquier letra guardada podés usar «Probar gratis en suno.com» — 50 créditos diarios con tu cuenta Google."
              accion={<Boton onClick={() => irA('ajustes')}>Ir a Ajustes</Boton>}
            />
          ) : (
            <EmptyState
              icono={<Piano className="h-7 w-7" />}
              titulo="Falta tu API key de Google"
              descripcion="Lyria es el motor alternativo: la misma cuenta Google de tu Firebase, con API key de Google AI Studio (aistudio.google.com). Útil cuando Suno se queda sin créditos — cambiás de motor y seguís creando."
              accion={<Boton onClick={() => irA('ajustes')}>Ir a Ajustes</Boton>}
            />
          )
        ) : (
          <div className="space-y-3">
            {letras.length > 0 && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  Letra de tu biblioteca
                </span>
                <select value={letraId} onChange={(e) => elegirLetra(e.target.value)} className={claseInput}>
                  <option value="">— pegar / escribir otra letra —</option>
                  {letras.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.titulo}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!instrumental && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  Letra — editá lo que quieras
                </span>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={'[Verso 1]\nLa noche en Lima no me deja dormir…\n\n[Coro]\n…'}
                  rows={8}
                  className="min-h-[150px] w-full resize-y rounded-xl border border-neutral-300 bg-transparent p-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Título</span>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} placeholder="Mi canción" className={claseInput} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Modelo</span>
                <input value={modeloActual} readOnly className={`${claseInput} opacity-60`} />
              </label>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                Estilo — tocá las etiquetas de abajo o escribí lo que quieras
              </span>
              <div className="relative">
                <input
                  value={estilo}
                  onChange={(e) => setEstilo(e.target.value)}
                  maxLength={200}
                  placeholder="rock, punk, enérgica, voz masculina, 120 bpm"
                  className={`${claseInput} pr-20`}
                />
                {estilo && (
                  <button
                    type="button"
                    onClick={() => setEstilo('')}
                    title="Vaciar el estilo"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[10px] font-bold text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-acento dark:hover:bg-neutral-800"
                  >
                    🧹 limpiar
                  </button>
                )}
              </div>
            </div>

            {/* 🎛️ v0.7.0 — ESTUDIO DE ESTILO: géneros + energía +
                voz + instrumentos + tempo. Todo lo que tocás se suma
                (o quita) del campo estilo de arriba. Los grupos de
                géneros se pliegan para no eternizar el formulario. */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Armar el estilo <span className="font-medium normal-case">(tocá para sumar ✓ o quitar)</span>
              </p>
              {GRUPOS_TAGS_ESTILO.map((g, i) => {
                const activos = g.tags.filter((t) => partesEstilo.includes(t.toLowerCase())).length
                return (
                  <details
                    key={g.titulo}
                    open={i === 0}
                    className="group rounded-xl border border-neutral-200 dark:border-neutral-800"
                  >
                    <summary className="flex cursor-pointer select-none list-none items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 [&::-webkit-details-marker]:hidden">
                      <span>{g.titulo}</span>
                      <span className="flex items-center gap-1.5">
                        {activos > 0 && (
                          <span className="rounded-full bg-acento/15 px-1.5 py-0.5 text-[10px] font-bold text-acento">
                            {activos} ✓
                          </span>
                        )}
                        <span className="text-neutral-400 transition-transform group-open:rotate-90">▸</span>
                      </span>
                    </summary>
                    <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 px-3 py-2.5 dark:border-neutral-800/60">
                      {g.tags.map((t) => {
                        const activo = partesEstilo.includes(t.toLowerCase())
                        return (
                          <button
                            key={t}
                            type="button"
                            aria-pressed={activo}
                            onClick={() => alternarTag(t)}
                            className={claseChip(activo)}
                          >
                            {activo ? `✓ ${t}` : t}
                          </button>
                        )
                      })}
                    </div>
                  </details>
                )
              })}

              {/* 🎚️ Energía y carácter: se suman las que quieras. */}
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400/80">
                  Energía y carácter <span className="font-medium normal-case">(enérgica, tranquila…)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ENERGIAS_ESTILO.map((e) => {
                    const activo = partesEstilo.includes(e.toLowerCase())
                    return (
                      <button key={e} type="button" aria-pressed={activo} onClick={() => alternarTag(e)} className={claseChip(activo)}>
                        {activo ? `✓ ${e}` : e}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 🎤 Voz: EXCLUSIVA — elegir una quita la otra. */}
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400/80">
                  Voz <span className="font-medium normal-case">(una sola)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {VOZ_CANTANTE.map((v) => {
                    const activo = vozActiva === v
                    return (
                      <button key={v} type="button" aria-pressed={activo} onClick={() => fijarVoz(v)} className={claseChip(activo)}>
                        {activo ? `✓ ${v}` : v}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 🎻 Instrumentos protagonistas: se suman varios. */}
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400/80">
                  Instrumentos protagonistas <span className="font-medium normal-case">(se suman)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {INSTRUMENTOS_ESTILO.map((ins) => {
                    const activo = partesEstilo.includes(ins.toLowerCase())
                    return (
                      <button
                        key={ins}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => alternarTag(ins)}
                        className={claseChip(activo)}
                      >
                        {activo ? `✓ ${ins}` : ins}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ⏱️ Tempo: EXCLUSIVO — agrega el BPM al estilo. */}
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400/80">
                  Tempo <span className="font-medium normal-case">(uno solo)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPOS_ESTILO.map((t) => {
                    const activo = partesEstilo.includes(t.tag)
                    return (
                      <button
                        key={t.etiqueta}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => fijarTempo(t.tag)}
                        className={claseChip(activo)}
                      >
                        {activo ? `✓ ${t.etiqueta}` : t.etiqueta}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ⏱️ v0.8.0 — DURACIÓN: la causa raíz del corte era que
                Suno elegía solo la longitud y en letras largas no le
                alcanzaba para cantar todo. Ahora se le dice CUÁNTO
                tiene que durar (docs: 10–360 s, solo modelos V6/V5_5). */}
            {motor === 'suno' &&
              (modeloSunoSoportaDuracion(ajustes.modeloSuno ?? 'V6') ? (
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Duración <span className="font-medium normal-case">(que la letra alcance ENTERA)</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      aria-pressed={duracion === 'auto'}
                      onClick={() => setDuracion('auto')}
                      className={claseChip(duracion === 'auto')}
                    >
                      {duracion === 'auto' ? '✓ ' : ''}Auto — Suno decide
                    </button>
                    <button
                      type="button"
                      aria-pressed={duracion === 'letra'}
                      onClick={() => setDuracion('letra')}
                      className={claseChip(duracion === 'letra')}
                    >
                      {duracion === 'letra' ? '✓ ' : ''}⏱ Ajustada a la letra
                    </button>
                    {[120, 180, 240, 300, 360].map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={duracion === s}
                        onClick={() => setDuracion(s)}
                        className={claseChip(duracion === s)}
                      >
                        {duracion === s ? '✓ ' : ''}
                        {formatoDuracion(s)}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">
                    {duracion === 'auto'
                      ? 'Suno decide la longitud (como siempre fue) — ojo: en letras largas suele quedarse corto.'
                      : duracion === 'letra'
                        ? estimacion
                          ? `Tu letra pide ≈ ${formatoDuracion(estimacion.capada ? estimacion.cruda : estimacion.seg)}${
                              estimacion.capada
                                ? ' — más que el máximo de la API (6:00): usaré 6:00 y si aún se corta, completala con ⏩ Extender'
                                : ' y Suno canta la letra entera dentro de ese tiempo'
                            }.`
                          : 'Elegí o pegá una letra y calculo los segundos que necesita para cantarse entera.'
                        : `Fijada en ${formatoDuracion(duracion as number)} — Suno acomoda el canto a esa duración.`}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-neutral-400">
                  Tu modelo ({modeloSunoBonito(ajustes.modeloSuno ?? 'V4_5')}) no soporta duración fija — pasate a V6 en
                  Ajustes para que la letra alcance entera.
                </p>
              ))}

            {/* Recetas completas (género + instrumentos + BPM): tocar
                una REEMPLAZA el estilo entero. */}
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Recetas rápidas <span className="font-medium normal-case">(reemplazan el estilo)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ESTILOS_RAPIDOS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEstilo(e)}
                    title={e}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      estilo === e
                        ? 'border-acento bg-acento text-white'
                        : 'border-neutral-200 bg-transparent text-neutral-500 hover:border-acento/60 dark:border-neutral-700 dark:text-neutral-400'
                    }`}
                  >
                    {e.split(',')[0]}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={instrumental}
              onClick={() => setInstrumental((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5 text-left dark:border-neutral-800"
            >
              <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                🎛️ Solo instrumental (sin voz)
              </span>
              <span
                className={`relative h-6 w-11 rounded-full transition-colors ${instrumental ? 'bg-acento' : 'bg-neutral-300 dark:bg-neutral-700'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${instrumental ? 'left-[22px]' : 'left-0.5'}`}
                />
              </span>
            </button>

            <Boton className="w-full" icono={<Wand2 className="h-4 w-4" />} onClick={generar} cargando={cargando}>
              {cargando
                ? motor === 'lyria'
                  ? 'Lyria está componiendo… (hasta 3 min)'
                  : 'Enviando a Suno…'
                : motor === 'lyria'
                  ? `Generar con ${etiquetaModelo}`
                  : 'Generar música'}
            </Boton>
            <p className="text-center text-[11px] text-neutral-400">
              {motor === 'suno'
                ? 'Cada pedido crea 2 versiones · 1 a 3 min (más en horas pico) · modelo ' + modeloSunoBonito(ajustes.modeloSuno ?? 'V4_5')
                : 'Lyria devuelve la canción completa · requiere billing en Google AI Studio'}
            </p>
            {motor === 'suno' && creditos !== null && (
              <p className="flex items-center justify-center gap-1 text-center text-[11px] text-neutral-400">
                <button
                  type="button"
                  onClick={() => void actualizarCreditos()}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 hover:text-acento"
                  title="Tocá para refrescar"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
                Créditos en sunoapi.org:
                <span className="font-bold text-neutral-600 dark:text-neutral-300">{creditos}</span>
              </p>
            )}
            {/* ⚡ Atajo a la cola oficial (v0.6.3): sin esperar a que una
                tarjeta se quede trabada — copia la letra y abre suno.com. */}
            {motor === 'suno' && (
              <Boton
                variante="fantasma"
                tamano="sm"
                className="w-full"
                icono={<Rocket className="h-3.5 w-3.5" />}
                onClick={() => void urgenteSunoCom()}
              >
                ⚡ Urgente: hacerla por suno.com — cola oficial
              </Boton>
            )}
          </div>
        )}
      </section>

      {/* Biblioteca de canciones */}
      <section aria-label="Biblioteca de canciones">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            {canciones.length} {canciones.length === 1 ? 'canción' : 'canciones'}
            {generando > 0 && <span className="ml-2 text-acento">· {generando} en el horno</span>}
          </h3>
          {canciones.length > 0 && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-acento"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refrescar
            </button>
          )}
        </div>

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
            icono={<Disc3 className="h-7 w-7" />}
            titulo="Todavía no hay canciones"
            descripcion="Elegí una letra de tu biblioteca, definí el estilo y elegí motor: Suno (2 versiones por pedido) o Google Lyria (canción completa de una). Claude la escribió, el motor que elijas la canta."
          />
        ) : (
          <ul className="space-y-2.5">
            {canciones.map((c) => {
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
                      <p className="min-w-0 truncate font-semibold text-neutral-900 dark:text-white">{c.titulo}</p>
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
                      {c.motor === 'lyria' ? '🎹 Lyria' : c.continuacionDe ? '⏩ continuación' : '🎵 Suno'} · {c.estilo}
                      {c.duracionSeg ? ` · ${formatoDuracion(c.duracionSeg)}` : ''}
                      {c.instrumental ? ' · instrumental' : ''}
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
                                  de este pedido — mirá el contador 💰 de arriba. Podés quitar la tarjeta sin miedo, o hacerla ya
                                  gratis en la cola oficial 👇
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
                    {c.estado === 'lista' && <Reproductor cancion={c} />}
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
                      MP3
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
                {c.estado !== 'lista' && (
                  <Boton variante="fantasma" tamano="sm" className="mt-2 w-full" icono={<Trash2 className="h-3.5 w-3.5" />} onClick={() => borrar(c.id)}>
                    {muerta ? 'Quitar la tarjeta caída' : 'Quitar de la lista'}
                  </Boton>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Nota de motores */}
      {canciones.length === 0 && (tokenDelMotor || ajustes.tokenLyria) && (
        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-neutral-400">
          <Sparkles className="h-3 w-3" /> Motor de música doble: Suno 🎵 o Google Lyria 🎹 — cambiás cuando quieras
        </p>
      )}

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
    </div>
  )
}
