// ═══════════════════════════════════════════════════════════
// 🧱 TrackStack — tipos compartidos de toda la app
// ═══════════════════════════════════════════════════════════

export type Tema = 'oscuro' | 'claro' | 'auto'

export type PestannaId = 'inicio' | 'letras' | 'crear' | 'musica' | 'ajustes'

export interface Ajustes {
  tokenIA: string
  modeloIA: string
  tokenSuno: string
  urlSuno: string
  modeloSuno: string
  tokenLyria: string
  modeloLyria: string
  /** Carpeta (dentro de Descargas) donde caen los MP3 (v0.7.1). */
  carpetaDescargas: string
  onboardingVisto: boolean
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  tokenIA: '',
  modeloIA: 'claude-sonnet-4-5-20250929',
  tokenSuno: '',
  urlSuno: 'https://api.sunoapi.org',
  modeloSuno: 'V6',
  tokenLyria: '',
  modeloLyria: 'lyria-3.5',
  carpetaDescargas: 'Música de Rudy',
  onboardingVisto: false,
}

/** Modelos de Claude que escriben las letras (v0.7.0): el usuario
 * los cambia desde Crear o Ajustes según cuánto quiera gastar.
 * Haiku = rápido y barato · Sonnet = equilibrado · Opus = premium. */
export const MODELOS_CLAUDE = [
  {
    id: 'claude-haiku-4-5-20251001',
    etiqueta: 'Haiku 4.5',
    detalle: 'rápido y económico — letras en segundos',
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    etiqueta: 'Sonnet 4.5',
    detalle: 'recomendado — mejor calidad-tiempo-precio',
  },
  {
    id: 'claude-opus-4-5-20251101',
    etiqueta: 'Opus 4.5',
    detalle: 'máxima calidad — más lento y caro',
  },
] as const

/** ¿El modelo elegido es uno de la lista o uno escrito a mano? */
export function modeloClaudeConocido(id: string): boolean {
  return MODELOS_CLAUDE.some((m) => m.id === id)
}

export interface Sesion {
  uid: string
  nombre: string
  foto?: string
  esLocal: boolean
}

// ═══════════════════════════════════════════════════════════
// 🎵 MÚSICA — géneros, idiomas, emociones y estructura que
// alimentan el generador de letras (CrearView, FASE 1).
// ═══════════════════════════════════════════════════════════

export const GENEROS_MUSICALES = [
  'Pop latino',
  'Balada romántica',
  'Reggaetón',
  'Trap latino',
  'Cumbia',
  'Salsa',
  'Vallenato',
  'Bachata',
  'Merengue',
  'Corrido / Regional mexicano',
  'Rock en español',
  'Rock',
  'Nu metal',
  'Metal / Punk',
  'Pop rock',
  'Indie / Alternativo',
  'Hip-hop / Rap',
  'R&B',
  'Folclore andino',
  'Sertanejo',
  'Bossa nova',
  'Tango',
  'Flamenco',
  'K-pop',
  'Electronic / EDM',
] as const

export const IDIOMAS = ['Español', 'English', 'Português'] as const

export const MOODS = [
  'Alegre',
  'Romántica',
  'Melancólica',
  'Motivacional',
  'Despecho',
  'Fiesta',
  'Nostálgica',
  'Tranquila',
  'Épica',
  'Oscura',
  'Dramática',
] as const

/** ¿Quién canta la canción? (v0.7.0) — se usa al crear la
 * letra (Claude la escribe pensando en esa voz) y al musicalizar
 * (se agrega al estilo de Suno). */
export const VOZ_CANTANTE = ['Cualquiera', 'Masculina', 'Femenina', 'Dúo'] as const

export const ESTRUCTURAS = [
  { id: 'sencilla', etiqueta: 'Sencilla', detalle: 'corta: 1 verso + coro (12 a 16 líneas)' },
  { id: 'estandar', etiqueta: 'Estándar', detalle: '2 versos + pre-coro + coro + puente (20 a 28 líneas)' },
  { id: 'extendida', etiqueta: 'Extendida', detalle: '3 versos + puente + outro (30 a 40 líneas)' },
] as const

