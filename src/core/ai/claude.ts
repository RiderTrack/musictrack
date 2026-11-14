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

/** v0.15.2 — traduce los errores típicos de la API a español claro
 * y accionable. El bug de «Generar letra no funciona»: el error
 * viajaba en inglés crudo en un toast de 4 segundos — fácil de
 * perder y imposible de entender. Ahora se ve en criollo y queda
 * fijo en pantalla hasta el próximo intento. */
export function traducirErrorClaude(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed'))
    return 'No pude conectarme con Claude — revisá tu internet y probá de nuevo'
  if (m.includes('401') || m.includes('invalid x-api-key') || m.includes('authentication_error'))
    return 'Tu token de Claude no sirve (inválido o vencido) — generá uno nuevo en console.anthropic.com → API Keys y pegalo en Ajustes'
  if (m.includes('404') || m.includes('not_found_error'))
    return 'Ese modelo de Claude ya no existe — elegí Haiku, Sonnet u Opus 4.5 en Ajustes'
  if (m.includes('credit') || m.includes('balance') || m.includes('billing'))
    return 'Tu cuenta de Anthropic se quedó sin créditos — cargá saldo en console.anthropic.com → Settings → Billing'
  if (m.includes('429') || m.includes('rate_limit'))
    return 'Fuiste muy rápido o hay un límite de la API — esperá unos segundos y volvé a intentar'
  if (m.includes('529') || m.includes('overloaded') || m.includes('overload_error'))
    return 'Claude está saturado ahora mismo — esperá un momento y reintentá'
  if (m.includes('400') || m.includes('invalid_request'))
    return 'Pedido rechazado — revisá que el token esté completo (empieza con sk-ant-) y sin espacios'
  return mensaje
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
