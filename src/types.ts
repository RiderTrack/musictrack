// ═══════════════════════════════════════════════════════════
// 🧱 TrackStack — tipos compartidos de toda la app
// ═══════════════════════════════════════════════════════════

export type Tema = 'oscuro' | 'claro' | 'auto'

export type PestannaId = 'inicio' | 'modulo1' | 'modulo2' | 'ajustes'

export interface Ajustes {
  tokenIA: string
  modeloIA: string
  onboardingVisto: boolean
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  tokenIA: '',
  modeloIA: 'claude-sonnet-4-5-20250929',
  onboardingVisto: false,
}

export interface Sesion {
  uid: string
  nombre: string
  foto?: string
  esLocal: boolean
}

/** Ejemplo de entidad persistible (la usa Módulo 1 — borrá/rediseañá a gusto) */
export interface Nota {
  id: string
  titulo: string
  texto: string
  fecha: number
}

/** Ejemplo de mensaje para el chat IA (lo usa Módulo 2) */
export interface MensajeChatIA {
  rol: 'usuario' | 'asistente'
  texto: string
  fecha: number
}
