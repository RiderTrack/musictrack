// ═══════════════════════════════════════════════════════════
// 🎼 MP3 CON LETRA (v0.9.0) — el pedido del usuario: bajar la
// canción y que SU reproductor de música muestre la letra que
// sigue a la canción, «como en Spotify». Son dos piezas:
//
//   1. ID3v2.3 incrustado EN el MP3 (título, artista, álbum,
//      género, portada y la letra completa como frame USLT —
//      el estándar que leen los reproductores).
//   2. Un archivo .lrc AL LADO del MP3 (mismo nombre): la letra
//      con marcas de tiempo [01:23.45] por línea — el formato
//      que usan Musicolet, Poweramp y compañía para pintar la
//      letra que avanza con la música. Los tiempos salen de la
//      letra sincronizada de Suno (get-timestamped-lyrics);
//      si la API no la tiene, se estiman repartiendo la letra
//      a lo largo de la canción (y se puede corregir el corrimiento
//      desde el propio reproductor).
//
// Todo se escribe a mano (sin librerías): son ~150 bytes de
// especificación ID3 y queda bundle-cero.
// ═══════════════════════════════════════════════════════════

/** Palabra sincronizada — misma forma que PalabraSincronizada de
 * suno.ts (se declara acá para que el módulo viva solo). */
export interface PalabraConTiempo {
  palabra: string
  startS: number
  endS: number
}

/** Una línea de letra lista para el .lrc. */
export interface LineaLrc {
  texto: string
  startS: number
}

export interface EtiquetasMp3 {
  titulo: string
  artista: string
  album: string
  genero?: string
  /** Letra completa (frame USLT — la muestran los reproductores). */
  letra?: string
  /** Portada como blob de imagen (frame APIC — si falla, se omite). */
  portada?: Blob
}

// ── UTF-16LE con BOM (encoding "1" de ID3v2.3) ──────────────
// TextEncoder solo sabe UTF-8, así que el UTF-16 se arma a mano:
// BOM FF FE + cada code unit en little-endian (con pares
// suplentes para los emojis, por si la letra trae uno).

function utf16le(texto: string): Uint8Array {
  const unidades: number[] = []
  for (const ch of texto) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp > 0xffff) {
      // par suplente (emoji y símbolos fuera del BMP)
      unidades.push(Math.floor((cp - 0x10000) / 0x400) + 0xd800)
      unidades.push(((cp - 0x10000) % 0x400) + 0xdc00)
    } else {
      unidades.push(cp)
    }
  }
  const bytes = new Uint8Array(2 + unidades.length * 2)
  bytes[0] = 0xff
  bytes[1] = 0xfe
  for (let i = 0; i < unidades.length; i++) {
    bytes[2 + i * 2] = unidades[i] & 0xff
    bytes[3 + i * 2] = unidades[i] >> 8
  }
  return bytes
}

/** Descriptor de texto vacío UTF-16 terminado en \0\0 (lo piden
 * USLT y APIC entre el encabezado y el contenido). */
const DESCRIPTOR_VACIO = new Uint8Array([0xff, 0xfe, 0x00, 0x00])

/** Frame ID3v2.3: ID(4) + tamaño uint32 BE + flags(2) + contenido. */
function armarMarco(id: string, contenido: Uint8Array): Uint8Array {
  const marco = new Uint8Array(10 + contenido.length)
  for (let i = 0; i < 4; i++) marco[i] = id.charCodeAt(i)
  const t = contenido.length
  marco[4] = (t >>> 24) & 0xff
  marco[5] = (t >>> 16) & 0xff
  marco[6] = (t >>> 8) & 0xff
  marco[7] = t & 0xff
  marco.set(contenido, 10)
  return marco
}

/** Frame de texto (TIT2, TPE1, TALB, TCON…): encoding UTF-16 + texto. */
function marcoTexto(id: string, texto: string): Uint8Array {
  const datos = utf16le(texto)
  const contenido = new Uint8Array(1 + datos.length)
  contenido[0] = 1 // UTF-16 con BOM
  contenido.set(datos, 1)
  return armarMarco(id, contenido)
}

