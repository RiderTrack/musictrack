import { useEffect, useRef, useState } from 'react'
import { Disc3, Library, Music2, Piano, RefreshCw, Rocket, Wand2 } from 'lucide-react'
import { leerAjustes, leer, borrarClave } from '@/core/storage/almacenamiento'
import { guardarAudio } from '@/core/storage/audio'
import { agregarCanciones, EVENTO_CANCIONES, leerCanciones } from '@/core/storage/canciones'
import {
  creditosRestantes,
  generarMusica,
  LIMITE_LETRA_SUNO,
  modeloSunoSoportaDuracion,
  recortarLetraParaSuno,
  type MotorSuno,
} from '@/core/ai/suno'
import { pedirPermisoNotificaciones, programarRecordatorio } from '@/core/notificaciones/notificaciones'
import { generarMusicaLyria, armarPromptLyria, type MotorLyria } from '@/core/ai/lyria'
import { Boton } from '@/components/ui/Boton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { vibrar, abrirURL, copiarTexto } from '@/core/natives/plataforma'
import {
  ENERGIAS_ESTILO,
  FAMILIAS_RECETAS,
  GRUPOS_INSTRUMENTOS_ESTILO,
  GRUPOS_TAGS_ESTILO,
  INSTRUMENTOS_ESTILO,
  MODELOS_LYRIA,
  PRODUCCION_ESTILO,
  TEMPOS_ESTILO,
  VOZ_CANTANTE,
  descriptoresDeArtistas,
  estiloConInspiracion,
  modeloSunoBonito,
  retratoDeArtista,
  type Cancion,
  type FamiliaRecetas,
  type Letra,
  type MotorMusica,
  type PestannaId,
  type RecetaEstilo,
} from '@/types'

// ═══════════════════════════════════════════════════════════
// 🎧 MÚSICA — CREAR (v0.9.0): esta pestaña es el ESTUDIO de
// creación. Elegí una letra de la biblioteca (o pegá una), definí
// el estilo con el estudio plegable y elegí motor:
//   🎵 Suno — 2 versiones por pedido, polling en vivo (API paga)
//   🎹 Google Lyria — canción o clip de 30s, con tu API key de
//      Google AI Studio (la misma cuenta Google del Firebase)
// Las canciones TERMINADAS viven en la pestaña 📚 Biblioteca.
// ═══════════════════════════════════════════════════════════

const CLAVE_LETRA_A_MUSICALIZAR = 'letraMusicalizar'

/** Chip del estudio de estilo (v0.7.0): mismo look para géneros,
 * energía, voz, instrumentos, tempo y producción. */
function claseChip(activo: boolean): string {
  return `rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
    activo
      ? 'border-acento bg-acento/15 text-acento'
      : 'border-neutral-200 bg-transparent text-neutral-500 hover:border-acento/60 dark:border-neutral-700 dark:text-neutral-400'
  }`
}

const claseInput =
  'h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors focus:border-acento dark:border-neutral-700'

/** v0.9.0 — GRUPO PLEGABLE de tags (el pedido del usuario: que
 * TODO el estudio se pliegue con su flechita, como los géneros,
 * para no acumular kilómetros de chips). Muestra cuántos tags del
 * grupo están activos («3 ✓») para que nada quede perdido adentro. */
function GrupoPlegable({
  titulo,
  nota,
  activos,
  abierta = false,
  children,
}: {
  titulo: string
  nota?: string
  activos: number
  abierta?: boolean
  children: React.ReactNode
}) {
  return (
    <details open={abierta} className="group rounded-xl border border-neutral-200 dark:border-neutral-800">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 [&::-webkit-details-marker]:hidden">
        <span>
          {titulo}
          {nota && <span className="ml-1.5 font-medium normal-case tracking-normal text-neutral-400">· {nota}</span>}
        </span>
        <span className="flex items-center gap-1.5">
          {activos > 0 && (
            <span className="rounded-full bg-acento/15 px-1.5 py-0.5 text-[10px] font-bold text-acento">{activos} ✓</span>
          )}
          <span className="text-neutral-400 transition-transform group-open:rotate-90">▸</span>
        </span>
      </summary>
      <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 px-3 py-2.5 dark:border-neutral-800/60">{children}</div>
    </details>
  )
}

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

