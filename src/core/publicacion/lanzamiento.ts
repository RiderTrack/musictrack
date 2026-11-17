import { cargarImagenSegura } from '@/core/video/karaoke'

// ═══════════════════════════════════════════════════════════
// 🚀 LANZAMIENTO A SPOTIFY (v0.24.0) — FASE 20, pedido de Rudy:
// «la siguiente fase era la de Spotify» — llevar SUS canciones
// al streaming. Spotify (ni Apple ni ninguna tienda) deja subir
// música directo: se entra por un DISTRIBUIDOR. Lo que este
// módulo resuelve es TODO lo que el distribuidor le va a pedir,
// armado en la app y sin gastar un crédito:
//
//   ① METADATOS del lanzamiento (título, artista, género,
//      idioma, fecha, explícito) → texto listo para copiar
//   ② PORTADA cuadrada de 3000×3000 JPG — el estándar que
//      piden los distribuidores (Spotify acepta de 640px a
//      10000px, pero 3000×3000 es la medida que todos toman
//      sin rechistar)
//   ③ El PAQUETE .zip: MP3 + portada + datos, listo para
//      subirlo o adjuntarlo
//   ④ La guía de distribuidores vive en la interfaz
//      (ModalPublicar) — los precios y reglas que ahí se
//      muestran se verificaron en nov-2026.
//
// Este archivo es el MOTOR puro (sin React): se puede testear
// con node. La interfaz vive en components/publicacion.
// ═══════════════════════════════════════════════════════════

/** El lado del estándar de portada de lanzamiento. */
export const LADO_PORTADA = 3000

/** Tope de tamaño interno de la portada (4 MB: margen para los
 * topes más comunes de los distribuidores sin pedir de más). */
export const TOPE_PORTADA = 4 * 1024 * 1024

/** Nombres de los archivos DENTRO del .zip (estables para que
 * la guía del paso 4 pueda decir «subí portada-3000x3000.jpg»). */
export const NOMBRE_PORTADA_ZIP = 'portada-3000x3000.jpg'
export const NOMBRE_DATOS_ZIP = 'datos-del-lanzamiento.txt'

// ── ① datos del lanzamiento ────────────────────────────────

export interface DatosLanzamiento {
  /** Título de la canción tal cual se verá en Spotify. */
  titulo: string
  /** Nombre artístico (el que va a reclamar en Spotify for Artists). */
  artista: string
  /** Quién escribió la letra / compuso (campos de compositor que
   * piden los distribuidores). */
  compositor: string
  /** id del género (ver GENEROS). */
  generoId: string
  /** id del idioma (ver IDIOMAS). */
  idioma: string
  /** Fecha deseada de salida (YYYY-MM-DD) — vacío = lo antes posible. */
  fecha: string
  /** ¿Tiene lenguaje explícito? (los distribuidores lo preguntan). */
  explicito: boolean
}

export interface GeneroLanzamiento {
  id: string
  /** Nombre en español para el selector. */
  nombre: string
  /** Nombre canónico EN INGLÉS — es el que hay que escribir en el
   * formulario del distribuidor (los géneros de las tiendas están
   * en inglés, igual que las etiquetas de estilo de Suno). */
  spotify: string
  /** Palabras clave (minúsculas) para sugerir el género a partir
   * del estilo de la canción. */
  claves: string[]
}

/** Géneros curados para lanzamiento — ordenados de lo ESPECÍFICO
 * a lo general (la sugerencia recorre la lista y matchea el
 * primero, así «cumbia peruana» no cae en «cumbia» a secas). */
