import { useEffect, useRef, useState } from 'react'
import { Disc3, Library, Music2, Piano, RefreshCw, Rocket, Wand2 } from 'lucide-react'
import { leerAjustes, leer, borrarClave } from '@/core/storage/almacenamiento'
import { guardarAudio } from '@/core/storage/audio'
import { agregarCanciones, EVENTO_CANCIONES, leerCanciones } from '@/core/storage/canciones'
import {
  borrarPrompt,
  carpetasDePrompts,
  EVENTO_PROMPTS,
  guardarPrompt,
  leerPrompts,
  type PromptGuardado,
} from '@/core/storage/prompts'
import {
  creditosRestantes,
  esEstiloCriolla,
  generarMusica,
  limiteEstiloSuno,
  LIMITE_LETRA_SUNO,
  modeloSunoSoportaDuracion,
  modeloSunoSoportaVoz,
  negativosAntiRanchera,
  recetaConVoz,
  recetaContenidaEn,
  recortarLetraParaSuno,
  type MotorSuno,
  type VozPersonal,
} from '@/core/ai/suno'
import { pedirPermisoNotificaciones, programarRecordatorio } from '@/core/notificaciones/notificaciones'
import { generarMusicaLyria, armarPromptLyria, type MotorLyria } from '@/core/ai/lyria'
import { Boton } from '@/components/ui/Boton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { vibrar, abrirURL, copiarTexto } from '@/core/natives/plataforma'
import {
  ENERGIAS_ESTILO,
  FAMILIAS_RECETAS,
  GRUPOS_INSTRUMENTOS_ESTILO,
  GRUPOS_TAGS_ESTILO,
  INSTRUMENTOS_ESTILO,
  MODELOS_LYRIA,
  PERFILES_VOZ_ESTILO,
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

// ═══════════════════════════════════════════════════════════
// 🧬 v0.15.2 — PROMPT AVANZADO DE ESTILO (pedido de Rudy): su
// vals criollo sonaba a ranchera mexicana porque el estilo corto
// («vals criollo, cajón…») le deja a Suno demasiado margen. Este
// es SU prompt, acomodado al tope de 1000 de V6 — un botón lo
// precarga listo para generar.
// ═══════════════════════════════════════════════════════════
const PROMPT_CRIOLLO_EJEMPLO = [
  'Traditional Peruvian música criolla, authentic Lima vals criollo with a nostalgic cantinero bolero feeling.',
  'Old-school Peruvian rockola atmosphere, heartfelt and deeply melancholic.',
  'Distinctive Peruvian waltz rhythm in 3/4, with subtle Afro-Peruvian syncopation.',
  'Traditional criollo guitar with expressive melodic flourishes and bass bordoneos, Peruvian cajón, warm acoustic bass, melancholic accordion and subtle harp.',
  'Raw, passionate male voice with expressive vibrato, emotional voice cracks, criollo phrasing and dramatic vocal cries.',
  'Intimate, nostalgic and deeply Peruvian atmosphere, like an old neighborhood peña or cantina in Lima.',
  'Catchy sing-along chorus, natural call-and-response and short instrumental interludes.',
  'Authentic vintage Peruvian recording character.',
  'IMPORTANT: Peruvian vals criollo, NOT Mexican ranchera. No mariachi, no trumpets, no guitarrón, no Mexican banda, no norteño, no ranchera vocal phrasing, no modern pop, no reggaeton, no electronic beats.',
].join(' ')

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
  // 🧬 v0.15.2 — prompt avanzado: texto largo que REEMPLAZA el
  // estilo simple al generar (mismo lugar para letras propias o
  // de IA — lo que se musicaliza es lo que importa)
  const [promptAvanzado, setPromptAvanzado] = useState('')
  // 🍱 v0.14.0 — familia de recetas activa en el estudio (Cumbia,
  // Salsa, Retro 80s/90s…): arranca en la que matchea el estilo
  // actual (si vino de una letra) o en la primera.
  const [familiaReceta, setFamiliaReceta] = useState(() => {
    const i = FAMILIAS_RECETAS.findIndex((f) => f.recetas.some((r) => r.estilo === estilo))
    return i >= 0 ? i : 0
  })
  // 📚 v0.18.0 — FASE 15 (pedido de Rudy): BIBLIOTECA DE PROMPTS.
  // Los estilos que LE ATINAN se guardan en carpetitas por tipo de
  // música («Criolla», «Power metal»…), como las canciones — nunca
  // más se pierden. Viven en localStorage con las demás claves de
  // la app (viajan solos en el respaldo y la sync) y avisan con
  // EVENTO_PROMPTS para refrescar la lista sin recargar.
  const [prompts, setPrompts] = useState<PromptGuardado[]>(() => leerPrompts())
  const [modalGuardarAbierto, setModalGuardarAbierto] = useState(false)
  const [nombrePrompt, setNombrePrompt] = useState('')
  const [carpetaPrompt, setCarpetaPrompt] = useState('')
  const [carpetaSel, setCarpetaSel] = useState('') // '' = Todas
  const [borrarConfirmado, setBorrarConfirmado] = useState('') // id esperando el 2.º toque
  useEffect(() => {
    const alActualizar = (e: Event) => setPrompts((e as CustomEvent<PromptGuardado[]>).detail)
    window.addEventListener(EVENTO_PROMPTS, alActualizar)
    return () => window.removeEventListener(EVENTO_PROMPTS, alActualizar)
  }, [])
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
  // 🚫 v0.16.0 — FASE 13: escudo anti-ranchera. Se calcula sobre
  // lo que REALMENTE va a viajar (el prompt avanzado manda sobre
  // el estilo simple) y solo con Suno (Lyria no tiene negativeTags).
  const estiloPrevisto = promptAvanzado.trim() || estilo.trim()
  const criollaDetectada = esEstiloCriolla(estiloPrevisto)
  const negativosPrevistos =
    motor === 'suno' ? negativosAntiRanchera(estiloPrevisto, ajustes.modeloSuno) : undefined
  const [instrumental, setInstrumental] = useState(false)
  // 🎤 v0.17.0 — FASE 14: la voz personal (se crea en Ajustes →
  // «Mi voz», dos audios cortos). Con el interruptor prendido,
  // el voiceId viaja a Suno como personaId y la canción sale
  // cantada por el usuario. Solo aplica con motor Suno,
  // modelo V6 y canción cantada (no instrumental).
  const [miVoz] = useState(() => leer<VozPersonal | null>('voz_suno', null))
  const [usarMiVoz, setUsarMiVoz] = useState(false)
  const miVozAplica =
    motor === 'suno' && !!miVoz && modeloSunoSoportaVoz(ajustes.modeloSuno) && !instrumental
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
      const nuevoEstilo = estiloDesdeLetra(letra)
      setEstilo(nuevoEstilo)
      sincronizarFamilia(nuevoEstilo)
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
      const nuevoEstilo = estiloDesdeLetra(letra)
      setEstilo(nuevoEstilo)
      sincronizarFamilia(nuevoEstilo)
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
  // 👨👩 v0.18.0 — FASE 15 (pedido de Rudy): elegir la MISMA voz
  // que ya está (a veces la puso un perfil criolla — «Mezzo con
  // garra» trae «voz femenina») ya no la APAGA: antes eso apagaba
  // también el perfil y parecía que lo predeterminado se perdía.
  // Y cambiar de género retira los perfiles que cantan el opuesto
  // (completos, con aviso) para no mandar señales cruzadas a Suno.
  const TAGS_VOZ = ['voz masculina', 'voz femenina', 'dúo de voces']
  const TAGS_VOZ_HOMBRE = ['voz masculina', 'voz de tenor', 'voz de barítono', 'voz de bajo']
  const TAGS_VOZ_MUJER = ['voz femenina', 'voz de contralta', 'voz de mezzo', 'voz de soprano']
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
    if (v === 'Cualquiera') {
      setEstilo(sinVoz.join(', '))
      return
    }
    // ya está elegida (sola o viniendo de un perfil): se confirma
    // y no se desarma nada — antes esto la apagaba de sorpresa
    if (partes.some((p) => p.toLowerCase() === tag)) return
    // perfiles que cantan el género OPUESTO: se retiran completos
    const contrarias = v === 'Masculina' ? TAGS_VOZ_MUJER : v === 'Femenina' ? TAGS_VOZ_HOMBRE : []
    const perfilEnContra =
      perfilVozActivo && perfilVozActivo.tags.some((t) => contrarias.includes(t)) ? perfilVozActivo : undefined
    const base = perfilEnContra ? sinVoz.filter((p) => !perfilEnContra.tags.includes(p.toLowerCase())) : sinVoz
    if (perfilEnContra) {
      mostrar(
        `🎤 Saqué el perfil «${perfilEnContra.etiqueta}» — canta ${v === 'Masculina' ? 'femenina' : 'masculina'} y pediste voz ${v.toLowerCase()}`,
        'info',
        5000,
      )
    }
    setEstilo([...base, tag].join(', '))
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

  // 🎤 v0.16.0 — PERFIL DE VOZ CRIOLLA (FASE 13, pedido de Rudy):
  // exclusivo como el tempo — uno solo a la vez, tocar el activo lo
  // apaga. Los tags del perfil viajan al estilo y la frontera de
  // Suno los traduce (evocan el tipo de voz, no imitan a nadie).
  const TAGS_PERFILES_VOZ: string[] = PERFILES_VOZ_ESTILO.flatMap((p) => p.tags)
  const perfilVozActivo = PERFILES_VOZ_ESTILO.find((p) => p.tags.every((t) => partesEstilo.includes(t)))
  function fijarPerfilVoz(p: (typeof PERFILES_VOZ_ESTILO)[number]) {
    vibrar()
    const partes = estilo
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const sinPerfil = partes.filter((s) => !TAGS_PERFILES_VOZ.includes(s.toLowerCase()))
    if (perfilVozActivo === p) {
      setEstilo(sinPerfil.join(', '))
      return
    }
    setEstilo([...sinPerfil, ...p.tags].join(', '))
  }

  // 🍱 v0.18.0 — FASE 15: la receta que sigue APLICADA en el estilo
  // (todas sus partes presentes — ya no igualdad exacta). Alimenta
  // el ✓ del chip, el badge del grupo, la familia que se muestra y
  // la carpetita sugerida al guardar un prompt.
  const recetaVigente = (() => {
    for (const familia of FAMILIAS_RECETAS)
      for (const receta of familia.recetas)
        if (recetaContenidaEn(receta.estilo, estilo)) return { familia, receta }
    return undefined
  })()

  /** 🍱 v0.18.0 — muestra la familia de la receta que vive en el
   * estilo (cuando llega una letra o se carga un prompt guardado). */
  function sincronizarFamilia(nuevoEstilo: string) {
    const i = FAMILIAS_RECETAS.findIndex((f) => f.recetas.some((r) => recetaContenidaEn(r.estilo, nuevoEstilo)))
    if (i >= 0) setFamiliaReceta(i)
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

  // 🎤 v0.17.0 — FASE 14: alternar la voz personal. Sin voz
  // creada → lleva a Ajustes; con instrumental → lo apaga (una
  // cosa excluye a la otra); modelo viejo → avisa y no prende.
  function alternarMiVoz() {
    vibrar()
    if (!miVoz) {
      mostrar('Tu voz se crea en Ajustes → 🎤 Mi voz — dos grabaciones cortas y queda lista', 'info', 5000)
      irA('ajustes')
      return
    }
    if (!modeloSunoSoportaVoz(ajustes.modeloSuno)) {
      mostrar('Tu voz necesita el modelo V6 — cambialo en Ajustes', 'info', 4500)
      return
    }
    if (!usarMiVoz && instrumental) {
      setInstrumental(false)
      mostrar('Apagué «solo instrumental» — esta canción va cantada con tu voz 🎤', 'info', 4000)
    }
    setUsarMiVoz((v) => !v)
  }

  // 🍱 v0.14.0 — aplicar una RECETA completa: reemplaza el estilo
  // entero con el combo armado (género + todos los instrumentos +
  // carácter + tempo). Como las partes usan los mismos nombres que
  // los chips de abajo, los instrumentos se encienden solos y Rudy
  // puede sumar o quitar lo que quiera a partir de ahí.
  // 🎤 v0.18.0 — FASE 15 (pedido de Rudy): la receta ya NO se lleva
  // puesta la voz — hombre/mujer/dúo y el perfil criolla activo se
  // mantienen (antes salía «cualquiera» y había que reelegir).
  function aplicarReceta(familia: FamiliaRecetas, receta: RecetaEstilo) {
    vibrar()
    setEstilo(recetaConVoz(receta.estilo, estilo, [...TAGS_VOZ, ...TAGS_PERFILES_VOZ]))
    mostrar(
      `🍱 ${familia.titulo} · ${receta.etiqueta} — receta aplicada. Sumá o quitá lo que quieras abajo${
        vozActiva !== 'Cualquiera' || perfilVozActivo ? ' — tu voz se mantiene 🎤' : ''
      }`,
      'ok',
      4000,
    )
  }

  // 📚 v0.18.0 — FASE 15: guardar el prompt ACTUAL en la
  // biblioteca, con todo precargado — nombre según la receta
  // aplicada (o el título de la canción) y carpetita según la
  // familia de la receta (o «Criolla» si el estilo lo es).
  function abrirGuardarPrompt() {
    vibrar()
    const previsto = promptAvanzado.trim() || estilo.trim()
    if (!previsto) {
      mostrar('Armá tu estilo primero (receta, chips o a mano) y después lo guardás 💾', 'info', 4000)
      return
    }
    setNombrePrompt(
      recetaVigente?.receta.etiqueta || titulo.trim() || previsto.split(',').slice(0, 3).join(', ').slice(0, 40),
    )
    setCarpetaPrompt(recetaVigente?.familia.titulo || (esEstiloCriolla(previsto) ? 'Criolla' : ''))
    setModalGuardarAbierto(true)
  }

  function confirmarGuardarPrompt() {
    const guardado = guardarPrompt({
      nombre: nombrePrompt,
      estilo,
      avanzado: promptAvanzado.trim() || undefined,
      carpeta: carpetaPrompt,
    })
    setModalGuardarAbierto(false)
    mostrar(`💾 Guardado en «${guardado.carpeta}» — lo encontrás en 📚 Mi biblioteca de prompts`, 'ok', 4500)
  }

  /** 📖 Carga un prompt guardado en el formulario (estilo simple y
   * avanzado si lo tenía) y muestra la familia de su receta. */
  function usarPrompt(p: PromptGuardado) {
    vibrar()
    setEstilo(p.estilo)
    setPromptAvanzado(p.avanzado ?? '')
    sincronizarFamilia(p.estilo)
    setBorrarConfirmado('')
    mostrar(
      `📖 «${p.nombre}» cargado${p.avanzado ? ' (con su prompt avanzado 🧬)' : ''} — ajustá lo que quieras y generá`,
      'ok',
      4500,
    )
  }

  /** 🗑 Borrar en dos toques (como las listas): el primero arma el
   * «¿seguro?», el segundo confirma. Cualquier otro toque lo baja. */
  function quererBorrarPrompt(p: PromptGuardado) {
    vibrar()
    if (borrarConfirmado !== p.id) {
      setBorrarConfirmado(p.id)
      return
    }
    borrarPrompt(p.id)
    setBorrarConfirmado('')
    mostrar(`🗑 Prompt «${p.nombre}» borrado de «${p.carpeta}»`, 'info', 3500)
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
    // 🎤 v0.17.0 — FASE 14: si pidió su voz, que todo esté en
    // condiciones ANTES de gastar créditos (mejor un aviso claro
    // que un pedido a medias).
    if (usarMiVoz && miVoz && instrumental) {
      mostrar('🎤 «Solo instrumental» no tiene voz — apagalo para cantar con la tuya', 'info', 4500)
      return
    }
    if (usarMiVoz && miVoz && !modeloSunoSoportaVoz(ajustes.modeloSuno)) {
      mostrar('🎤 Tu voz necesita el modelo V6 — cambialo en Ajustes o desactivá «Cantar con mi voz»', 'info', 5000)
      return
    }
    const tituloLimpio = titulo.trim() || 'Mi canción'
    // 🎯 v0.9.1 — la esencia de los artistas se suma al estilo
    // (tope según el modelo, sin repetir tags) y se avisa.
    // 🧬 v0.15.2 — el prompt avanzado (si hay) reemplaza el simple.
    const inspirada = estiloConInspiracion(
      promptAvanzado.trim() || estilo.trim() || 'pop latino',
      artistas,
      limiteEstiloSuno(ajustes.modeloSuno),
    )
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
        // 🎤 v0.17.0 — FASE 14: la voz personal viaja como
        // personaId (solo si está todo en condiciones — la
        // función misma vuelve a filtrar por modelo/instrumental).
        ...(usarMiVoz && miVoz && !instrumental ? { vozId: miVoz.voiceId } : {}),
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
      mostrar(
        `${nuevas.length} ${nuevas.length === 1 ? 'versión' : 'versiones'} en el horno 🔥${
          usarMiVoz && miVoz && !instrumental ? ' cantadas con TU voz 🎤' : ''
        } — las seguís en 📚 Biblioteca`,
        'ok',
        5000,
      )
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
    // 🧬 v0.15.2 — el prompt avanzado reemplaza el estilo simple
    const inspirada = estiloConInspiracion(promptAvanzado.trim() || estilo.trim() || 'pop latino', artistas, 1000)
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
                {promptAvanzado.trim() && (
                  <span className="ml-1 font-normal text-acento">(🧬 el prompt avanzado lo reemplaza)</span>
                )}
              </span>
              <div className="relative">
                <input
                  value={estilo}
                  onChange={(e) => setEstilo(e.target.value)}
                  maxLength={200}
                  placeholder="rock, punk, enérgica, voz masculina, 120 bpm"
                  className={`${claseInput} ${estilo ? 'pr-32' : 'pr-14'}`}
                />
                <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  {/* 💾 v0.18.0 — FASE 15: guardar este prompt en la
                      biblioteca (carpetitas por tipo de música). */}
                  <button
                    type="button"
                    onClick={abrirGuardarPrompt}
                    title="Guardar este prompt en tu biblioteca"
                    className="rounded-full px-2 py-1 text-[11px] font-bold text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-acento dark:hover:bg-neutral-800"
                  >
                    💾
                  </button>
                  {estilo && (
                    <button
                      type="button"
                      onClick={() => setEstilo('')}
                      title="Vaciar el estilo"
                      className="rounded-full px-2 py-1 text-[10px] font-bold text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-acento dark:hover:bg-neutral-800"
                    >
                      🧹 limpiar
                    </button>
                  )}
                </span>
              </div>
            </div>

            {/* 🚫 v0.16.0 — FASE 13: aviso del escudo anti-ranchera.
                Visible SIEMPRE que el estilo que va a viajar sea
                criolla: con V6 confirma qué se va a excluir; con
                modelo viejo explica por qué no puede (y cómo
                activarlo). */}
            {motor === 'suno' && criollaDetectada && (
              <p className="text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
                {negativosPrevistos
                  ? '🚫 Escudo anti-ranchera activo: a este estilo le voy a pedir a Suno que NO use mariachi, trompetas, guitarrón, banda sinaloense, norteño, tuba ni reggaetón.'
                  : '⚠️ Tu estilo es criolla, pero el escudo anti-ranchera (excluir mariachi y trompetas) necesita el modelo V6 — cambialo en Ajustes.'}
              </p>
            )}

            {/* 🧬 v0.15.2 — PROMPT AVANZADO (pedido de Rudy): para
                sonidos MUY específicos que los chips no alcanzan a
                describir — su vals criollo «bien peruano, nada de
                ranchera», con instrumentos, ambiente y hasta qué NO
                querés. Reemplaza el estilo simple al generar. */}
            <GrupoPlegable
              titulo="🧬 Prompt avanzado"
              nota="estilo largo y detallado — reemplaza el simple"
              activos={promptAvanzado.trim() ? 1 : 0}
            >
              <div className="space-y-2 p-3">
                <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Para sonidos muy específicos (ej: vals criollo bien peruano, nada de ranchera). Pegá tu prompt completo —
                  en inglés (recomendado) o español, que lo traduzco al enviar. Si está lleno, este viaja a Suno en lugar
                  del estilo simple. Sirve igual con letras tuyas o de la IA.
                </p>
                <textarea
                  value={promptAvanzado}
                  onChange={(e) => setPromptAvanzado(e.target.value)}
                  maxLength={1000}
                  rows={7}
                  placeholder={'Traditional Peruvian música criolla, authentic Lima vals criollo with a nostalgic cantinero bolero feeling…'}
                  className="w-full resize-y rounded-xl border border-neutral-300 bg-transparent p-3 text-[12px] leading-relaxed outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-semibold ${
                      motor === 'suno' && promptAvanzado.length > limiteEstiloSuno(ajustes.modeloSuno)
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-neutral-400'
                    }`}
                  >
                    {promptAvanzado.length}/1000
                    {motor === 'suno' && promptAvanzado.length > limiteEstiloSuno(ajustes.modeloSuno) && (
                      <span className="ml-1">
                        — tu modelo {modeloSunoBonito(ajustes.modeloSuno)} solo acepta{' '}
                        {limiteEstiloSuno(ajustes.modeloSuno)}: pasate a V6 en Ajustes para usarlo entero
                      </span>
                    )}
                  </span>
                  <span className="flex gap-1.5">
                    {promptAvanzado && (
                      <button
                        type="button"
                        onClick={() => setPromptAvanzado('')}
                        className="rounded-full border border-neutral-200 px-2.5 py-1 text-[10px] font-bold text-neutral-500 transition-colors hover:border-acento/60 hover:text-acento dark:border-neutral-700"
                      >
                        🧹 limpiar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        vibrar()
                        setPromptAvanzado(PROMPT_CRIOLLO_EJEMPLO)
                      }}
                      className="rounded-full border border-acento/40 bg-acento/10 px-2.5 py-1 text-[10px] font-bold text-acento transition-colors hover:border-acento"
                    >
                      🇵🇪 usar mi prompt criollo
                    </button>
                  </span>
                </div>
                {promptAvanzado.trim() && (
                  <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    ✓ Al generar se manda ESTE prompt (el estilo simple queda de lado)
                  </p>
                )}
              </div>
            </GrupoPlegable>

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
                nota="te lo armo completo — tu voz se mantiene"
                abierta
                activos={recetaVigente ? 1 : 0}
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
                    const activa = recetaContenidaEn(r.estilo, estilo)
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
                {/* 👨👩 v0.18.0 — FASE 15 (pedido de Rudy): la voz
                    hombre/mujer AQUÍ, junto a las recetas — se
                    mantiene aunque toqués otra receta y no apaga los
                    perfiles criolla de abajo. Mismo estado que el
                    grupo «Voz» del estudio (los dos se sincronizan
                    solos). */}
                <div className="flex w-full flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Voz:</span>
                  {VOZ_CANTANTE.filter((v) => v !== 'Cualquiera').map((v) => {
                    const activo = vozActiva === v
                    return (
                      <button key={v} type="button" aria-pressed={activo} onClick={() => fijarVoz(v)} className={claseChip(activo)}>
                        {activo ? '✓ ' : ''}
                        {v === 'Masculina' ? '👨 Hombre' : v === 'Femenina' ? '👩 Mujer' : '👥 Dúo'}
                      </button>
                    )
                  })}
                  {vozActiva !== 'Cualquiera' && (
                    <button
                      type="button"
                      onClick={() => fijarVoz('Cualquiera')}
                      className="rounded-full px-2 py-1 text-[11px] font-semibold text-neutral-400 transition-colors hover:text-acento"
                    >
                      ✕ quitar
                    </button>
                  )}
                </div>
                <p className="w-full text-[10px] leading-relaxed text-neutral-400">
                  Elegida una vez, se mantiene al cambiar de receta — y no apaga los perfiles criolla de abajo.
                </p>
              </GrupoPlegable>

              {/* 📚 v0.18.0 — FASE 15 (pedido de Rudy): MI BIBLIOTECA
                  DE PROMPTS — los estilos que le atinan bien, en
                  carpetitas por tipo de música (como las canciones
                  de la Biblioteca). Se guardan con 💾 junto al campo
                  Estilo y se reutilizan con ▶ Usar. */}
              <GrupoPlegable
                titulo="📚 Mi biblioteca de prompts"
                nota={
                  prompts.length
                    ? `${prompts.length} ${prompts.length === 1 ? 'guardado' : 'guardados'}`
                    : 'los que le atinan, en carpetitas'
                }
                activos={carpetaSel ? prompts.filter((p) => p.carpeta === carpetaSel).length : prompts.length}
              >
                {prompts.length === 0 ? (
                  <p className="w-full text-[11px] leading-relaxed text-neutral-400">
                    Acá quedan los prompts que le atinan bien, ordenaditos en carpetitas (Criolla, Power metal…). Armá
                    tu estilo como más te guste y tocá <b>💾</b> junto al campo Estilo para guardarlo — no lo perdés nunca
                    más.
                  </p>
                ) : (
                  <div className="w-full space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        aria-pressed={carpetaSel === ''}
                        onClick={() => {
                          setCarpetaSel('')
                          setBorrarConfirmado('')
                        }}
                        className={claseChip(carpetaSel === '')}
                      >
                        {carpetaSel === '' ? '✓ ' : ''}Todas ({prompts.length})
                      </button>
                      {carpetasDePrompts(prompts).map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={carpetaSel === c}
                          onClick={() => {
                            setCarpetaSel(c)
                            setBorrarConfirmado('')
                          }}
                          className={claseChip(carpetaSel === c)}
                        >
                          {carpetaSel === c ? '✓ ' : ''}
                          {c} ({prompts.filter((p) => p.carpeta === c).length})
                        </button>
                      ))}
                    </div>
                    {prompts
                      .filter((p) => !carpetaSel || p.carpeta === carpetaSel)
                      .map((p) => (
                        <div key={p.id} className="rounded-xl border border-neutral-200 p-2.5 dark:border-neutral-800">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="block truncate text-[11px] font-bold text-neutral-700 dark:text-neutral-200">
                                {p.nombre}
                              </span>
                              <span className="mt-0.5 block text-[9px] text-neutral-400">
                                📁 {p.carpeta} ·{' '}
                                {new Date(p.fecha).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
                                {p.avanzado ? ' · 🧬 avanzado' : ''}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => usarPrompt(p)}
                                className="rounded-full border border-acento/40 bg-acento/10 px-2.5 py-1 text-[10px] font-bold text-acento transition-colors hover:border-acento"
                              >
                                ▶ Usar
                              </button>
                              <button
                                type="button"
                                onClick={() => quererBorrarPrompt(p)}
                                className={`rounded-full border px-2 py-1 text-[10px] font-bold transition-colors ${
                                  borrarConfirmado === p.id
                                    ? 'border-red-400 bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400'
                                    : 'border-neutral-200 text-neutral-400 hover:border-red-300 hover:text-red-400 dark:border-neutral-700'
                                }`}
                              >
                                {borrarConfirmado === p.id ? '¿seguro?' : '🗑'}
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-neutral-400">
                            {p.avanzado ?? p.estilo}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
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

              <GrupoPlegable titulo="Voz" nota="una sola — ya no se borra al cambiar de receta" activos={vozActiva !== 'Cualquiera' ? 1 : 0}>
                {VOZ_CANTANTE.map((v) => {
                  const activo = vozActiva === v
                  return (
                    <button key={v} type="button" aria-pressed={activo} onClick={() => fijarVoz(v)} className={claseChip(activo)}>
                      {activo ? `✓ ${v}` : v}
                    </button>
                  )
                })}
              </GrupoPlegable>

              {/* 🎤 v0.17.0 — FASE 14 (pedido de Rudy): TU PROPIA
                  VOZ. Se crea en Ajustes → «Mi voz» (dos audios
                  cortos) y este interruptor la manda a Suno como
                  personaId: la canción sale cantada por vos.
                  Requiere modelo V6 y canción cantada. */}
              {motor === 'suno' && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={usarMiVoz && !!miVoz && modeloSunoSoportaVoz(ajustes.modeloSuno)}
                  onClick={alternarMiVoz}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 text-left transition-colors hover:border-acento/60 dark:border-neutral-800"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                      🎤 Cantar con mi voz
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-neutral-400">
                      {miVoz
                        ? modeloSunoSoportaVoz(ajustes.modeloSuno)
                          ? `«${miVoz.nombre}» · creada el ${new Date(miVoz.fecha).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })} — la canción sale con tu timbre`
                          : `«${miVoz.nombre}» necesita modelo V6 — estás en ${modeloSunoBonito(ajustes.modeloSuno)}`
                        : 'Todavía no la creaste — tocá y te llevo a Ajustes (2 grabaciones cortas)'}
                    </span>
                  </span>
                  <span
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      usarMiVoz && miVoz ? 'bg-acento' : 'bg-neutral-300 dark:bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        usarMiVoz && miVoz ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </span>
                </button>
              )}
              {motor === 'suno' && usarMiVoz && miVoz && miVozAplica && (
                <p className="text-[10px] leading-relaxed text-acento">
                  ✓ Sale cantada con TU voz — los chips de voz de arriba quedan de lado: Suno usa tu timbre.
                </p>
              )}

              {/* 🎤 v0.16.0 — FASE 13 (pedido de Rudy): perfiles de
                  voz criolla. Suno no acepta nombres de artistas
                  reales en el estilo (los filtra) ni clona su voz:
                  estos chips describen el TIPO de voz de cada
                  leyenda — lo que sí puede evocar. El «Rompevenas»
                  trae la dinámica que Rudy describía: entonaciones
                  altas y la voz que se hace más fuerte al final. */}
              <GrupoPlegable
                titulo="🎤 Voz criolla"
                nota="uno solo — evocan el tipo de voz, no imitan"
                activos={perfilVozActivo ? 1 : 0}
              >
                {PERFILES_VOZ_ESTILO.map((p) => {
                  const activo = perfilVozActivo === p
                  return (
                    <button
                      key={p.etiqueta}
                      type="button"
                      title={p.evoca}
                      aria-pressed={activo}
                      onClick={() => fijarPerfilVoz(p)}
                      className={claseChip(activo)}
                    >
                      {activo ? `✓ ${p.etiqueta}` : p.etiqueta}
                    </button>
                  )
                })}
                {perfilVozActivo && (
                  <p className="w-full text-[10px] leading-relaxed text-neutral-400">
                    {perfilVozActivo.evoca} — estos toques viajan con el estilo, traducidos al inglés que Suno entiende
                  </p>
                )}
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

      {/* 💾 v0.18.0 — FASE 15: modal de guardado de prompt. Nombre
          y carpetita precargados según la receta aplicada. */}
      <Modal abierto={modalGuardarAbierto} onCerrar={() => setModalGuardarAbierto(false)} titulo="💾 Guardar prompt">
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            Lo que le atina bien, guardado en carpetitas — Criolla, Power metal, lo que sea. Después lo volvés a usar con
            ▶ Usar y no lo perdés nunca más.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Nombre</span>
            <input
              value={nombrePrompt}
              onChange={(e) => setNombrePrompt(e.target.value)}
              maxLength={60}
              placeholder="Ej: Vals criollo cantinero"
              className={claseInput}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              Carpetita <span className="font-normal text-neutral-400">(tipo de música)</span>
            </span>
            <input
              value={carpetaPrompt}
              onChange={(e) => setCarpetaPrompt(e.target.value)}
              maxLength={30}
              placeholder="Ej: Criolla"
              list="carpetas-prompts-existentes"
              className={claseInput}
            />
            <datalist id="carpetas-prompts-existentes">
              {carpetasDePrompts(prompts).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          {carpetasDePrompts(prompts).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {carpetasDePrompts(prompts).map((c) => (
                <button key={c} type="button" onClick={() => setCarpetaPrompt(c)} className={claseChip(carpetaPrompt === c)}>
                  📁 {c}
                </button>
              ))}
            </div>
          )}
          <div className="rounded-xl bg-neutral-100 p-2.5 dark:bg-neutral-800/60">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Se va a guardar</p>
            {promptAvanzado.trim() ? (
              <>
                <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-neutral-600 dark:text-neutral-300">
                  {promptAvanzado}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-acento">
                  🧬 Tu prompt avanzado ({promptAvanzado.length} caracteres)
                </p>
              </>
            ) : (
              <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-neutral-600 dark:text-neutral-300">
                {estilo.trim() || '(vacío)'}
              </p>
            )}
          </div>
          <Boton className="w-full" onClick={confirmarGuardarPrompt}>
            💾 Guardar en «{carpetaPrompt.trim() || 'Varios'}»
          </Boton>
        </div>
      </Modal>
    </div>
  )
}