function formatoDuracion(seg?: number): string {
  if (!seg || seg <= 0) return ''
  const m = Math.floor(seg / 60)
  const s = Math.round(seg % 60)
  return `${m}:${String(s).padStart(2, '0')}`
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
  // 🍱 v0.14.0 — familia de recetas activa en el estudio (Cumbia,
  // Salsa, Retro 80s/90s…): arranca en la que matchea el estilo
  // actual (si vino de una letra) o en la primera.
  const [familiaReceta, setFamiliaReceta] = useState(() => {
    const i = FAMILIAS_RECETAS.findIndex((f) => f.recetas.some((r) => r.estilo === estilo))
    return i >= 0 ? i : 0
  })
  // 🎯 v0.9.1 — artistas que inspiran esta canción: se precargan
  // con la letra (si Claude la escribió inspirada) y su retrato
  // sonoro se suma al estilo al generar (Suno no acepta nombres).
  const [artistas, setArtistas] = useState('')
  const artistasEscritos = artistas
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
  const esenciaInspiracion = descriptoresDeArtistas(artistas)
  const sinRetrato = artistasEscritos.filter((a) => !retratoDeArtista(a))
  const [instrumental, setInstrumental] = useState(false)
  const [cargando, setCargando] = useState(false)

  // ⏱️ v0.8.0 — DURACIÓN: 'auto' (Suno decide, como siempre),
  // 'letra' (se calcula según la letra para que alcance entera —
  // el fix del corte) o un número fijo de segundos (2 a 6 min).
  const [duracion, setDuracion] = useState<'auto' | 'letra' | number>('letra')
  const estimacion = duracion === 'letra' && !instrumental ? estimarDuracion(texto) : null

  // 📚 v0.9.0 — las canciones ya NO viven acá: van a la Biblioteca.
  // Acá solo contamos cuántas están en el horno para ofrecer el
  // salto, y festejamos con un toast si alguna llega mientras el
  // usuario está creando (la vista Biblioteca hace lo mismo cuando
  // está abierta — nunca se pisan porque las pestañas se desmontan).
  const [enHorno, setEnHorno] = useState(() => leerCanciones().filter((c) => c.estado === 'generando').length)
  const previasRef = useRef<Cancion[]>(leerCanciones())
  useEffect(() => {
    function alActualizar(e: Event) {
      const nuevas = (e as CustomEvent<Cancion[]>).detail
      const previas = previasRef.current
      nuevas
        .filter((n) => n.estado === 'lista' && previas.find((p) => p.id === n.id)?.estado === 'generando')
        .forEach((n) => {
          vibrar()
          mostrar(`¡«${n.titulo}»${n.version ? ` (versión ${n.version})` : ''} lista! 🎧 — la encontrás en 📚 Biblioteca`, 'ok', 5000)
        })
      previasRef.current = nuevas
      setEnHorno(nuevas.filter((c) => c.estado === 'generando').length)
    }
    window.addEventListener(EVENTO_CANCIONES, alActualizar)
    return () => window.removeEventListener(EVENTO_CANCIONES, alActualizar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      setArtistas(letra.artistas ?? '')
      setEstilo(estiloDesdeLetra(letra))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function elegirLetra(id: string) {
    setLetraId(id)
    const letra = letras.find((l) => l.id === id)
    if (letra) {
      setTexto(letra.texto)
      setTitulo(letra.titulo)
      setArtistas(letra.artistas ?? '')
      setEstilo(estiloDesdeLetra(letra))
    } else {
      setTexto('')
      setTitulo('')
      setArtistas('')
      setEstilo('')
    }
  }

  /** v0.7.0 — el estilo inicial al llegar una letra de la
   * biblioteca: género + mood + voz (si la letra la definió).
   * v0.9.1 — y la ESENCIA de los artistas que la inspiraron
   * (retrato sonoro del diccionario, no sus nombres). */
  function estiloDesdeLetra(letra: Letra): string {
    const vozTag =
      letra.voz === 'Masculina'
        ? 'voz masculina'
        : letra.voz === 'Femenina'
          ? 'voz femenina'
          : letra.voz === 'Dúo'
            ? 'dúo de voces'
            : ''
    const base = [letra.genero, letra.mood, vozTag].filter(Boolean).join(', ').toLowerCase()
    return estiloConInspiracion(base, letra.artistas).estilo
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

  // 🎚️ v0.9.0 — PRODUCCIÓN. La estrella: «A capela» APAGA todos
  // los instrumentos (queda la voz sola); y al revés, encender un
  // instrumento saca el a capela. Es un TAG de estilo — Suno lo
  // entiende solo, no hace falta escribir nada raro en la letra.
  const TAGS_PRODUCCION: string[] = PRODUCCION_ESTILO.map((p) => p.toLowerCase())
  const TAGS_INSTRUMENTOS: string[] = INSTRUMENTOS_ESTILO.map((i) => i.toLowerCase())
  const capelaActiva = partesEstilo.includes('a capela')
  function alternarProduccion(tag: string) {
    vibrar()
    const partes = estilo
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const activo = partes.some((p) => p.toLowerCase() === tag.toLowerCase())
    let nuevas = partes.filter((p) => !TAGS_PRODUCCION.includes(p.toLowerCase()))
    if (activo) {
      setEstilo(nuevas.join(', '))
      return // tocar el activo lo apaga
    }
    if (tag.toLowerCase() === 'a capela') {
      // 🔇 se apagan TODOS los instrumentos: queda la voz sola
      const antes = partes.filter((p) => TAGS_INSTRUMENTOS.includes(p.toLowerCase())).length
      nuevas = nuevas.filter((p) => !TAGS_INSTRUMENTOS.includes(p.toLowerCase()))
      if (antes > 0) mostrar(`🔇 A capela — apagué ${antes} ${antes === 1 ? 'instrumento' : 'instrumentos'}: queda la voz sola`, 'info', 4000)
    }
    setEstilo([...nuevas, tag.toLowerCase()].join(', '))
  }
  function alternarInstrumento(tag: string) {
    vibrar()
    const partes = estilo
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const activo = partes.some((p) => p.toLowerCase() === tag.toLowerCase())
    if (!activo && capelaActiva) {
      // encender un instrumento mata el a capela (no tiene sentido
      // «a capela + guitarra»): se reemplaza sin drama
      const sinCapela = partes.filter((p) => p.toLowerCase() !== 'a capela')
      setEstilo([...sinCapela, tag.toLowerCase()].join(', '))
      return
    }
    alternarTag(tag)
  }

  // 🍱 v0.14.0 — aplicar una RECETA completa: reemplaza el estilo
  // entero con el combo armado (género + todos los instrumentos +
  // carácter + tempo). Como las partes usan los mismos nombres que
  // los chips de abajo, los instrumentos se encienden solos y Rudy
  // puede sumar o quitar lo que quiera a partir de ahí.
  function aplicarReceta(familia: FamiliaRecetas, receta: RecetaEstilo) {
    vibrar()
    setEstilo(receta.estilo)
    const familiaActiva = FAMILIAS_RECETAS.findIndex((f) => f.recetas.some((r) => r.estilo === estilo))
    if (familiaActiva >= 0 && familiaActiva !== familiaReceta) setFamiliaReceta(familiaActiva)
    mostrar(
      `🍱 ${familia.titulo} · ${receta.etiqueta} — receta aplicada. Sumá o quitá lo que quieras abajo`,
      'ok',
      4000,
    )
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
    // 🎯 v0.9.1 — la esencia de los artistas se suma al estilo
    // (tope 200 chars de Suno, sin repetir tags) y se avisa.
    const inspirada = estiloConInspiracion(estilo.trim() || 'pop latino', artistas)
    const estiloLimpio = inspirada.estilo
    if (inspirada.agregados.length) {
      mostrar(
        `🎯 Sumé la esencia de tu inspiración al estilo (${inspirada.agregados.length} ${
          inspirada.agregados.length === 1 ? 'toque' : 'toques'
        }) — los nombres no van a Suno, va su esencia`,
        'info',
        5000,
      )
    }
    // 🩹 v0.8.1 — Suno rechaza letras de más de 5.000 caracteres.
    // v0.9.0 — antes de recortar se LIMPIA el espacio de más
    // (espacios dobles, líneas con aire, 3+ saltos): varias letras
    // que rebotaban por el tope entran ENTERAS así.
    const envio = recortarLetraParaSuno(textoLimpio)
    if (envio.recortada) {
      mostrar(
        `Tu letra tiene ${textoLimpio.length.toLocaleString('es')} caracteres y Suno acepta hasta 5.000 — mando hasta la última estrofa completa; el final lo completás con ⏩ Extender`,
        'info',
        6500,
      )
    } else if (envio.normalizada) {
      mostrar('Le acomodé los espacios de más a la letra — ahora entra entera en Suno ✔', 'info', 4000)
    }
    // Duración que se manda a la API: 'letra' calcula según las
    // palabras (en instrumental no hay letra que ajustar → auto).
    const duracionSeg =
      duracion === 'auto' || instrumental
        ? undefined
        : duracion === 'letra'
          ? (estimarDuracion(envio.letra)?.seg ?? undefined)
          : duracion
    vibrar()
    setCargando(true)
    try {
      const motorSuno: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
      const pistas = await generarMusica(motorSuno, {
        letra: envio.letra,
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
      // 📚 directo a la Biblioteca (v0.9.0)
      agregarCanciones(nuevas)
      void actualizarCreditos()
      // 🔔 v0.5.0: avisar cuando llegue, aunque estés en otra pestaña o
      // cierres la app — el recordatorio lo agenda el sistema operativo.
      void (async () => {
        if (await pedirPermisoNotificaciones()) {
          for (const n of nuevas) if (n.taskId) void programarRecordatorio(n.taskId, tituloLimpio)
        }
      })()
      mostrar(`${nuevas.length} ${nuevas.length === 1 ? 'versión' : 'versiones'} en el horno 🔥 — las seguís en 📚 Biblioteca`, 'ok', 5000)
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
    // 🎯 v0.9.1 — misma inspiración para Lyria (va en el prompt)
    const inspirada = estiloConInspiracion(estilo.trim() || 'pop latino', artistas)
    const estiloLimpio = inspirada.estilo
    if (inspirada.agregados.length) {
      mostrar(
        `🎯 Sumé la esencia de tu inspiración al estilo (${inspirada.agregados.length} ${
          inspirada.agregados.length === 1 ? 'toque' : 'toques'
        })`,
        'info',
        4500,
      )
    }
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
      agregarCanciones([nueva])
      vibrar()
      mostrar(`¡«${tituloLimpio}» lista! 🎹 — la encontrás en 📚 Biblioteca`, 'ok', 5000)
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló Lyria', 'error', 5000)
    } finally {
      setCargando(false)
    }
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
                <span className="mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  <span>Letra — editá lo que quieras</span>
                  {/* 🩹 v0.8.1 — contador del límite duro de Suno */}
                  <span
                    className={`shrink-0 text-[10px] font-bold tabular-nums ${
                      texto.length > LIMITE_LETRA_SUNO
                        ? 'text-red-500'
                        : texto.length > LIMITE_LETRA_SUNO * 0.9
                          ? 'text-amber-500'
                          : 'text-neutral-400'
                    }`}
                  >
                    {texto.length.toLocaleString('es')} / {LIMITE_LETRA_SUNO.toLocaleString('es')}
                  </span>
                </span>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={'[Verso 1]\nLa noche en Lima no me deja dormir…\n\n[Coro]\n…'}
                  rows={8}
                  className="min-h-[150px] w-full resize-y rounded-xl border border-neutral-300 bg-transparent p-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
                />
                {texto.length > LIMITE_LETRA_SUNO && (
                  <span className="mt-1 block text-[11px] font-semibold leading-relaxed text-red-500">
                    ⚠ Pasás el tope de Suno ({LIMITE_LETRA_SUNO.toLocaleString('es')} caracteres): al generar primero limpio los espacios de más y si aún no alcanza, mando hasta la última estrofa completa — el final lo completás con ⏩ Extender
                  </span>
                )}
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

            {/* 🎯 v0.9.1 — INSPIRACIÓN POR ARTISTAS: su ESENCIA se
                suma al estilo al generar (Suno no acepta nombres —
                viaja el retrato sonoro traducido del diccionario). */}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                🎯 Inspiración de artistas <span className="font-normal text-neutral-400">(opcional)</span>
              </span>
              <input
                value={artistas}
                onChange={(e) => setArtistas(e.target.value)}
                maxLength={120}
                placeholder="Ej: Stratovarius, Luca Turilli, LiSA…"
                className={claseInput}
              />
              {artistasEscritos.length > 0 && (
                <span className="mt-1 block text-[11px] leading-relaxed">
                  {esenciaInspiracion.length > 0 && (
                    <span className="block text-emerald-600 dark:text-emerald-400">
                      ✓ Su esencia va al estilo: <b>{esenciaInspiracion.slice(0, 5).join(' · ')}</b>
                      {esenciaInspiracion.length > 5 ? '…' : ''}
                    </span>
                  )}
                  {sinRetrato.length > 0 && (
                    <span className="block text-neutral-400">
                      A {sinRetrato.join(', ')} no lo{sinRetrato.length === 1 ? '' : 's'} tengo retratado{sinRetrato.length === 1 ? '' : 's'} —
                      igual probá: si la letra vino de Crear, Claude ya tomó su esencia; o describí su sonido a mano en el
                      estilo.
                    </span>
                  )}
                </span>
              )}
            </label>

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

            {/* 🎛️ v0.9.0 — ESTUDIO DE ESTILO PLEGABLE (pedido del
                usuario): géneros, energía, voz, instrumentos, tempo,
                producción y recetas ahora TODOS en carpetas con
                flechita — el formulario queda corto y ordenado, y el
                badge «N ✓» dice si hay algo activo adentro. */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Armar el estilo <span className="font-medium normal-case">(desplegá lo que quieras tocar)</span>
              </p>

              {/* 🍱 v0.14.0 — RECETAS POR ESTILO (el «ajustes rápidos
                  que sí arma todo» pedido por Rudy): elegí una FAMILIA
                  y tocá una receta — reemplaza el estilo con el combo
                  COMPLETO (todos los instrumentos + tempo + carácter)
                  y los chips de abajo se encienden solos para seguir
                  ajustando a mano. Va PRIMERO en el estudio. */}
              <GrupoPlegable
                titulo="🍱 Recetas por estilo"
                nota="elegí un estilo y te lo armo completo"
                abierta
                activos={FAMILIAS_RECETAS.some((f) => f.recetas.some((r) => r.estilo === estilo)) ? 1 : 0}
              >
                <div className="flex w-full flex-wrap gap-1.5">
                  {FAMILIAS_RECETAS.map((f, i) => (
                    <button
                      key={f.titulo}
                      type="button"
                      aria-pressed={familiaReceta === i}
                      onClick={() => {
                        vibrar()
                        setFamiliaReceta(i)
                      }}
                      className={claseChip(familiaReceta === i)}
                    >
                      {familiaReceta === i ? `✓ ${f.icono} ${f.titulo}` : `${f.icono} ${f.titulo}`}
                    </button>
                  ))}
                </div>
                <div className="grid w-full grid-cols-2 gap-1.5">
                  {FAMILIAS_RECETAS[familiaReceta].recetas.map((r) => {
                    const activa = estilo === r.estilo
                    return (
                      <button
                        key={r.etiqueta}
                        type="button"
                        onClick={() => aplicarReceta(FAMILIAS_RECETAS[familiaReceta], r)}
                        className={`rounded-xl border p-2 text-left transition-colors ${
                          activa
                            ? 'border-acento bg-acento/10'
                            : 'border-neutral-200 bg-transparent hover:border-acento/60 dark:border-neutral-700'
                        }`}
                      >
                        <span className="block text-[11px] font-bold leading-tight text-neutral-700 dark:text-neutral-200">
                          {activa ? '✓ ' : ''}
                          {r.etiqueta}
                        </span>
                        <span className="mt-0.5 block text-[9px] leading-snug text-neutral-400">{r.detalle}</span>
                      </button>
                    )
                  })}
                </div>
              </GrupoPlegable>

              {GRUPOS_TAGS_ESTILO.map((g, i) => (
                <GrupoPlegable key={g.titulo} titulo={g.titulo} activos={g.tags.filter((t) => partesEstilo.includes(t.toLowerCase())).length} abierta={i === 0}>
                  {g.tags.map((t) => {
                    const activo = partesEstilo.includes(t.toLowerCase())
                    return (
                      <button key={t} type="button" aria-pressed={activo} onClick={() => alternarTag(t)} className={claseChip(activo)}>
                        {activo ? `✓ ${t}` : t}
                      </button>
                    )
                  })}
                </GrupoPlegable>
              ))}

              <GrupoPlegable
                titulo="Energía y carácter"
                nota="se suman varias"
                activos={ENERGIAS_ESTILO.filter((e) => partesEstilo.includes(e.toLowerCase())).length}
              >
                {ENERGIAS_ESTILO.map((e) => {
                  const activo = partesEstilo.includes(e.toLowerCase())
                  return (
                    <button key={e} type="button" aria-pressed={activo} onClick={() => alternarTag(e)} className={claseChip(activo)}>
                      {activo ? `✓ ${e}` : e}
                    </button>
                  )
                })}
              </GrupoPlegable>

              <GrupoPlegable titulo="Voz" nota="una sola" activos={vozActiva !== 'Cualquiera' ? 1 : 0}>
                {VOZ_CANTANTE.map((v) => {
                  const activo = vozActiva === v
                  return (
                    <button key={v} type="button" aria-pressed={activo} onClick={() => fijarVoz(v)} className={claseChip(activo)}>
                      {activo ? `✓ ${v}` : v}
                    </button>
                  )
                })}
              </GrupoPlegable>

              {GRUPOS_INSTRUMENTOS_ESTILO.map((g) => (
                <GrupoPlegable
                  key={g.titulo}
                  titulo={`🎻 ${g.titulo}`}
                  nota="se suman"
                  activos={g.tags.filter((t) => partesEstilo.includes(t.toLowerCase())).length}
                >
                  {g.tags.map((ins) => {
                    const activo = partesEstilo.includes(ins.toLowerCase())
                    return (
                      <button
                        key={ins}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => alternarInstrumento(ins)}
                        className={claseChip(activo)}
                      >
                        {activo ? `✓ ${ins}` : ins}
                      </button>
                    )
                  })}
                </GrupoPlegable>
              ))}

              <GrupoPlegable titulo="Tempo" nota="uno solo" activos={TEMPOS_ESTILO.filter((t) => partesEstilo.includes(t.tag)).length}>
                {TEMPOS_ESTILO.map((t) => {
                  const activo = partesEstilo.includes(t.tag)
                  return (
                    <button key={t.etiqueta} type="button" aria-pressed={activo} onClick={() => fijarTempo(t.tag)} className={claseChip(activo)}>
                      {activo ? `✓ ${t.etiqueta}` : t.etiqueta}
                    </button>
                  )
                })}
              </GrupoPlegable>

              <GrupoPlegable
                titulo="🎚️ Producción"
                nota={capelaActiva ? 'A CAPELA ACTIVO — voz sola' : 'A capela apaga los instrumentos'}
                activos={PRODUCCION_ESTILO.filter((p) => partesEstilo.includes(p.toLowerCase())).length}
              >
                {PRODUCCION_ESTILO.map((p) => {
                  const activo = partesEstilo.includes(p.toLowerCase())
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => alternarProduccion(p)}
                      className={claseChip(activo)}
                    >
                      {activo ? `✓ ${p}` : p}
                    </button>
                  )
                })}
              </GrupoPlegable>

              {/* (las recetas de familia viven AHORA ARRIBA del
                  estudio: «Recetas por estilo», lo primero que se ve) */}
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

            {/* 📚 v0.9.0 — el salto a la Biblioteca: las canciones ya
                no se acumulan acá; si hay algo en el horno, un botón
                te lleva a verlo cocinarse (y a escuchar lo listo). */}
            {enHorno > 0 && (
              <Boton
                variante="fantasma"
                tamano="sm"
                className="w-full"
                icono={<Library className="h-3.5 w-3.5" />}
                onClick={() => irA('biblioteca')}
              >
                📚 {enHorno} {enHorno === 1 ? 'canción en el horno' : 'canciones en el horno'} — ver la Biblioteca
              </Boton>
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
    </div>
  )
}