/** Una letra de la biblioteca — creada con IA o escrita a mano (FASE 2). */
export interface Letra {
  id: string
  titulo: string
  tema: string
  genero: string
  idioma: string
  mood: string
  estructura: string
  texto: string
  origen: 'ia' | 'propia'
  /** Voz pensada para cantarla (v0.7.0): 'Masculina', 'Femenina',
   * 'Dúo' — viaja con la letra hasta el estilo de Suno. */
  voz?: string
  fecha: number
}

// ═══════════════════════════════════════════════════════════
// 🎧 MOTOR DOBLE (FASE 3) — Suno convierte las letras en
// canciones: el usuario elige una letra de la biblioteca (o
// pega una), define el estilo y Suno genera 2 versiones con
// voz e instrumentos. Cada versión es una Cancion.
// ═══════════════════════════════════════════════════════════

export const MODELOS_SUNO = [
  { id: 'V6', etiqueta: 'V6 · el más nuevo — voces naturales, recomendado' },
  { id: 'V6_MINI', etiqueta: 'V6 Mini · liviano y RÁPIDO — menos espera' },
  { id: 'V6_WILD', etiqueta: 'V6 Wild · más creativo y arriesgado' },
  { id: 'V5', etiqueta: 'V5 · discontinuado (anda, pero ya no lo mejoran)' },
  { id: 'V4_5', etiqueta: 'V4.5 · discontinuado' },
  { id: 'V4', etiqueta: 'V4 · discontinuado' },
  { id: 'V3_5', etiqueta: 'V3.5 · discontinuado' },
] as const

/** IDs de Suno discontinuados por sunoapi.org (siguen funcionando
 * por compatibilidad, pero ya no reciben mejoras). */
export const MODELOS_SUNO_VIEJOS = ['V5', 'V4_5', 'V4_5PLUS', 'V4_5ALL', 'V4', 'V3_5'] as const

/** Versión bonita a mostrar: V6_MINI → «V6 Mini», V4_5 → «V4.5». */
export function modeloSunoBonito(id: string): string {
  const mapa: Record<string, string> = {
    V6: 'V6',
    V6_MINI: 'V6 Mini',
    V6_WILD: 'V6 Wild',
    V5: 'V5',
    V5_5: 'V5.5',
    V4_5: 'V4.5',
    V4_5PLUS: 'V4.5 Plus',
    V4_5ALL: 'V4.5 All',
    V4: 'V4',
    V3_5: 'V3.5',
  }
  return mapa[id] ?? id.replace(/_/g, ' ')
}

export const MODELOS_LYRIA = [
  { id: 'lyria-3.5', etiqueta: 'Lyria 3.5 · canción completa (~2 min, $0.08)' },
  { id: 'lyria-3-clip-preview', etiqueta: 'Lyria 3 Clip · clip de 30 segundos ($0.04)' },
] as const

export type MotorMusica = 'suno' | 'lyria'

export const ESTILOS_RAPIDOS = [
  'reggaetón, dembow, perreo, 96 bpm',
  'trap latino, oscuro, 808 profundo',
  'balada romántica, piano, cuerdas',
  'cumbia peruana, guitarra, timbales',
  'salsa dura, trompetas, tumbao',
  'pop latino, pegadizo, verano',
  'rock en español, guitarras distorsionadas',
  'R&B latino, suave, groovy',
  'rock punk, energético, guitarras crudas',
  'corrido tumbado, requinto, trompetas',
  'synthwave, ochentero, sintetizadores',
  'lo-fi hip hop, relajado, vinilo',
] as const

/** Etiquetas de UN género para COMBINAR estilos (v0.6.0): tocás
 * varias y se van sumando al campo estilo ("rock, punk, energético").
 * Agrupadas para encontrarlas rápido en el formulario de Música.
 * v0.7.0: rock & metal ampliado (Nu metal, Metalcore, Thrash…),
 * más ritmos latinos y electrónica moderna. */
