// ═══════════════════════════════════════════════════════════
// ☁️ FIREBASE — pegá acá las claves de TU proyecto (las mismas
// que usan tus otras apps Track).
//
// • Sin claves → la app funciona 100% LOCAL: login y sync en la
//   nube quedan deshabilitados (con aviso amable en la UI).
// • Para Android además: guardá el google-services.json en el
//   secret GOOGLE_SERVICES_JSON de GitHub y la CI lo inyecta
//   sola (ver README, sección Firebase).
// ═══════════════════════════════════════════════════════════

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const configFirebase = {
  apiKey: '',            // ← TU API KEY
  authDomain: '',        // ← TU_PROYECTO.firebaseapp.com
  projectId: '',         // ← TU_PROYECTO
  storageBucket: '',     // ← TU_PROYECTO.appspot.com
  messagingSenderId: '', // ← sender id
  appId: '',             // ← app id
}

/** ¿Hay claves? Si es false, todo lo que toca Firebase se desactiva. */
export const firebaseConfigurado = Boolean(configFirebase.apiKey && configFirebase.projectId)

let app: FirebaseApp | null = null

function obtenerApp(): FirebaseApp {
  if (!firebaseConfigurado) {
    throw new Error('Firebase sin configurar — completá las claves en src/services/firebase.ts')
  }
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(configFirebase)
  }
  return app
}

export function obtenerAuth(): Auth {
  return getAuth(obtenerApp())
}

export function obtenerFirestore(): Firestore {
  return getFirestore(obtenerApp())
}
