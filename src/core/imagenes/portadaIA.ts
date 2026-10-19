import { recortarYReducir } from '@/core/imagenes/imagen'

// ═══════════════════════════════════════════════════════════
// 🎨 PORTADAS CON IA (v0.13.0) — «IA de portadas» de la lluvia de
// ideas. Genera la carátula de una canción a partir de su título
// y su estilo, SIN API key y SIN costo: pollinations.ai (gratis,
// CORS abierto). Lo que devuelve ya viene cuadrado y listo para
// guardarlo como portadaPersonal de la canción.
//
// Detalles del proveedor (verificado en vivo):
//   • GET https://image.pollinations.ai/prompt/<prompt>?width=512&height=512&nologo=true&seed=<n>
//     → image/jpeg (tarda ~8-10 s por imagen)
//   • tier anónimo con RATE LIMIT: si pedís dos seguidas
//     responde 402/429 con `Retry-After: 30` → se reintenta
//     una vez esperando ese tiempo (para una portada puntual
//     sobra y no cuesta nada).
// ═══════════════════════════════════════════════════════════

const URL_BASE_IA = 'https://image.pollinations.ai/prompt/'

/** El prompt de la carátula: describe la MÚSICA, no la letra —
 * el modelo de imagen pinta ambientes, no historias. El título
 * viaja como inspiración de mood; se pide SIN texto porque las
 * letras pintadas salen deformes. */
export function promptDePortada(titulo: string, estilo?: string): string {
  const base = estilo?.trim() || 'música'
  return [
    'album cover art',
    base,
    `mood inspired by the song title "${titulo.trim() || 'sin título'}"`,
    'striking composition, vibrant colors, detailed digital illustration',
    'no text, no letters, no words, no typography',
  ].join(', ')
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

/** Pide la imagen con reintentos amables (402/429 = rate limit del
 * tier gratis: espera lo que diga Retry-After y prueba de nuevo). */
async function pedirImagen(url: string, intentos: number): Promise<Blob> {
  const resp = await fetch(url)
  if (resp.ok) {
    const blob = await resp.blob()
    if (blob.size > 1000 && blob.type.startsWith('image/')) return blob
    throw new Error('la IA devolvió una imagen vacía')
  }
  const reintentar = resp.status === 402 || resp.status === 429 || resp.status === 503
  if (reintentar && intentos > 0) {
    const espera = Number(resp.headers.get('retry-after')) * 1000
    await esperar(Number.isFinite(espera) && espera > 0 && espera <= 40000 ? espera : 31000)
    return pedirImagen(url, intentos - 1)
  }
  throw new Error(`la IA de portadas respondió ${resp.status}`)
}

/** Genera la carátula de una canción → JPEG dataUrl de 512 px
 * (listo para guardar como portadaPersonal). `semilla` distinta =
 * carátula distinta para el mismo pedido (botón «otra»). */
export async function generarPortadaIA(
  info: { titulo: string; estilo?: string },
  semilla?: number,
): Promise<string> {
  const semillaFinal = semilla ?? Math.floor(Math.random() * 1_000_000)
  const url =
    URL_BASE_IA +
    encodeURIComponent(promptDePortada(info.titulo, info.estilo)) +
    `?width=512&height=512&nologo=true&seed=${semillaFinal}`
  const blob = await pedirImagen(url, 1)
  const dataUrl = await new Promise<string>((resolver, rechazar) => {
    const fr = new FileReader()
    fr.onload = () => resolver(String(fr.result))
    fr.onerror = () => rechazar(new Error('no pude leer la imagen generada'))
    fr.readAsDataURL(blob)
  })
  const cuadrada = await recortarYReducir(dataUrl, 512, 0.85)
  if (!cuadrada) throw new Error('no pude procesar la imagen generada')
  return cuadrada
}
