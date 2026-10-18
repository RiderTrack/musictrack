import { Filesystem, Directory } from '@capacitor/filesystem'
import { esNativo } from './plataforma'

// ═══════════════════════════════════════════════════════════
// 💾 DESCARGA DE MP3 (v0.7.1) — el bug del toast mentiroso:
// el truco del <a download> con blob URL NO descarga nada en la
// WebView de Android (Capacitor): el click se ignora en silencio
// y la canción no llegaba a ninguna parte, aunque la app dijera
// «guardado en tus descargas». La forma correcta en nativo es
// el plugin Filesystem escribiendo en la carpeta pública
// Documentos, dentro de una carpeta propia (default «Música de
// Rudy», configurable en Ajustes). En web, el link clásico sí
// funciona (ahí el navegador sí baja el archivo).
// Nota: @capacitor/filesystem v6 no ofrece Downloads — Documents
// es la carpeta pública equivalente (misma raíz del almacenamiento,
// visible en el explorador y escaneada por los reproductores).
// ═══════════════════════════════════════════════════════════

/** Sanea el nombre de la carpeta: sin barras ni caracteres que
 * rompan rutas (Documentos/Mi música/…). Vacío → sin subcarpeta. */
export function sanearCarpeta(carpeta: string): string {
  return carpeta
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nombre de archivo seguro para el MP3 que se descarga. */
export function nombreMp3(titulo: string, version?: string): string {
  const limpio = titulo
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const sufijo = version ? ` (${version})` : ''
  return `${limpio || 'Mi canción'}${sufijo} - MusicTrack.mp3`
}

/** Blob → base64 (sin perder bytes por UTF-8: recorre el buffer). */
async function blobABase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binario = ''
  const TROZO = 0x8000 // 32 KB por pasada — tope de apply en móviles viejos
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO))
  }
  return btoa(binario)
}

export interface ResultadoDescarga {
  ok: boolean
  /** Dónde quedó el archivo, amigable para el toast. */
  ruta: string
  error?: string
}

/**
 * Guarda el MP3 en el dispositivo:
 *  • APK (Android): Documentos/<carpeta>/<nombre>.mp3 vía plugin
 *    nativo — carpeta pública del almacenamiento, visible en el
 *    explorador de archivos y en las apps de música.
 *  • Web: descarga clásica del navegador (a su carpeta Descargas).
 * No lanza excepciones: devolvé ResultadoDescarga y mostralo.
 */
export async function guardarMp3EnDescargas(blob: Blob, nombre: string, carpeta: string): Promise<ResultadoDescarga> {
  const carpetaLimpia = sanearCarpeta(carpeta)
  try {
    if (esNativo()) {
      // Android 9 o menor pide permiso de almacenamiento para la
      // carpeta pública: pedirlo UNA vez antes del primer guardado.
      try {
        const permisos = await Filesystem.checkPermissions()
        if (permisos.publicStorage !== 'granted') {
          const pedido = await Filesystem.requestPermissions()
          if (pedido.publicStorage !== 'granted') {
            return { ok: false, ruta: '', error: 'permiso de almacenamiento denegado' }
          }
        }
      } catch {
        /* en Android 10+ el permiso no aplica — seguimos derecho */
      }
      const base64 = await blobABase64(blob)
      const path = carpetaLimpia ? `${carpetaLimpia}/${nombre}` : nombre
      await Filesystem.writeFile({
        path,
        data: base64,
        directory: Directory.Documents,
        recursive: true, // crea «Documentos/<carpeta>/» si no existe
      })
      return {
        ok: true,
        ruta: carpetaLimpia ? `Documentos/${carpetaLimpia}/${nombre}` : `Documentos/${nombre}`,
      }
    }
    // ── WEB: el <a download> sí funciona acá ──
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = carpetaLimpia ? `${carpetaLimpia} - ${nombre}` : nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
    // el blob vive en memoria: revocar tarde para no cortar la descarga
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
    return { ok: true, ruta: `descargas del navegador (${nombre})` }
  } catch (e) {
    return { ok: false, ruta: '', error: e instanceof Error ? e.message : 'falló el guardado' }
  }
}
