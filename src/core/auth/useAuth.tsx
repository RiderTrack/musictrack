import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut, type User } from 'firebase/auth'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { esNativo } from '@/core/natives/plataforma'
import { firebaseConfigurado, obtenerAuth } from '@/services/firebase'
import type { Sesion } from '@/types'

// ═══════════════════════════════════════════════════════════
// 👤 SESIÓN — patrón familia Track:
// • Web: popup de Google (Firebase Auth).
// • Android: plugin nativo @codetrix-studio (necesita el
//   google-services.json en la CI + SHA-1 del keystore en
//   Firebase Console — el workflow generate-keystore te da
//   las huellas).
// • Sin Firebase configurado: modo local, sin sesión (la app
//   funciona igual, solo sin sync en la nube).
// ═══════════════════════════════════════════════════════════

interface CtxAuth {
  sesion: Sesion | null
  cargando: boolean
  loginGoogle: () => Promise<void>
  salir: () => Promise<void>
}

const Ctx = createContext<CtxAuth | null>(null)

function mapearUsuario(u: User): Sesion {
  return {
    uid: u.uid,
    nombre: u.displayName || u.email?.split('@')[0] || 'Usuario',
    foto: u.photoURL || undefined,
    esLocal: false,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [cargando, setCargando] = useState(firebaseConfigurado)

  useEffect(() => {
    if (!firebaseConfigurado) return
    const unsubscribe = onAuthStateChanged(obtenerAuth(), (u) => {
      setSesion(u ? mapearUsuario(u) : null)
      setCargando(false)
    })
    return unsubscribe
  }, [])

  async function loginGoogle(): Promise<void> {
    if (!firebaseConfigurado) {
      throw new Error('Firebase sin configurar — completá src/services/firebase.ts')
    }
    if (esNativo()) {
      const resultado = await GoogleAuth.signIn()
      const credencial = GoogleAuthProvider.credential(resultado.authentication?.idToken)
      await signInWithCredential(obtenerAuth(), credencial)
    } else {
      await signInWithPopup(obtenerAuth(), new GoogleAuthProvider())
    }
  }

  async function salir(): Promise<void> {
    if (firebaseConfigurado) await signOut(obtenerAuth())
    try {
      await GoogleAuth.signOut()
    } catch {
      /* web: no aplica */
    }
    setSesion(null)
  }

  const valor = useMemo<CtxAuth>(() => ({ sesion, cargando, loginGoogle, salir }), [sesion, cargando])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAuth(): CtxAuth {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
