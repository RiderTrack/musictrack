import { useEffect, useRef, useState } from 'react'
import { Disc3, Download, Loader2, Music2, Piano, RefreshCw, Rocket, Share2, Skull, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { leerAjustes, leer, guardar, borrarClave } from '@/core/storage/almacenamiento'
import { guardarAudio, leerAudio, borrarAudio } from '@/core/storage/audio'
import { guardarMp3EnDescargas, nombreMp3 } from '@/core/natives/descargas'
import { generarMusica, consultarPistas, creditosRestantes, type MotorSuno } from '@/core/ai/suno'
import { aplicarGrupo, EVENTO_CANCIONES } from '@/core/ai/seguimiento'
import { pedirPermisoNotificaciones, programarRecordatorio } from '@/core/notificaciones/notificaciones'
import { generarMusicaLyria, armarPromptLyria, type MotorLyria } from '@/core/ai/lyria'
import { Boton } from '@/components/ui/Boton'
import { EmptyState } from '@/components/ui/EmptyState'
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
                      {c.motor === 'lyria' ? '🎹 Lyria' : '🎵 Suno'} · {c.estilo}
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
    </div>
  )
}
