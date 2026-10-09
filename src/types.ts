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
  onboardingVisto: boolean
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  tokenIA: '',
  modeloIA: 'claude-sonnet-4-5-20250929',
  tokenSuno: '',
  urlSuno: 'https://api.sunoapi.org',
  modeloSuno: 'V4_5',
  tokenLyria: '',
  modeloLyria: 'lyria-3.5',
  onboardingVisto: false,
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
  'Pop rock',
  'Hip-hop / Rap',
  'R&B',
  'Folclore andino',
  'Sertanejo',
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
] as const

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
  fecha: number
}

// ═══════════════════════════════════════════════════════════
// 🎧 MOTOR DOBLE (FASE 3) — Suno convierte las letras en
// canciones: el usuario elige una letra de la biblioteca (o
// pega una), define el estilo y Suno genera 2 versiones con
// voz e instrumentos. Cada versión es una Cancion.
// ═══════════════════════════════════════════════════════════

export const MODELOS_SUNO = ['V3_5', 'V4', 'V4_5', 'V5'] as const

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
  estado: 'generando' | 'lista' | 'error'
  urlAudio?: string
  urlPortada?: string
  duracionSeg?: number
  error?: string
  fecha: number
}
