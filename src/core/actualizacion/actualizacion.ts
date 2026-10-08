import { APP } from '@/data/app'
import { leer, guardar } from '@/core/storage/almacenamiento'

// ═══════════════════════════════════════════════════════════
// 🔄 ACTUALIZACIONES — actualizador in-app (FASE 2).
// Consulta el último release público del repo en GitHub (sin
// token, el repo es público y la API permite CORS) y compara
// con la versión instalada (APP.version, misma que versionName
// del APK: package.json → CI).
// Convención de tags: v0.2.0-fase2 → versión semver 0.2.0.
// ═══════════════════════════════════════════════════════════

const REPO_GITHUB = 'RiderTrack/musictrack'
const CLAVE_IGNORADA = 'actualizacion_ignorada'
const TIMEOUT_MS = 8000

export interface InfoActualizacion {
  tag: string
  version: string
  urlApk: string
  notas: string
  fecha: string
}

interface AssetGitHub {
  name?: string
  browser_download_url?: string
}

interface ReleaseGitHub {
  tag_name?: string
  body?: unknown
  published_at?: string
  assets?: AssetGitHub[]
}

/** "v0.2.0-fase2" → "0.2.0" (deja afuera el prefijo v y el sufijo). */
function versionDesdeTag(tag: string): string {
  return tag.replace(/^v/i, '').split('-')[0] ?? ''
}

/** Compara semver a.b.c → -1 si a<b, 0 si son iguales, 1 si a>b. */
export function compararVersiones(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10))
  const pb = b.split('.').map((n) => Number.parseInt(n, 10))
  if (pa.length < 3 || pb.length < 3 || pa.some(Number.isNaN) || pb.some(Number.isNaN)) return 0
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

/** Último release con APK del repo. null si sin internet, rate-limit o sin asset. */
export async function buscarUltimaVersion(): Promise<InfoActualizacion | null> {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_GITHUB}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controlador.signal,
    })
    if (!r.ok) return null
    const d = (await r.json()) as ReleaseGitHub
    const apk = (Array.isArray(d.assets) ? d.assets : []).find((a) => a.name?.endsWith('.apk'))
    if (!d.tag_name || !apk?.browser_download_url) return null
    return {
      tag: d.tag_name,
      version: versionDesdeTag(d.tag_name),
      urlApk: apk.browser_download_url,
      notas: typeof d.body === 'string' ? d.body : '',
      fecha: d.published_at ?? '',
    }
  } catch {
    return null // sin internet / timeout / JSON inválido
  } finally {
    clearTimeout(temporizador)
  }
}

/** ¿El release es más nuevo que la versión instalada? */
export function esMasNueva(info: InfoActualizacion): boolean {
  return compararVersiones(info.version, APP.version) > 0
}

/** El usuario pospuso este release: no volver a mostrar el banner hasta que salga otro. */
export function ignorarVersion(tag: string): void {
  guardar(CLAVE_IGNORADA, tag)
}

/** Tag que el usuario decidió posponer ('' si nunca). */
export function versionIgnorada(): string {
  return leer<string>(CLAVE_IGNORADA, '')
}