/** Frame USLT (letra): encoding + idioma "spa" + descriptor + letra. */
function marcoLetra(letra: string): Uint8Array {
  const texto = utf16le(letra)
  const contenido = new Uint8Array(1 + 3 + DESCRIPTOR_VACIO.length + texto.length)
  contenido[0] = 1 // UTF-16 con BOM
  contenido[1] = 0x73 // s
  contenido[2] = 0x70 // p
  contenido[3] = 0x61 // a
  contenido.set(DESCRIPTOR_VACIO, 4)
  contenido.set(texto, 4 + DESCRIPTOR_VACIO.length)
  return armarMarco('USLT', contenido)
}

/** Frame APIC (portada): encoding + MIME + \0 + tipo + descriptor + bytes. */
async function marcoPortada(portada: Blob): Promise<Uint8Array> {
  const bytes = new Uint8Array(await portada.arrayBuffer())
  const mime = portada.type.includes('png') ? 'image/png' : 'image/jpeg'
  const mimeBytes = new Uint8Array(mime.length + 1)
  for (let i = 0; i < mime.length; i++) mimeBytes[i] = mime.charCodeAt(i)
  const contenido = new Uint8Array(1 + mimeBytes.length + 1 + DESCRIPTOR_VACIO.length + bytes.length)
  let o = 0
  contenido[o++] = 1 // UTF-16 con BOM
  contenido.set(mimeBytes, o)
  o += mimeBytes.length
  contenido[o++] = 0x03 // portada frontal
  contenido.set(DESCRIPTOR_VACIO, o)
  o += DESCRIPTOR_VACIO.length
  contenido.set(bytes, o)
  return armarMarco('APIC', contenido)
}

function concatenar(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of partes) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** Le saca la cabecera ID3v2 a un MP3 (para no dejar un tag viejo
 * pegado en el medio al concatenar o re-etiquetar). Exportada: la
 * usa «unir y bajar la completa» en la Biblioteca. */
export async function quitarId3(blob: Blob): Promise<Blob> {
  const cabeza = new Uint8Array(await blob.slice(0, 10).arrayBuffer())
  if (cabeza.length < 10 || cabeza[0] !== 0x49 || cabeza[1] !== 0x44 || cabeza[2] !== 0x33) return blob // "ID3"
  const tamanio = (cabeza[6] << 21) | (cabeza[7] << 14) | (cabeza[8] << 7) | cabeza[9]
  return blob.slice(10 + tamanio)
}

/**
 * Incrusta las etiquetas ID3v2.3 en un MP3: TIT2 (título), TPE1
 * (artista), TALB (álbum), TCON (género/estilo), USLT (letra
 * completa) y APIC (portada, si se pudo bajar). El MP3 original
 * se limpia de cualquier ID3 previo y el nuevo tag va al frente.
 * Devuelve un NUEVO blob — el original no se toca.
 */
export async function incrustarEtiquetasMp3(blob: Blob, et: EtiquetasMp3): Promise<Blob> {
  const marcos: Uint8Array[] = [marcoTexto('TIT2', et.titulo), marcoTexto('TPE1', et.artista), marcoTexto('TALB', et.album)]
  if (et.genero && et.genero.trim()) marcos.push(marcoTexto('TCON', et.genero))
  if (et.letra && et.letra.trim()) marcos.push(marcoLetra(et.letra))
  if (et.portada) {
    try {
      marcos.push(await marcoPortada(et.portada))
    } catch {
      /* sin portada no pasa nada — el audio y la letra siguen */
    }
  }
  const cuerpo = concatenar(marcos)
  // padding: aire en cero para que un editor futuro meta datos sin
  // reescribir el archivo entero (buena práctica ID3).
  const padding = new Uint8Array(256)
  const tamanioTag = cuerpo.length + padding.length
  const cabecera = new Uint8Array(10)
  cabecera[0] = 0x49 // I
  cabecera[1] = 0x44 // D
  cabecera[2] = 0x33 // 3
  cabecera[3] = 0x03 // versión 2.3.0
  cabecera[4] = 0x00
  cabecera[5] = 0x00 // sin flags
  // tamaño synchsafe (7 bits por byte)
  cabecera[6] = (tamanioTag >>> 21) & 0x7f
  cabecera[7] = (tamanioTag >>> 14) & 0x7f
  cabecera[8] = (tamanioTag >>> 7) & 0x7f
  cabecera[9] = tamanioTag & 0x7f
  const audio = await quitarId3(blob)
  return new Blob([cabecera, cuerpo, padding, audio], { type: 'audio/mpeg' })
}