export const GENEROS: GeneroLanzamiento[] = [
  { id: 'power-metal', nombre: 'Power metal', spotify: 'Power Metal', claves: ['power metal', 'powermetal'] },
  { id: 'metal-sinfonico', nombre: 'Metal sinfónico', spotify: 'Symphonic Metal', claves: ['sinfon', 'symphonic', 'orchestral metal'] },
  { id: 'metal', nombre: 'Metal', spotify: 'Metal', claves: ['metal', 'metalcore', 'thrash', 'death', 'doom', 'nu metal'] },
  { id: 'punk', nombre: 'Punk', spotify: 'Punk', claves: ['punk', 'hardcore'] },
  { id: 'cumbia-peruana', nombre: 'Cumbia peruana', spotify: 'Peruvian Cumbia', claves: ['cumbia peruana', 'chicha', 'huaylash', 'sonidera'] },
  { id: 'cumbia', nombre: 'Cumbia', spotify: 'Cumbia', claves: ['cumbia'] },
  { id: 'salsa', nombre: 'Salsa', spotify: 'Salsa', claves: ['salsa', 'son cubano'] },
  { id: 'jrock', nombre: 'J-Rock / anime', spotify: 'J-Rock', claves: ['j-rock', 'jrock', 'anime'] },
  { id: 'criolla', nombre: 'Música criolla', spotify: 'Música Criolla', claves: ['crioll', 'marinera', 'festejo', 'tondero'] },
  { id: 'vals', nombre: 'Vals peruano', spotify: 'Peruvian Waltz', claves: ['vals'] },
  { id: 'folclore', nombre: 'Folclore andino', spotify: 'Latin Folk', claves: ['folclore', 'folklore', 'andin', 'huayno'] },
  { id: 'balada', nombre: 'Balada', spotify: 'Ballad', claves: ['balada', 'ballad'] },
  { id: 'pop-latino', nombre: 'Pop latino', spotify: 'Latin Pop', claves: ['pop latino', 'latino'] },
  { id: 'urbano', nombre: 'Reggaetón / urbano', spotify: 'Reggaeton', claves: ['reggaet', 'trap', 'urbano', 'perreo'] },
  { id: 'hiphop', nombre: 'Hip-hop / rap', spotify: 'Hip-Hop/Rap', claves: ['hip-hop', 'hip hop', 'rap'] },
  { id: 'electronica', nombre: 'Electrónica / EDM', spotify: 'Electronic/EDM', claves: ['electr', 'edm', 'synthwave', 'techno', 'house', 'dance'] },
  { id: 'rock', nombre: 'Rock', spotify: 'Rock', claves: ['rock', 'grunge', 'indie'] },
  { id: 'pop', nombre: 'Pop', spotify: 'Pop', claves: ['pop'] },
  { id: 'instrumental', nombre: 'Instrumental', spotify: 'Instrumental', claves: [] },
  { id: 'otro', nombre: 'Otro / songwriter', spotify: 'Songwriter', claves: [] },
]

export const IDIOMAS: Array<{ id: string; nombre: string }> = [
  { id: 'es', nombre: 'Español' },
  { id: 'en', nombre: 'Inglés' },
  { id: 'ja', nombre: 'Japonés' },
  { id: 'pt', nombre: 'Portugués' },
  { id: 'instrumental', nombre: 'Sin letra (instrumental)' },
]

/** Sugiere el género del lanzamiento a partir del estilo que la
 * canción ya tiene (búsqueda por palabras clave, específico
 * primero). Sin match → '' (que el usuario elija). */
export function generoSugerido(estilo?: string): string {
  const e = (estilo ?? '').toLowerCase()
  if (!e.trim()) return ''
  for (const g of GENEROS) {
    if (g.claves.some((k) => e.includes(k))) return g.id
  }
  return ''
}

/** ¿Los datos alcanzan para llenar el formulario de un
 * distribuidor? Devuelve lo que falta, en español amable. */
export function validarLanzamiento(datos: DatosLanzamiento): { faltan: string[] } {
  const faltan: string[] = []
  if (!datos.titulo.trim()) faltan.push('el título de la canción')
  if (!datos.artista.trim()) faltan.push('tu nombre de artista')
  if (!datos.compositor.trim()) faltan.push('quién compuso / escribió la letra')
  if (!GENEROS.some((g) => g.id === datos.generoId)) faltan.push('el género musical')
  if (!IDIOMAS.some((i) => i.id === datos.idioma)) faltan.push('el idioma de la letra')
  return { faltan }
}

// ── el texto de metadatos (lo que se pega / viaja en el zip) ──

export interface ContextoMetadatos {
  /** Estilo original con el que se generó (va como subgénero). */
  estilo?: string
  /** Versión A/B si la canción es de un grupo. */
  version?: string
  duracionSeg?: number
  /** Bitrate estimado del MP3 (kbps) — calculado con kbpsDe. */
  bitrateKbps?: number
  instrumental?: boolean
  /** Letra completa (para que el distribuidor de letras la tome). */
  letra?: string
}

/** Arma la hoja de datos del lanzamiento: todos los campos que
 * pide el formulario de un distribuidor, en texto plano listo
 * para leer mientras cargás o para copiar y pegar. */