export const GRUPOS_TAGS_ESTILO: { titulo: string; tags: string[] }[] = [
  {
    titulo: 'Urbano & latino',
    tags: [
      'Reggaetón',
      'Trap',
      'Hip-hop',
      'Rap',
      'R&B',
      'Cumbia',
      'Salsa',
      'Merengue',
      'Bachata',
      'Vallenato',
      'Corrido',
      'Banda',
      'Ranchera',
      'Sertanejo',
      'Tango',
      'Huayno',
      'Folclore andino',
      'Son cubano',
      'Mariachi',
      'Dancehall',
      'Afrobeats',
    ],
  },
  {
    titulo: 'Rock & metal',
    tags: [
      'Rock',
      'Punk',
      'Pop rock',
      'Rock en español',
      'Hard rock',
      'Grunge',
      'Indie',
      'Alternativo',
      'Emo',
      'Ska',
      'Post-punk',
      'Rock progresivo',
      'Rock psicodélico',
      'Stoner rock',
      'Metal',
      'Nu metal',
      'Metalcore',
      'Thrash metal',
      'Death metal',
      'Power metal',
      'Doom metal',
      'Industrial',
    ],
  },
  {
    titulo: 'Pop, jazz & clásicos',
    tags: [
      'Pop',
      'Pop latino',
      'Balada',
      'Bolero',
      'Disco',
      'Funk',
      'Soul',
      'Jazz',
      'Blues',
      'Swing',
      'Gospel',
      'Bossa nova',
      'Flamenco',
      'Acústico',
      'Piano',
      'Sinfónico',
    ],
  },
  {
    titulo: 'Electrónica & otros',
    tags: [
      'Electrónica',
      'EDM',
      'House',
      'Techno',
      'Trance',
      'Drum and bass',
      'Synthwave',
      'Lo-fi',
      'Phonk',
      'Ambient',
      'Chill',
      'Reggae',
      'K-pop',
      'Country',
      'Folk',
      '8-bit',
      'Navideño',
    ],
  },
]

/** 🎚️ Carácter de la canción (v0.7.0): se suman al estilo como
 * adjetivos que Suno entiende ("energética, épica"). Se pueden
 * tocar varias a la vez. */
export const ENERGIAS_ESTILO = [
  'Enérgica',
  'Tranquila',
  'Épica',
  'Agresiva',
  'Alegre',
  'Melancólica',
  'Romántica',
  'Oscura',
  'Nostálgica',
  'Dramática',
  'Sexy',
  'Motivacional',
] as const

/** 🎤 Instrumentos protagonistas (v0.7.0): se suman al estilo
 * ("piano, cuerdas, trompetas"). Se pueden tocar varios. */
export const INSTRUMENTOS_ESTILO = [
  'Guitarra eléctrica',
  'Guitarra acústica',
  'Guitarra distorsionada',
  'Piano',
  'Sintetizadores',
  'Bajo',
  'Batería',
  'Percusión',
  'Trompetas',
  'Saxofón',
  'Cuerdas',
  'Órgano',
  'Coros',
  '808',
  'Riffs pesados',
  'Solo de guitarra',
] as const

/** ⏱️ Tempo (v0.7.0): EXCLUSIVO — elegir uno quita el anterior.
 * El chip muestra la idea y agrega el BPM al estilo. */
export const TEMPOS_ESTILO = [
  { etiqueta: 'Lenta · balada', tag: '70 bpm' },
  { etiqueta: 'Media · groove', tag: '100 bpm' },
  { etiqueta: 'Rápida · bailable', tag: '128 bpm' },
  { etiqueta: 'Acelerada · mosh', tag: '160 bpm' },
] as const

/** Una canción generada con Suno o Lyria a partir de una letra. */
export interface Cancion {
  id: string
  taskId: string
  titulo: string
  estilo: string
  letraId?: string
  instrumental: boolean
  modelo: string
  /** Con cuál de los dos motores de música se generó (viejas registros: Suno). */
  motor?: MotorMusica
  /** true = el MP3 vive en IndexedDB (Lyria), no en una URL CDN (Suno). */
  audioLocal?: boolean
  /** Grupo de versiones (v0.5.0): Suno devuelve 2 canciones por pedido
   * y ahora cada una es su propia tarjeta. */
  grupoId?: string
  varianteId?: string
  /** Letra de la versión dentro del grupo ('A', 'B'…). */
  version?: string
  /** Letra enviada al motor (v0.6.1): permite la «válvula de escape»
   * a suno.com en canciones trabadas en la cola, sin depender de que
   * la letra siga existiendo en la biblioteca. */
  letraTexto?: string
  estado: 'generando' | 'lista' | 'error'
  /** Estado tal cual lo reporta sunoapi.org (PENDING, TEXT_SUCCESS,
   * FIRST_SUCCESS…) — alimenta la barrita de etapas de la v0.4.5. */
  estadoCrudo?: string
  urlAudio?: string
  urlPortada?: string
  duracionSeg?: number
  error?: string
  fecha: number
}
