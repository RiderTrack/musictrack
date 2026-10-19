import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Share } from '@capacitor/share'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Browser } from '@capacitor/browser'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { firebaseConfigurado } from '@/services/firebase'

// ═══════════════════════════════════════════════════════════
// 📱 CAPA NATIVA — Capacitor con guardas web: todo lo de acá
// se puede llamar desde cualquier vista sin pensar en la
// plataforma (en web degrada silenciosamente).
// ═══════════════════════════════════════════════════════════

export const esNativo = (): boolean => Capacitor.isNativePlatform()

/** 'web' | 'android' | 'ios' */
export const plataformaActual = (): string => Capacitor.getPlatform()

export async function vibrar(intensidad: 'ligera' | 'media' | 'fuerte' = 'ligera'): Promise<void> {
  try {
    const estilo =
      intensidad === 'fuerte' ? ImpactStyle.Heavy : intensidad === 'media' ? ImpactStyle.Medium : ImpactStyle.Light
    await Haptics.impact({ style: estilo })
  } catch {
    /* web sin soporte */
  }
}

export async function compartir(datos: { titulo?: string; texto?: string; url?: string }): Promise<boolean> {
  try {
    await Share.share({
      title: datos.titulo,
      text: datos.texto,
      url: datos.url,
      dialogTitle: datos.titulo,
    })
    return true
  } catch {
    return false // cancelado o sin soporte
  }
}

/** WEB: el selector de archivos del navegador como «galería» —
 * el plugin de Capacitor Camera necesita pwa-elements que acá no
 * cargamos, así que en web se elige la foto así (v0.12.0). */
function elegirImagenWeb(): Promise<string | null> {
  return new Promise((resolver) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.position = 'fixed'
    input.style.opacity = '0'
    input.onchange = () => {
      const archivo = input.files?.[0]
      input.remove()
      if (!archivo) {
        resolver(null)
        return
      }
      const lector = new FileReader()
      lector.onload = () => resolver(typeof lector.result === 'string' ? lector.result : null)
      lector.onerror = () => resolver(null)
      lector.readAsDataURL(archivo)
    }
    input.oncancel = () => {
      input.remove()
      resolver(null)
    }
    document.body.appendChild(input)
    input.click()
  })
}

/** Abre la cámara/galería y devuelve la foto como dataUrl (null si canceló).
 * En web usa el selector de archivos del navegador (v0.12.0). */
export async function tomarFoto(calidad = 80): Promise<string | null> {
  if (!esNativo()) return elegirImagenWeb()
  try {
    const foto = await Camera.getPhoto({
      quality: calidad,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      width: 1200,
    })
    return foto.dataUrl ?? null
  } catch {
    return null
  }
}

/** Abre una URL externa (APK, página): Custom Tab en Android, pestaña nueva en web. */
export async function abrirURL(url: string): Promise<boolean> {
  try {
    if (esNativo()) {
      await Browser.open({ url, presentationStyle: 'fullscreen' })
    } else {
      window.open(url, '_blank', 'noopener')
    }
    return true
  } catch {
    try {
      window.open(url, '_blank', 'noopener')
      return true
    } catch {
      return false
    }
  }
}

/** Copia texto al portapapeles — con fallback para WebView nativa. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

/** Arranque nativo: splash, status bar e init del login Google (solo con Firebase). Web-safe. */
export async function arranqueNativo(): Promise<void> {
  try {
    await SplashScreen.hide()
  } catch {
    /* web */
  }
  try {
    await StatusBar.setStyle({ style: Style.Dark })
  } catch {
    /* web */
  }
  try {
    // 🩹 FIX crash al abrir: sin scopes en capacitor.config el plugin crea
    // new Scope("") y crashea la app al arrancar. Además, sin Firebase
    // configurado no tiene sentido inicializar el login Google nativo.
    if (esNativo() && firebaseConfigurado) GoogleAuth.initialize()
  } catch {
    /* sin google-services configurado */
  }
}
