// ═══════════════════════════════════════════════════════════
// 🎹 LYRIA (Google) — el motor de música alternativo de
// MusicTrack: si te quedás sin créditos de Suno, cambiás de
// motor y seguís creando con tu API key de Google AI Studio
// (la misma cuenta Google de tu Firebase).
//
// API: Gemini "Interactions" — POST /v1beta/interactions
// · Letras propias: header "Lyrics:" dentro del prompt, con
//   secciones etiquetadas [Verse 1] / [Chorus] (docs oficiales).
// · Modelos: lyria-3.5 (canción completa) y
//   lyria-3-clip-preview (clip de 30 segundos).
// · La respuesta trae el MP3 en base64 inline (44.1 kHz stereo).
// · CORS: permite llamada directa desde navegador con
//   x-goog-api-key — mismo patrón BYO de toda la familia Track.
// ⚠️ Los modelos de música NO tienen capa gratis: requiere
//   billing activo en Google AI Studio ($0.08/canción, $0.04/clip).
// ═══════════════════════════════════════════════════════════

const URL_API = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const TIMEOUT_MS = 5 * 60 * 1000 // una canción completa puede tardar minutos

export interface MotorLyria {
  token: string
}

export interface ResultadoLyria {
  /** MP3 en base64 (sin el prefijo data:) */
  audioBase64: string
  mime: string
  /** Letra/estructura que el modelo devolvió (output_text) */
  texto?: string
}

interface Nodo {
  [clave: string]: unknown
}

/** Busca recursivamente el bloque de audio (base64) en la respuesta. */
function extraerAudio(nodo: unknown): { data: string; mime: string } | null {
  if (!nodo || typeof nodo !== 'object') return null
  if (Array.isArray(nodo)) {
    for (const item of nodo) {
      const hallado = extraerAudio(item)
      if (hallado) return hallado
    }
    return null
  }
  const obj = nodo as Nodo
  const mime =
    (typeof obj.mimeType === 'string' && obj.mimeType) ||
    (typeof obj.mime_type === 'string' && obj.mime_type) ||
    ''
  const data = typeof obj.data === 'string' ? obj.data : ''
  // bloque de audio inline: data base64 larga + mime de audio (o claves típicas)
  if (data.length > 1000 && (mime.startsWith('audio') || mime === 'audio/mp3' || mime === 'audio/mpeg')) {
    return { data, mime: mime || 'audio/mp3' }
  }
  // fallback: cualquier campo data base64 gigante (la respuesta de música
  // solo trae eso como blob) — claves conocidas primero
  for (const clave of ['output_audio', 'audio', 'inlineData', 'inline_data']) {
    const hallado = extraerAudio(obj[clave])
    if (hallado) return hallado
  }
  for (const valor of Object.values(obj)) {
    if (valor && typeof valor === 'object') {
      const hallado = extraerAudio(valor)
      if (hallado) return hallado
    }
  }
  return null
}

/** Busca el texto generado (letra/estructura) en la respuesta. */
function extraerTexto(nodo: unknown): string | undefined {
  if (!nodo || typeof nodo !== 'object') return undefined
  if (Array.isArray(nodo)) {
    const partes = nodo.map(extraerTexto).filter(Boolean) as string[]
    return partes.length ? partes.join('\n') : undefined
  }
  const obj = nodo as Nodo
  if (typeof obj.text === 'string' && obj.text.length > 0) return obj.text
  if (typeof obj.output_text === 'string' && obj.output_text.length > 0) return obj.output_text
  for (const clave of ['output', 'steps', 'output_text', 'outputAudio', 'output_audio']) {
    const hallado = extraerTexto(obj[clave])
    if (hallado) return hallado
  }
  return undefined
}

interface ErrorGoogle {
  code?: number
  message?: string
  status?: string
}

/** Google a veces envuelve la respuesta en un array [{…}] — lo desenvuelve. */
function desenvolver(data: unknown): unknown {
  return Array.isArray(data) && data.length === 1 ? data[0] : data
}

async function llamar(token: string, cuerpo: unknown): Promise<Nodo> {
  const controlador = new AbortController()
  const reloj = window.setTimeout(() => controlador.abort(), TIMEOUT_MS)
  let resp: Response
  try {
    resp = await fetch(URL_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': token,
      },
      body: JSON.stringify(cuerpo),
      signal: controlador.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Lyria: la generación tardó más de 5 minutos — probá con el modelo de clip de 30s')
    }
    throw new Error('Lyria: no se pudo conectar — revisá tu internet')
  } finally {
    window.clearTimeout(reloj)
  }
  let crudo: unknown = null
  try {
    crudo = await resp.json()
  } catch {
    /* respuesta sin JSON */
  }
  const data = desenvolver(crudo) as (Nodo & { error?: ErrorGoogle }) | null
  if (!resp.ok || data?.error) {
    throw new Error(`Lyria: ${data?.error?.message ?? `${resp.status} ${resp.statusText}`}`)
  }
  return data ?? {}
}

/**
 * Genera una canción con Lyria. La llamada espera (sincrónica) hasta que
 * el MP3 llega completo en la respuesta.
 */
export async function generarMusicaLyria(
  motor: MotorLyria,
  op: { prompt: string; modelo: string },
): Promise<ResultadoLyria> {
  const data = await llamar(motor.token, {
    model: op.modelo,
    input: op.prompt,
  })
  const audio = extraerAudio(data)
  if (!audio) {
    throw new Error('Lyria respondió pero sin audio — verificá que el billing esté activo (los modelos de música no tienen capa gratis)')
  }
  return { audioBase64: audio.data, mime: audio.mime, texto: extraerTexto(data) }
}

/** Prueba de conexión: lista de modelos con la API key (llamada gratis). */
export async function probarLyria(motor: MotorLyria): Promise<string> {
  let resp: Response
  try {
    resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      headers: { 'x-goog-api-key': motor.token },
    })
  } catch {
    throw new Error('Lyria: no se pudo conectar — revisá tu internet')
  }
  let crudo: { error?: ErrorGoogle } | null = null
  try {
    crudo = (await resp.json()) as { error?: ErrorGoogle }
  } catch {
    /* sin cuerpo */
  }
  const data = desenvolver(crudo) as { error?: ErrorGoogle } | null
  if (!resp.ok || data?.error) {
    throw new Error(`Lyria: ${data?.error?.message ?? `${resp.status} ${resp.statusText}`}`)
  }
  return '¡Lyria conectado! 🎹 (recordá: los modelos de música requieren billing activo)'
}

/** Arma el prompt en el formato que las docs de Lyria esperan. */
export function armarPromptLyria(op: { estilo: string; titulo: string; letra?: string; instrumental: boolean }): string {
  const lineas: string[] = []
  const estilo = op.estilo.trim() || 'pop latino'
  lineas.push(`A song titled "${op.titulo.trim() || 'Mi canción'}".`)
  lineas.push(`Style: ${estilo}.`)
  if (op.instrumental || !op.letra?.trim()) {
    lineas.push('Instrumental track, no vocals.')
  } else {
    lineas.push('Sing exactly the following lyrics, keeping the section tags:')
    lineas.push('Lyrics:')
    lineas.push(op.letra.trim())
  }
  return lineas.join('\n')
}
