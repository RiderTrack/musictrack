// ═══════════════════════════════════════════════════════════
// 📄 PDF DE LA LETRA (v0.12.0) — «descargar la letra en un
// formato bonito»: el PDF se arma ACÁ, a mano, con las 14 fuentes
// clásicas del formato (familia Times: elegante, tipografía de
// libro de canciones). CERO dependencias nuevas — nada que
// instalar, nada que engorde el bundle.
//
// Diseño de la página (A4):
//   ┌──────────────────────────────────────┐
//   │           TÍTULO (negrita)           │
//   │     género · mood · voz · idioma     │
//   │     ───────────────────────          │
//   │                                      │
//   │  [SECCIÓN]   ← negrita + cursiva     │
//   │  la letra, en Times tamaño libro     │
//   │                                      │
//   │  (separación de aire entre estrofas) │
//   │                                      │
//   │        MusicTrack · pág. 1/2         │
//   └──────────────────────────────────────┘
//
// Ensamblado (numeración FIJA, por adelantado):
//   1 Catálogo · 2 Pages · 3-6 fuentes · 7+ páginas y contenidos
//   en pares consecutivos: página 7→contenido 8, página 9→10…
// ═══════════════════════════════════════════════════════════

import { guardarArchivoEnDescargas, type ResultadoDescarga } from '@/core/natives/descargas'

export interface OpPdfLetra {
  titulo: string
  /** Chips de contexto: género, mood, voz, idioma, artistas… */
  meta: string[]
  /** La letra completa (los [tags] de sección van en cursiva negrita). */
  texto: string
  /** Texto extra para el pie de página (p. ej. «Letras · 19/10/2026»). */
  origen?: string
}

// ── Geometría A4 ──────────────────────────────────────────────
const ANCHO = 595.28
const ALTO = 841.89
const MARGEN = 68
const TOPE_TITULO = 800
const CUERPO_ARRANCA = 744
const PIE = 40

/** Una línea completa de la letra ES un tag de sección ([Coro]…). */
const ES_TAG_SECCION = /^\s*\[[^\]]+\]\s*$/

/** Emojis y símbolos que las fuentes clásicas no dibujan → fuera. */
function sinEmojis(t: string): string {
  return t
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Comillas «inteligentes» y demás glifos que NO viven en latin-1
 * → su equivalente que Times sí dibuja. */
function aLatin1(t: string): string {
  return t
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2026/g, '...')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ')
}

/** Texto → literal (…) de PDF: ASCII puro, con octales donde hace
 * falta (á → \341). Las fuentes Times con WinAnsiEncoding dibujan
 * esos bytes como la letra acentuada correcta. */
function escapar(t: string): string {
  let salida = ''
  for (const caracter of aLatin1(t)) {
    const codigo = caracter.codePointAt(0) ?? 63
    if (codigo > 255) {
      salida += '?'
    } else if (codigo === 40 || codigo === 41 || codigo === 92) {
      salida += '\\' + caracter
    } else if (codigo < 32 || codigo > 126) {
      salida += '\\' + codigo.toString(8).padStart(3, '0')
    } else {
      salida += caracter
    }
  }
  return salida
}

/** Parte en líneas que quepan en el ancho útil (≈82 caracteres
 * para Times 11 pt — conservador, nunca se sale del margen). */
