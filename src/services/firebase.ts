// ═══════════════════════════════════════════════════════════
// ☁️ FIREBASE — la configuración de TU proyecto, de dos maneras:
//
// 1️⃣ Ajustes de la app (v0.12.0 — recomendado): pegás las claves
//    en Ajustes → «Cuenta Google (Firebase)» y la app las guarda
//    en localStorage. Sin tocar código ni re-buildear nada.
// 2️⃣ Acá abajo en el código (el patrón viejo de la familia
//    Track): sirve para dejarlas fijas de fábrica.
//
// • Sin claves → la app funciona 100% LOCAL: login y sync en la
//   nube quedan deshabilitados (con aviso amable en la UI).
// • Para Android además: guardá el google-services.json en el
//   secret GOOGLE_SERVICES_JSON de GitHub y la CI lo inyecta
//   sola (ver README, sección Firebase).
//
// ⚠️ La guía PASO A PASO (con capturas mentales) está en
// Ajustes → Cuenta Google: crear proyecto, habilitar Google
// Sign-In, crear la app web y copiar el firebaseConfig.
// ═══════════════════════════════════════════════════════════

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { APP } from '@/data/app'

export interface ConfigFirebase {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

/** Claves fijas de fábrica (vacías = se usa la de Ajustes). */
const configArchivo: ConfigFirebase = {
  apiKey: '',            // ← TU API KEY (opcional: también va en Ajustes)
  authDomain: '',        // ← TU_PROYECTO.firebaseapp.com
  projectId: '',         // ← TU_PROYECTO
  storageBucket: '',     // ← TU_PROYECTO.appspot.com
  messagingSenderId: '', // ← sender id
  appId: '',             // ← app id
}

const CLAVE_STORAGE = `${APP.prefijoClaves}_firebase`

function configDesdeAjustes(): ConfigFirebase | null {
  try {
    const crudo = localStorage.getItem(CLAVE_STORAGE)
    if (!crudo) return null
    const cfg = JSON.parse(crudo) as Partial<ConfigFirebase>
    if (!cfg.apiKey || !cfg.projectId) return null
    return {
      apiKey: cfg.apiKey,
      authDomain: cfg.authDomain || `${cfg.projectId}.firebaseapp.com`,
      projectId: cfg.projectId,
      storageBucket: cfg.storageBucket || `${cfg.projectId}.appspot.com`,
      messagingSenderId: cfg.messagingSenderId || '',
      appId: cfg.appId || '',
    }
  } catch {
    return null
  }
}

/** La config RESUELTA: la del código manda; si está vacía, la
 * pegada en Ajustes. null = no hay Firebase. */
const configFinal: ConfigFirebase | null = configArchivo.apiKey
  ? configArchivo
  : configDesdeAjustes()

/** ¿Hay claves? Si es false, todo lo que toca Firebase se desactiva. */
export const firebaseConfigurado = configFinal !== null

/** La configuración activa (para mostrarla en Ajustes). */
export function configFirebaseActual(): ConfigFirebase | null {
  return configFinal
}

/** De dónde salió la config activa: 'codigo' (fábrica), 'ajustes'
 * (la pegó el usuario) o null (no hay). */
export function fuenteConfigFirebase(): 'codigo' | 'ajustes' | null {
  if (configArchivo.apiKey) return 'codigo'
  return configFinal ? 'ajustes' : null
}

/** v0.12.0 — parsea el bloque firebaseConfig que copia la gente
 * de Firebase Console (JavaScript o JSON, da igual): agarra todos
 * los pares clave: 'valor' que encuentre. Requiere apiKey y
 * projectId; el resto se completa solo. */
export function parsearConfigFirebase(texto: string): ConfigFirebase | null {
  const pares: Record<string, string> = {}
  const re = /([A-Za-z]+)\s*:\s*["'`]([^"'`]+)["'`]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) pares[m[1]] = m[2].trim()
  if (!pares.apiKey || !pares.projectId) return null
  return {
    apiKey: pares.apiKey,
    authDomain: pares.authDomain || `${pares.projectId}.firebaseapp.com`,
    projectId: pares.projectId,
    storageBucket: pares.storageBucket || `${pares.projectId}.appspot.com`,
    messagingSenderId: pares.messagingSenderId || '',
    appId: pares.appId || '',
  }
}

/** Guarda la config pegada en Ajustes (localStorage) — la app se
 * recarga al guardar para que el SDK la levante limpia. */
export function guardarConfigFirebase(cfg: ConfigFirebase): void {
  localStorage.setItem(CLAVE_STORAGE, JSON.stringify(cfg))
}

/** Borra la config de Ajustes (la del código, si existe, queda). */
export function borrarConfigFirebase(): void {
  localStorage.removeItem(CLAVE_STORAGE)
}

let app: FirebaseApp | null = null

function obtenerApp(): FirebaseApp {
  if (!configFinal) {
    throw new Error('Firebase sin configurar — completalo en Ajustes → Cuenta Google (Firebase)')
  }
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(configFinal)
  }
  return app
}

export function obtenerAuth(): Auth {
  return getAuth(obtenerApp())
}

export function obtenerFirestore(): Firestore {
  return getFirestore(obtenerApp())
}
