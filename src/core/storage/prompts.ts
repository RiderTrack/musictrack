import { leer, guardar } from '@/core/storage/almacenamiento'

// ═══════════════════════════════════════════════════════════
// 📚 v0.18.0 — FASE 15: BIBLIOTECA DE PROMPTS (pedido de Rudy).
// Los estilos que LE ATINAN bien se guardan acá, en carpetitas
// por tipo de música («Criolla», «Power metal»…) — como las
// canciones de la Biblioteca — para no perderlos nunca más.
//
// Mismo patrón que listas.ts: TODO cambio pasa por acá, se guarda
// con el prefijo de la app (viaja solo en el respaldo y la sync
// de la nube) y se dispara EVENTO_PROMPTS para que la vista
// montada se refresque sola.
// ═══════════════════════════════════════════════════════════

export interface PromptGuardado {
  id: string
  /** Nombre corto («Vals criollo cantinero»). */
  nombre: string
  /** El estilo simple completo (tags separados por comas). */
  estilo: string
  /** El prompt avanzado si lo usaba (viaja en lugar del simple). */
  avanzado?: string
  /** Carpetita: «Criolla», «Power metal»… */
  carpeta: string
  fecha: number
}

export const CLAVE_PROMPTS = 'prompts'
export const EVENTO_PROMPTS = 'musictrack:prompts-actualizados'

export function leerPrompts(): PromptGuardado[] {
  return leer<PromptGuardado[]>(CLAVE_PROMPTS, [])
}

function guardarPrompts(ps: PromptGuardado[]): void {
  guardar(CLAVE_PROMPTS, ps)
  window.dispatchEvent(new CustomEvent<PromptGuardado[]>(EVENTO_PROMPTS, { detail: ps }))
}

/** Guarda un prompt (el más nuevo primero). Nombre y carpeta
 * vacíos caen en «Mi prompt» / «Varios» — nunca en un limbo. */
export function guardarPrompt(p: {
  nombre: string
  estilo: string
  avanzado?: string
  carpeta: string
}): PromptGuardado {
  const nuevo: PromptGuardado = {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    nombre: p.nombre.trim() || 'Mi prompt',
    estilo: p.estilo.trim(),
    avanzado: p.avanzado?.trim() || undefined,
    carpeta: p.carpeta.trim() || 'Varios',
    fecha: Date.now(),
  }
  guardarPrompts([nuevo, ...leerPrompts()])
  return nuevo
}

export function borrarPrompt(id: string): void {
  guardarPrompts(leerPrompts().filter((p) => p.id !== id))
}

/** Carpetitas únicas en orden alfabético — como las listas de la
 * Biblioteca de canciones. Una carpeta que queda vacía desaparece
 * sola (no deja basura). */
export function carpetasDePrompts(ps: PromptGuardado[]): string[] {
  return [...new Set(ps.map((p) => p.carpeta))].sort((a, b) => a.localeCompare(b, 'es'))
}
