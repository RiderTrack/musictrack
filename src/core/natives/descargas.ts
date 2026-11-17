import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
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
  return `${nombreBaseArchivo(titulo, version)}.mp3`
}

/** v0.12.0 — nombre del PDF de la letra (misma base que el MP3
 * y el .lrc, para que se reconozcan como la misma canción). */
export function nombrePdf(titulo: string, version?: string): string {
  return `${nombreBaseArchivo(titulo, version)}.pdf`
}

/** v0.9.0 — nombre del .lrc (letra sincronizada): IGUAL base que
 * el MP3 para que el reproductor los empareje solo (Musicolet,
 * Poweramp y casi todos buscan "canción.lrc" al lado de
 * "canción.mp3"). */
export function nombreLrc(titulo: string, version?: string): string {
  return `${nombreBaseArchivo(titulo, version)}.lrc`
}

/** v0.20.0 — nombre del MP3 de una pista separada (voz, música de
 * karaoke, un instrumento): «Título (A) — Guitarra - MusicTrack». */
export function nombreStem(titulo: string, pista: string, version?: string): string {
  const t = titulo.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()
  const p = pista.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()
  const sufijo = version ? ` (${version})` : ''
  return `${t || 'Mi canción'}${sufijo} — ${p || 'pista'} - MusicTrack.mp3`
}

/** Base compartida del nombre de archivo: "Título (A) - MusicTrack". */
function nombreBaseArchivo(titulo: string, version?: string): string {
  const limpio = titulo
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const sufijo = version ? ` (${version})` : ''
  return `${limpio || 'Mi canción'}${sufijo} - MusicTrack`
}

/** 🩹 v0.23.2 — escribe un blob GRANDE por TROZOS: el video
 * karaoke de una canción de 6 minutos puede pasar los 200 MB,
 * y convertirlo entero a base64 de una sola vez (un string de
 * 300+ MB que después viaja por el bridge de Capacitor) revienta
 * la memoria del WebView: la app se cierra justo cuando la
 * barra llegaba al 100% y el video no se guardaba en ninguna
 * parte (lo sufrió Rudy). Así nunca hay más de un pedazo vivo:
 * el primero crea el archivo (y la carpeta) con writeFile y los
 * demás se pegan con appendFile — mismo resultado final, sin
 * funeral de memoria. */
async function escribirBlobPorTrozos(blob: Blob, path: string): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const TROZO = 8 * 1024 * 1024 // 8 MB por pasada
  for (let i = 0; i < bytes.length; i += TROZO) {
    const pedazo = bytes.subarray(i, Math.min(bytes.length, i + TROZO))
    let binario = ''
    for (let j = 0; j < pedazo.length; j += 0x8000) {
      binario += String.fromCharCode(...pedazo.subarray(j, j + 0x8000))
    }
    const data = btoa(binario)
    if (i === 0) {
      await Filesystem.writeFile({
        path,
        data,
        directory: Directory.Documents,
        recursive: true, // crea «Documentos/<carpeta>/» si no existe
      })
    } else {
      await Filesystem.appendFile({ path, data, directory: Directory.Documents })
    }
  }
  // blob de 0 bytes: igual dejar el archivo creado (vacío)
  if (!bytes.length) {
    await Filesystem.writeFile({ path, data: '', directory: Directory.Documents, recursive: true })
  }
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
  return guardarArchivoEnDescargas(blob, nombre, carpeta)
}

/** v0.12.0 — guarda CUALQUIER archivo (MP3, PDF, lo que sea) en
 * la carpeta de descargas de siempre. Es el mismo mecanismo del
 * MP3, con nombre genérico: el PDF de la letra lo usa tal cual. */
export async function guardarArchivoEnDescargas(
  blob: Blob,
  nombre: string,
  carpeta: string,
): Promise<ResultadoDescarga> {
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
      const path = carpetaLimpia ? `${carpetaLimpia}/${nombre}` : nombre
      // 🩹 v0.23.2 — por TROZOS: los archivos chicos (MP3, PDF)
      // son un solo trozo y quedan igual que siempre; los GRANDES
      // (el video karaoke) ya no revientan la memoria al guardarse
      await escribirBlobPorTrozos(blob, path)
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

/** v0.9.0 — guarda un archivo de TEXTO (el .lrc de la letra
 * sincronizada) en la misma carpeta que los MP3. Gemelo de
 * guardarMp3EnDescargas pero con encoding UTF-8 nativo. */
export async function guardarTextoEnDescargas(
  texto: string,
  nombre: string,
  carpeta: string,
): Promise<ResultadoDescarga> {
  const carpetaLimpia = sanearCarpeta(carpeta)
  try {
    if (esNativo()) {
      const path = carpetaLimpia ? `${carpetaLimpia}/${nombre}` : nombre
      await Filesystem.writeFile({
        path,
        data: texto,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      })
      return {
        ok: true,
        ruta: carpetaLimpia ? `Documentos/${carpetaLimpia}/${nombre}` : `Documentos/${nombre}`,
      }
    }
    // ── WEB ──
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = carpetaLimpia ? `${carpetaLimpia} - ${nombre}` : nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
    return { ok: true, ruta: `descargas del navegador (${nombre})` }
  } catch (e) {
    return { ok: false, ruta: '', error: e instanceof Error ? e.message : 'falló el guardado' }
  }
}
