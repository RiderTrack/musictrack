// ═══════════════════════════════════════════════════════════
// 🤖 CLAUDE (Anthropic) — patrón BYO-token de la familia Track:
// cada usuario pone SU propia clave en Ajustes; nada viaja a
// servidores de terceros. Soporta chat de texto y visión
// (imágenes), igual que PlantTrack y FitTrack.
//
// El header anthropic-dangerous-direct-browser-access es el
// que permite llamar la API directo desde el navegador/WebView
// (sin backend propio) — mismo mecanismo que ya usás.
// ═══════════════════════════════════════════════════════════

export interface MensajeIA {
  rol: 'usuario' | 'asistente'
  texto: string
}

interface OpcionesIA {
  token: string
  modelo: string
  mensajes: MensajeIA[]
  sistema?: string
  maxTokens?: number
}

const URL_API = 'https://api.anthropic.com/v1/messages'

function cabeceras(token: string): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-api-key': token,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

async function llamar(token: string, cuerpo: unknown): Promise<string> {
  const resp = await fetch(URL_API, {
    method: 'POST',
    headers: cabeceras(token),
    body: JSON.stringify(cuerpo),
  })
  if (!resp.ok) {
    let detalle = `${resp.status} ${resp.statusText}`
    try {
      const error = (await resp.json()) as { error?: { message?: string } }
      if (error.error?.message) detalle = error.error.message
    } catch {
      /* respuesta sin cuerpo json */
    }
    throw new Error(`Claude API: ${detalle}`)
  }
  const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> }
  return (data.content ?? [])
    .filter((bloque) => bloque.type === 'text')
    .map((bloque) => bloque.text ?? '')
    .join('\n')
    .trim()
}

/** Chat de texto. Pasá la conversación completa en `mensajes`. */
export async function preguntarIA(op: OpcionesIA): Promise<string> {
  return llamar(op.token, {
    model: op.modelo,
    max_tokens: op.maxTokens ?? 1024,
    ...(op.sistema ? { system: op.sistema } : {}),
    messages: op.mensajes.map((m) => ({
      role: m.rol === 'usuario' ? 'user' : 'assistant',
      content: m.texto,
    })),
  })
}

function inferirMime(dataUrl: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (dataUrl.includes('image/png')) return 'image/png'
  if (dataUrl.includes('image/webp')) return 'image/webp'
  return 'image/jpeg'
}

/** Visión: imagen (dataUrl base64) + prompt → texto. Patrón PlantTrack. */
export async function analizarImagenIA(op: {
  token: string
  modelo: string
  imagenDataUrl: string
  prompt: string
  maxTokens?: number
}): Promise<string> {
  const [encabezado, datos] = op.imagenDataUrl.split(',')
  if (!datos) throw new Error('Imagen inválida')
  return llamar(op.token, {
    model: op.modelo,
    max_tokens: op.maxTokens ?? 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: inferirMime(encabezado), data: datos } },
          { type: 'text', text: op.prompt },
        ],
      },
    ],
  })
}
