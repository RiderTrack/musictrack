import { APP } from '@/data/app'
import { AJUSTES_POR_DEFECTO, type Ajustes } from '@/types'

// ═══════════════════════════════════════════════════════════
// 💾 ALMACENAMIENTO — patrón WalletTrack:
// • TODA clave de localStorage lleva el prefijo de la app
//   (`trackstack_…`) → respaldo y migración aislados por app.
// • Respaldo JSON con versión (como el v3.0 de WalletTrack).
// • Restauración en dos modos:
//     'sobrescribir' → importar respaldo (el archivo manda)
//     'mezclar'      → sync en la nube (merge sin borrar)
// ═══════════════════════════════════════════════════════════

const PREFIJO = APP.prefijoClaves

function claveCompleta(clave: string): string {
  return `${PREFIJO}_${clave}`
}

export function leer<T>(clave: string, defecto: T): T {
  try {
    const crudo = localStorage.getItem(claveCompleta(clave))
    if (crudo === null) return defecto
    const parsed = JSON.parse(crudo) as T
    // 🩹 Defensa anti-corrupción (v0.4.1): si se espera un array
    // (letras, canciones…) y lo guardado es otra cosa, devolver el
    // default en vez de dejar que reviente el render (.filter & co.).
    if (Array.isArray(defecto) && !Array.isArray(parsed)) return defecto
    return parsed
  } catch {
    return defecto
  }
}

export function guardar(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(claveCompleta(clave), JSON.stringify(valor))
  } catch (e) {
    console.warn('[almacenamiento] no se pudo guardar', clave, e)
  }
}

export function borrarClave(clave: string): void {
  localStorage.removeItem(claveCompleta(clave))
}

// ═══════════════════════════════════════════════════════════
// 🩹 AJUSTES con merge de defaults (v0.4.1 — fix pantalla blanca):
// los ajustes guardados por una versión vieja pueden no tener
// los campos nuevos (ej: modeloLyria) → cualquier acceso tipo
// ajustes.modeloLyria.includes(…) explotaba y React desmontaba
// toda la app (pantalla en blanco). Desde acá, SIEMPRE se
// devuelven los campos nuevos con su valor por defecto, y el
// objeto guardado se auto-migra la primera vez que se lee.
// Regla para el futuro: los ajustes se leen con leerAjustes(),
// NUNCA con leer<Ajustes>('ajustes', …).
// ═══════════════════════════════════════════════════════════

export function leerAjustes(): Ajustes {
  const guardados = leer<Partial<Ajustes>>('ajustes', {})
  const fusionados: Ajustes = { ...AJUSTES_POR_DEFECTO, ...guardados }
  // Auto-migración: si faltaba algún campo, guarda la versión curada
  // para que el resto de la app (y los respaldos) ya lo tengan.
  const faltan = (Object.keys(AJUSTES_POR_DEFECTO) as (keyof Ajustes)[]).some(
    (k) => guardados[k] === undefined,
  )
  if (faltan && Object.keys(guardados).length > 0) guardar('ajustes', fusionados)
  return fusionados
}

/** Instantánea de TODAS las claves `prefijo_*` (valor crudo). */
export function instantanea(): Record<string, string> {
  const datos: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(`${PREFIJO}_`)) datos[k] = localStorage.getItem(k) ?? ''
  }
  return datos
}

export type ModoRestauracion = 'mezclar' | 'sobrescribir'

/**
 * Restaura una instantánea.
 * 'mezclar': solo escribe claves que NO existen localmente (lo local manda —
 *            patrón "merge sin borrar" de la sync de WalletTrack).
 * 'sobrescribir': escribe todo (importar un respaldo manual).
 * Devuelve cuántas claves escribió.
 */
export function restaurarInstantanea(datos: Record<string, unknown>, modo: ModoRestauracion): number {
  let escritas = 0
  for (const [k, v] of Object.entries(datos)) {
    try {
      if (modo === 'sobrescribir' || localStorage.getItem(k) === null) {
        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
        escritas++
      }
    } catch {
      /* clave inválida — se ignora */
    }
  }
  return escritas
}

export function contarClaves(): number {
  let n = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(`${PREFIJO}_`)) n++
  }
  return n
}

export interface RespaldoJSON {
  app: string
  version: number
  fecha: string
  datos: Record<string, string>
}

/** Descarga un respaldo JSON (mismo espíritu que el v3.0 de WalletTrack). */
export function descargarRespaldo(): void {
  const respaldo: RespaldoJSON = {
    app: APP.nombre,
    version: 1,
    fecha: new Date().toISOString(),
    datos: instantanea(),
  }
  const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  a.href = url
  a.download = `${PREFIJO}-respaldo-${hoy}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Importa un respaldo descargado de esta app (u otra con el mismo prefijo). */
export async function importarRespaldo(archivo: File): Promise<number> {
  const texto = await archivo.text()
  const parsed = JSON.parse(texto) as Partial<RespaldoJSON>
  if (!parsed.datos || typeof parsed.datos !== 'object') {
    throw new Error('El archivo no parece un respaldo válido')
  }
  return restaurarInstantanea(parsed.datos, 'sobrescribir')
}