export function textoMetadatos(datos: DatosLanzamiento, ctx: ContextoMetadatos): string {
  const genero = GENEROS.find((g) => g.id === datos.generoId)
  const idioma = IDIOMAS.find((i) => i.id === datos.idioma)
  const dur = ctx.duracionSeg ? formatoDuracion(ctx.duracionSeg) : ''
  const separador = '─'.repeat(46)
  const lineas: string[] = [
    separador,
    'LANZAMIENTO PARA SPOTIFY (y demás tiendas)',
    `Preparado con MusicTrack — ${new Date().toLocaleDateString('es-PE')}`,
    separador,
    '',
    `Título de la canción : ${datos.titulo.trim()}`,
    `Artista              : ${datos.artista.trim()}`,
    `Compositor / letrista: ${datos.compositor.trim()}`,
    `Género (para el form): ${genero?.spotify ?? '(elegí uno)'}`,
    `Subgénero / estilo   : ${ctx.estilo?.trim() || '—'}${ctx.version ? ` (versión ${ctx.version})` : ''}`,
    `Idioma de la letra   : ${ctx.instrumental || datos.idioma === 'instrumental' ? 'Instrumental' : (idioma?.nombre ?? '—')}`,
    `Contenido explícito  : ${datos.explicito ? 'SÍ' : 'no'}`,
    `Tipo de lanzamiento  : Single (1 canción)`,
    `Fecha de salida      : ${datos.fecha || 'lo antes posible'}`,
    `Duración             : ${dur || '—'}`,
    `Formato del audio    : MP3${ctx.bitrateKbps ? ` (~${ctx.bitrateKbps} kbps)` : ''} — el WAV original vive en suno.com`,
    `Portada              : ${NOMBRE_PORTADA_ZIP} (cuadrada, JPG)`,
    `ISRC / UPC           : los asigna tu distribuidor — dejalos vacíos`,
    '',
    separador,
    'LETRA COMPLETA',
    separador,
    ctx.instrumental ? '(instrumental — no tiene letra)' : (ctx.letra?.trim() || '(sin letra guardada)'),
    '',
    separador,
    'NOTAS ANTES DE PUBLICAR',
    separador,
    '· Suno da derechos comerciales solo con plan Pro/Premier;',
    '  con plan gratis las canciones no se pueden monetizar.',
    '· Si tu canción salió por una pasarela no oficial (como',
    '  sunoapi.org), revisá SUS términos antes de monetizar.',
    '· El distribuidor te va a preguntar si usa IA: decí la verdad',
    '  — Spotify acepta música hecha con IA.',
    '· No publiques letras ni melodías ajenas (covers de otros',
    '  artistas): los distribuidores vetan cuentas por eso.',
  ]
  return lineas.join('\n') + '\n'
}

function formatoDuracion(seg: number): string {
  const m = Math.floor(seg / 60)
  const s = Math.round(seg % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Estima el bitrate del MP3 (kbps) a partir del tamaño y la
 * duración — honesto: dice «~». */
export function kbpsDe(blob: Blob, duracionSeg?: number): number | undefined {
  if (!duracionSeg || duracionSeg <= 0 || !blob.size) return undefined
  return Math.round((blob.size * 8) / duracionSeg / 1000)
}

// ── ② la portada de 3000×3000 ──────────────────────────────

export interface PortadaLista {
  blob: Blob
  /** De qué ancho partió la imagen original (para el aviso
   * honesto cuando se agrandó mucho desde una chica). */
  desdeAncho: number
}

/** Dibuja la portada en un lienzo de 3000×3000 (recorte centrado
 * tipo «cover», fondo oscuro si sobra) y la exporta como JPG de
 * calidad alta. Si el archivo supera el tope interno de 4 MB,
 * re-exporta más comprimida — los JPEG de 3000px casi nunca
 * llegan ahí, pero mejor estar listo. */
export async function portadaLanzamiento(fuente: string): Promise<PortadaLista> {
  const img = await cargarImagenSegura(fuente)
  if (!img || !img.width || !img.height) {
    throw new Error('no pude cargar la portada — probá generar otra o elegir una foto')
  }
  const lienzo = document.createElement('canvas')
  lienzo.width = LADO_PORTADA
  lienzo.height = LADO_PORTADA
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('este equipo no deja preparar la portada')
  ctx.fillStyle = '#101010'
  ctx.fillRect(0, 0, LADO_PORTADA, LADO_PORTADA)
  const escala = Math.max(LADO_PORTADA / img.width, LADO_PORTADA / img.height)
  const ancho = img.width * escala
  const alto = img.height * escala
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (LADO_PORTADA - ancho) / 2, (LADO_PORTADA - alto) / 2, ancho, alto)
  let ultimo: Blob | null = null
  for (const calidad of [0.94, 0.88, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((resolver) =>
      lienzo.toBlob((b) => resolver(b), 'image/jpeg', calidad),
    )
    if (blob) {
      ultimo = blob
      if (blob.size <= TOPE_PORTADA) return { blob, desdeAncho: img.width }
    }
  }
  if (ultimo) return { blob: ultimo, desdeAncho: img.width }
  throw new Error('no pude exportar la portada')
}

// ── ③ el .zip (sin compresión: el MP3 y el JPG ya vienen
//      comprimidos; así el empaquetado es instantáneo) ───────

export interface EntradaZip {
  nombre: string
  bytes: Uint8Array
}

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  return tabla
})()