// ═══════════════════════════════════════════════════════════
// 📝 .LRC — letra sincronizada (formato de reproductores)
// ═══════════════════════════════════════════════════════════

/** 78.4 → "[01:18.40]" (marca de tiempo estándar LRC). */
function selloLrc(seg: number): string {
  const m = Math.floor(seg / 60)
  const s = Math.floor(seg % 60)
  const cs = Math.floor((seg % 1) * 100)
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`
}

function mmss(seg: number): string {
  const m = Math.floor(seg / 60)
  const s = Math.round(seg % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Arma el CONTENIDO del archivo .lrc: metadatos + una línea con
 * su marca de tiempo por línea cantable. */
export function armarLrc(lineas: LineaLrc[], meta: { titulo: string; artista: string; duracionSeg?: number }): string {
  const partes = [`[ti:${meta.titulo}]`, `[ar:${meta.artista}]`, `[by:MusicTrack]`]
  if (meta.duracionSeg && meta.duracionSeg > 0) partes.push(`[length:${mmss(meta.duracionSeg)}]`)
  for (const l of lineas) partes.push(`${selloLrc(l.startS)}${l.texto}`)
  return `${partes.join('\n')}\n`
}

/** Palabras CANTABLES de una línea (las marcas [Coro] no cuentan). */
function palabrasDeLinea(linea: string): number {
  return linea
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
}

/**
 * LÍNEAS CON TIEMPOS REALES: recorre la letra línea por línea y le
 * asigna a cada una el segundo donde EMPIEZA su primera palabra
 * según la letra sincronizada de Suno (get-timestamped-lyrics).
 * Las marcas [Coro] y líneas vacías no van al .lrc. Si Suno cantó
 * menos palabras que la letra (canción cortada), el .lrc llega
 * hasta donde se cantó — lo que falta se completa con Extender.
 */
export function lineasConTiempo(letra: string, palabras: PalabraConTiempo[]): LineaLrc[] {
  const out: LineaLrc[] = []
  let idx = 0
  for (const linea of letra.split('\n')) {
    const cantables = palabrasDeLinea(linea)
    if (!cantables) continue
    const primera = palabras[idx]
    if (!primera) break // la API devolvió menos palabras: hasta acá
    idx += cantables
    out.push({ texto: linea.trim(), startS: primera.startS })
  }
  return out
}

/**
 * RESPALDO ESTIMADO (sin letra sincronizada): reparte las líneas a
 * lo largo de la duración según cuántas palabras tiene cada una,
 * dejando un pequeño intro instrumental. No es exacto — pero la
 * mayoría de los reproductores deja corregir el corrimiento con un
 * «offset», y para seguir la letra a ojo sirve de sobra.
 * Devuelve [] si no hay duración conocida (mejor no mandar un .lrc
 * con puros inventos que uno vacío).
 */
export function estimarLineasConTiempo(letra: string, duracionSeg?: number): LineaLrc[] {
  if (!duracionSeg || duracionSeg < 10) return []
  const lineas = letra
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\[[^\]]*\]$/.test(l))
  if (!lineas.length) return []
  const pesos = lineas.map((l) => Math.max(2, palabrasDeLinea(l)))
  const total = pesos.reduce((a, b) => a + b, 0)
  const intro = Math.min(12, duracionSeg * 0.08)
  const canto = Math.max(10, duracionSeg - intro - 4)
  let acum = 0
  return lineas.map((texto, i) => {
    const startS = intro + (acum / total) * canto
    acum += pesos[i]
    return { texto, startS }
  })
}
