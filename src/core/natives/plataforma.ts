import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Share } from '@capacitor/share'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'

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

/** Abre la cámara/galería y devuelve la foto como dataUrl (null si canceló). */
export async function tomarFoto(calidad = 80): Promise<string | null> {
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

/** Arranque nativo: splash, status bar e init del login Google. Web-safe. */
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
    if (esNativo()) GoogleAuth.initialize()
  } catch {
    /* sin google-services configurado */
  }
}