/** CRC-32 (ISO-HDLC) — el checksum que exige cada entrada del zip. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Fecha/hora MS-DOS que pide el formato zip (2 bytes cada una). */
function dosFecha(d: Date): { tiempo: number; fecha: number } {
  const tiempo = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const fecha = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { tiempo, fecha }
}

function concatenar(pedazos: Uint8Array[]): Uint8Array {
  const total = pedazos.reduce((n, p) => n + p.length, 0)
  const salida = new Uint8Array(total)
  let pos = 0
  for (const p of pedazos) {
    salida.set(p, pos)
    pos += p.length
  }
  return salida
}

/** Arma un .zip VÁLIDO (formato PKWARE, método «store» = sin
 * compresión) en memoria. Nada de dependencias nuevas: cabeceras
 * locales + directorio central + EOCD escritos a mano — el mismo
 * formato que lee el explorador de archivos de Android. */
export function armarZip(entradas: EntradaZip[], momento = new Date()): Uint8Array {
  const codificador = new TextEncoder()
  const { tiempo, fecha } = dosFecha(momento)
  const locales: Uint8Array[] = []
  const centrales: Uint8Array[] = []
  let offset = 0
  for (const entrada of entradas) {
    const nombre = codificador.encode(entrada.nombre)
    const crc = crc32(entrada.bytes)
    const tam = entrada.bytes.length
    // cabecera local (30 fija + nombre)
    const local = new Uint8Array(30 + nombre.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // firma «PK\x03\x04»
    lv.setUint16(4, 20, true) // versión necesaria (2.0)
    lv.setUint16(6, 0x0800, true) // nombres en UTF-8
    lv.setUint16(8, 0, true) // método 0 = store
    lv.setUint16(10, tiempo, true)
    lv.setUint16(12, fecha, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, tam, true) // tamaño comprimido
    lv.setUint32(22, tam, true) // tamaño real
    lv.setUint16(26, nombre.length, true)
    lv.setUint16(28, 0, true) // sin extra
    local.set(nombre, 30)
    // entrada del directorio central (46 fija + nombre)
    const central = new Uint8Array(46 + nombre.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true) // firma «PK\x01\x02»
    cv.setUint16(4, 20, true) // hecho por
    cv.setUint16(6, 20, true) // versión necesaria
    cv.setUint16(8, 0x0800, true) // UTF-8
    cv.setUint16(10, 0, true) // store
    cv.setUint16(12, tiempo, true)
    cv.setUint16(14, fecha, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, tam, true)
    cv.setUint32(24, tam, true)
    cv.setUint16(28, nombre.length, true)
    cv.setUint16(30, 0, true) // extra
    cv.setUint16(32, 0, true) // comentario
    cv.setUint16(34, 0, true) // disco inicial
    cv.setUint16(36, 0, true) // atributos internos
    cv.setUint32(38, 0, true) // atributos externos
    cv.setUint32(42, offset, true) // dónde empieza su cabecera local
    central.set(nombre, 46)
    locales.push(local, entrada.bytes)
    centrales.push(central)
    offset += local.length + tam
  }
  const directorio = concatenar(centrales)
  // fin del directorio central (22 fija)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true) // firma «PK\x05\x06»
  ev.setUint16(4, 0, true) // disco actual
  ev.setUint16(6, 0, true) // disco del directorio
  ev.setUint16(8, entradas.length, true)
  ev.setUint16(10, entradas.length, true)
  ev.setUint32(12, directorio.length, true)
  ev.setUint32(16, offset, true) // dónde empieza el directorio
  ev.setUint16(20, 0, true) // sin comentario
  return concatenar([...locales, directorio, eocd])
}
