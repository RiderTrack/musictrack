import { onAuthStateChanged } from 'firebase/auth'
import { guardar } from '@/core/storage/almacenamiento'
import { restaurarNube, respaldarNube } from '@/core/sync/sync'
import { toastGlobal } from '@/components/ui/Toast'
import { firebaseConfigurado, obtenerAuth } from '@/services/firebase'

// ═══════════════════════════════════════════════════════════
// 🤖 AUTO-RESPALDO (v0.15.0) — la nube sin que nadie la toque:
//
// • CUALQUIER cambio (letra nueva, canción, ajuste, MP3 listo)
//   dispara 'mt:guardado' → espera 45s de calma → sube todo.
// • Nunca más seguido que cada 60s (Firestore se cobra por
//   escritura, y el celular agradece la pausa).
// • Al ENTRAR con Google: baja lo que falte (merge sin borrar)
//   — en un celular nuevo aparece todo solo.
// • Al CERRAR/minimizar la app: intento final de subida.
// • Sin sesión o sin internet: no hace NADA (modo local).
// ═══════════════════════════════════════════════════════════

const CLAVE_ULTIMA = 'ultima_sync_nube'
const DEBOUNCE_MS = 45_000
const INTERVALO_MIN_MS = 60_000

let iniciado = false
let sucio = false
let pausado = false
let subiendo = false
let uidActual: string | null = null
let ultimaSubida = 0
let timer: number | undefined

/** Arranca una sola vez (lo llama App al montar). */
export function iniciarAutoSync(): void {
  if (iniciado || !firebaseConfigurado) return
  iniciado = true

  onAuthStateChanged(obtenerAuth(), (u) => {
    uidActual = u?.uid ?? null
    if (u) void entrar(u.uid)
  })

  window.addEventListener('mt:guardado', (e: Event) => {
    // La marca de "última sync" no cuenta como cambio (bucle infinito si no)
    if ((e as CustomEvent<string>).detail === CLAVE_ULTIMA) return
    if (pausado) return
    sucio = true
    programar()
  })

  // Vuelve la red → si quedó algo pendiente, reintenta
  window.addEventListener('online', () => programar())

  // Minimizar/cerrar → subida best-effort
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void volcarAhora()
  })
  window.addEventListener('pagehide', () => void volcarAhora())
}

function programar(): void {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void respaldarSilencioso(), DEBOUNCE_MS)
}

/** Subida inmediata (al ocultar la app) sin respetar el debounce. */
async function volcarAhora(): Promise<void> {
  if (subiendo || !sucio || !uidActual || !navigator.onLine) return
  if (Date.now() - ultimaSubida < INTERVALO_MIN_MS) return
  window.clearTimeout(timer)
  await respaldarSilencioso()
}

async function respaldarSilencioso(): Promise<void> {
  if (subiendo || !sucio || !uidActual || !navigator.onLine) return
  if (Date.now() - ultimaSubida < INTERVALO_MIN_MS) {
    programar() // muy pronto — reprograma y espera
    return
  }
  subiendo = true
  sucio = false
  try {
    await respaldarNube(uidActual)
    ultimaSubida = Date.now()
    guardar(CLAVE_ULTIMA, Date.now())
  } catch (e) {
    sucio = true // falló (sin red, cuota…) — reintenta en el próximo cambio
    console.warn('[autoSync] respaldo falló, queda pendiente', e)
  } finally {
    subiendo = false
  }
}

/** Al iniciar sesión: trae lo que falte (una vez por sesión). */
async function entrar(uid: string): Promise<void> {
  pausado = true
  try {
    const r = await restaurarNube(uid)
    if (r.claves > 0 || r.audiosBajados > 0) {
      const partes: string[] = []
      if (r.claves > 0) partes.push(`${r.claves} datos`)
      if (r.audiosBajados > 0) partes.push(`${r.audiosBajados} canciones`)
      toastGlobal(`☁️ Recuperado de la nube: ${partes.join(' y ')}`, 'ok', 3600)
    }
    if (r.avisoStorage) {
      toastGlobal('Activá Storage en Firebase Console para respaldar también los MP3', 'info', 5000)
    }
  } catch (e) {
    console.warn('[autoSync] restauración al entrar falló', e)
  } finally {
    pausado = false
    sucio = true // lo restaurado ya está en la nube, pero igual sincroniza
    programar()
  }
}