function envolver(linea: string, maximo = 82): string[] {
  const limpia = linea.trimEnd()
  if (limpia.length <= maximo) return [limpia]
  const palabras = limpia.split(/\s+/)
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    if (!actual.length) actual = palabra
    else if ((actual + ' ' + palabra).length <= maximo) actual += ' ' + palabra
    else {
      lineas.push(actual)
      actual = palabra
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

/** Acumulador de bytes del PDF con contabilidad de offsets para
 * la tabla xref: un PDF es un formato de POSICIONES exactas. */
class Pdf {
  private bytes: number[] = [37, 80, 68, 70, 45, 49, 46, 52, 10] // %PDF-1.4\n
  private offsetsObjetos: number[] = []

  texto(s: string): void {
    for (let i = 0; i < s.length; i++) {
      const codigo = s.charCodeAt(i)
      this.bytes.push(codigo > 255 ? 63 : codigo)
    }
  }

  /** Escribe un objeto y devuelve su número (1-based). */
  objeto(contenido: string): number {
    const numero = this.offsetsObjetos.length + 1
    this.offsetsObjetos.push(this.bytes.length)
    this.texto(`${numero} 0 obj\n${contenido}\nendobj\n`)
    return numero
  }

  /** Número que tendría el PRÓXIMO objeto a escribir (1-based). */
  proximoNumero(): number {
    return this.offsetsObjetos.length + 1
  }

  obtener(): Blob {
    const cantidad = this.offsetsObjetos.length
    const inicioXref = this.bytes.length
    this.texto(`xref\n0 ${cantidad + 1}\n0000000000 65535 f \n`)
    for (const offset of this.offsetsObjetos) this.texto(`${String(offset).padStart(10, '0')} 00000 n \n`)
    this.texto(`trailer\n<</Size ${cantidad + 1}/Root 1 0 R>>\nstartxref\n${inicioXref}\n%%EOF`)
    return new Blob([Uint8Array.from(this.bytes)], { type: 'application/pdf' })
  }
}

const FUENTES = [
  { id: 'F1', base: 'Times-Roman' },
  { id: 'F2', base: 'Times-Bold' },
  { id: 'F3', base: 'Times-Italic' },
  { id: 'F4', base: 'Times-BoldItalic' },
] as const

type Pagina = { ops: string[] }

function ponerTexto(p: Pagina, x: number, y: number, fuente: string, tamano: number, gris: number, contenido: string): void {
  if (!contenido) return
  p.ops.push(
    `BT /${fuente} ${tamano} Tf ${gris} g ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapar(contenido)}) Tj ET`,
  )
}

/** Texto centrado (ancho estimado con la métrica media de Times). */
function centrar(p: Pagina, y: number, fuente: string, tamano: number, gris: number, contenido: string): void {
  if (!contenido) return
  const anchoEstimado = contenido.length * tamano * 0.47
  ponerTexto(p, Math.max(MARGEN, (ANCHO - anchoEstimado) / 2), y, fuente, tamano, gris, contenido)
}

/** Arma el PDF completo de una letra y lo devuelve como Blob. */
export function generarPdfLetra(op: OpPdfLetra): Blob {
  const pdf = new Pdf()
  const titulo = sinEmojis(op.titulo) || 'Mi canción'
  const meta = op.meta.map(sinEmojis).filter(Boolean)

  // ── pre-proceso: la letra → líneas con estilo y aire ──
  interface Linea {
    texto: string
    tipo: 'tag' | 'normal'
    aire: number
  }
  const lineas: Linea[] = []
  let airePendiente = 0
  for (const cruda of aLatin1(op.texto).split('\n')) {
    if (!cruda.trim()) {
      airePendiente += 10
      continue
    }
    const tipo: Linea['tipo'] = ES_TAG_SECCION.test(cruda) ? 'tag' : 'normal'
    for (const parte of envolver(cruda)) {
      lineas.push({ texto: tipo === 'tag' ? sinEmojis(parte) : parte, tipo, aire: airePendiente })
      airePendiente = 0
    }
  }

  // ── maquetación ──
  const paginas: Pagina[] = []
  let pagina: Pagina = { ops: [] }
  let y = TOPE_TITULO
  centrar(pagina, y, 'F2', 21, 0, titulo)
  y -= 22
  if (meta.length) {
    centrar(pagina, y, 'F3', 9.5, 0.45, meta.join('  ·  '))
    y -= 6
  }
  pagina.ops.push(
    `0.72 w 0.78 G ${MARGEN} ${(y - 8).toFixed(2)} m ${(ANCHO - MARGEN).toFixed(2)} ${(y - 8).toFixed(2)} l S 0 g 0 G`,
  )
  y = CUERPO_ARRANCA

  const INTERLINEA = 15.5
  for (const linea of lineas) {
    y -= linea.aire
    if (y < PIE + 30) {
      paginas.push(pagina)
      pagina = { ops: [] }
      y = ALTO - MARGEN
    }
    if (linea.tipo === 'tag') {
      y -= 5
      ponerTexto(pagina, MARGEN, y, 'F4', 10.5, 0.18, linea.texto.toUpperCase())
      y -= INTERLINEA + 1
    } else {
      ponerTexto(pagina, MARGEN, y, 'F1', 11, 0.05, linea.texto)
      y -= INTERLINEA
    }
  }
  paginas.push(pagina)
  const pie = sinEmojis(op.origen ?? '')
  paginas.forEach((p, i) => {
    centrar(p, PIE, 'F3', 8, 0.5, `MusicTrack · ${pie ? pie + ' · ' : ''}pág. ${i + 1}/${paginas.length}`)
  })

  // ── ensamblado (1 Catálogo · 2 Pages · 3-6 fuentes · 7+ pares) ──
  const totalPaginas = paginas.length
  const kids = Array.from({ length: totalPaginas }, (_, i) => `${7 + i * 2} 0 R`).join(' ')
  pdf.objeto('<</Type/Catalog/Pages 2 0 R>>')
  pdf.objeto(`<</Type/Pages/Kids[${kids}]/Count ${totalPaginas}>>`)
  const idsFuentes = FUENTES.map((f) =>
    pdf.objeto(`<</Type/Font/Subtype/Type1/BaseFont/${f.base}/Encoding/WinAnsiEncoding>>`),
  )
  const recursos = `<</Font<</F1 ${idsFuentes[0]} 0 R/F2 ${idsFuentes[1]} 0 R/F3 ${idsFuentes[2]} 0 R/F4 ${idsFuentes[3]} 0 R>>>>`
  paginas.forEach((p) => {
    const contenido = p.ops.join('\n')
    // el número de ESTE objeto es el próximo a escribir; el content
    // stream es el objeto inmediato siguiente:
    const idEste = pdf.proximoNumero()
    pdf.objeto(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${ANCHO} ${ALTO}]/Resources${recursos}/Contents ${idEste + 1} 0 R>>`,
    )
    pdf.objeto(`<</Length ${contenido.length}>>\nstream\n${contenido}\nendstream`)
  })

  return pdf.obtener()
}

/** Genera el PDF y lo guarda en la carpeta de descargas de siempre
 * (la de los MP3). Devuelve el resultado amigable para el toast. */
export async function descargarLetraPdf(op: OpPdfLetra, carpeta: string): Promise<ResultadoDescarga> {
  const blob = generarPdfLetra(op)
  const nombre = `${op.titulo.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Mi canción'} - MusicTrack.pdf`
  return guardarArchivoEnDescargas(blob, nombre, carpeta)
}
