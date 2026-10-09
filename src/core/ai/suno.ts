// ═══════════════════════════════════════════════════════════
// 🎵 SUNO — el segundo motor de IA de MusicTrack (FASE 3:
// "motor doble"). Claude escribe la letra, Suno la convierte
// en canción con voz e instrumentos.
//
// Patrón BYO-token de la familia Track: cada usuario pone SU
// clave en Ajustes. Habla con una API compatible sunoapi.org
// (la URL base es configurable, por si mañana Suno publica su
// API oficial u otro proveedor).
//
// Detalle importante verificado a mano: esta API contesta
// HTTP 200 incluso cuando falla la autenticación, con el
// error adentro del cuerpo ({code: 401, msg: …}). Por eso el
// chequeo de errores mira el código del JSON, no el de HTTP.
// CORS: permite acceso directo desde navegador/WebView.
// ═══════════════════════════════════════════════════════════

export interface MotorSuno {
  url: string
  token: string
}

export type EstadoPista = 'generando' | 'lista' | 'error'

/** Una pista generada (Suno devuelve 2 versiones por pedido). */
export interface PistaSuno {
  taskId: string
  titulo?: string
  urlAudio?: string
  urlPortada?: string
  duracionSeg?: number
  estado: EstadoPista
  error?: string
}

interface RespuestaSuno {
  code?: number
  msg?: string
  data?: unknown
}

function base(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

async function pedir(motor: MotorSuno, ruta: string, init?: RequestInit): Promise<RespuestaSuno> {
  let resp: Response
  try {
    resp = await fetch(`${base(motor.url)}${ruta}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${motor.token}`,
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new Error('Suno API: no se pudo conectar — revisá la URL base y tu internet')
  }
  let cuerpo: RespuestaSuno | null = null
  try {
    cuerpo = (await resp.json()) as RespuestaSuno
  } catch {
    /* respuesta sin JSON */
  }
  // ⚠️ El servidor devuelve HTTP 200 con el error en el cuerpo.
  const codigo = cuerpo?.code ?? resp.status
  if (codigo !== 200) {
    throw new Error(`Suno API: ${cuerpo?.msg ?? `${resp.status} ${resp.statusText}`}`)
  }
  return cuerpo ?? {}
}

/** Mapeo tolerante: las respuestas mezclan snake_case y camelCase según la versión de la API. */
function pistaDesdeItem(item: Record<string, unknown>, tituloAlternativo?: string): PistaSuno {
  const urlAudio = item.audio_url ?? item.musicUrl ?? item.audioUrl ?? item.sunoUrl
  const urlPortada = item.image_url ?? item.imageUrl ?? item.coverUrl
  const duracion = item.duration ?? item.playDuration ?? item.play_duration
  return {
    taskId: String(item.taskId ?? item.id ?? ''),
    titulo: (item.title as string) ?? tituloAlternativo,
    urlAudio: typeof urlAudio === 'string' && urlAudio ? urlAudio : undefined,
    urlPortada: typeof urlPortada === 'string' && urlPortada ? urlPortada : undefined,
    duracionSeg: typeof duracion === 'number' ? duracion : undefined,
    estado: 'generando',
  }
}

/**
 * Prueba de conexión: consulta los créditos restantes de la cuenta.
 * Sirve para el botón "Probar conexión" de Ajustes.
 */
export async function consultarCreditos(motor: MotorSuno): Promise<string> {
  const r = await pedir(motor, '/api/v1/generate/credit')
  const d = r.data
  // Formato flexible: {credits: n} | [{credits: n, …}] | {creditsLeft: n, …}
  let creditos: number | undefined
  if (typeof d === 'number') creditos = d
  else if (d && typeof d === 'object') {
    const obj = d as Record<string, unknown>
    const lista = Array.isArray(obj.data) ? (obj.data as Array<Record<string, unknown>>) : []
    const fuente = lista[0] ?? obj
    const valor = fuente.credits ?? fuente.creditsLeft ?? fuente.credit ?? fuente.remainCredits
    if (typeof valor === 'number') creditos = valor
    else if (Array.isArray(d)) {
      const primero = (d as Array<Record<string, unknown>>)[0]
      if (primero && typeof primero.credits === 'number') creditos = primero.credits
    }
  }
  return creditos !== undefined ? `Conectado — te quedan ${creditos} créditos` : 'Conectado ✔ (la API no informó créditos)'
}

/**
 * Lanza la generación de una canción (Custom Mode: letra propia
 * + estilo). Devuelve las pistas creadas (normalmente 2 versiones)
 * en estado 'generando', cada una con su taskId para consultar.
 */
export async function generarMusica(
  motor: MotorSuno,
  op: { letra: string; estilo: string; titulo: string; instrumental: boolean; modelo: string },
): Promise<PistaSuno[]> {
  const r = await pedir(motor, '/api/v1/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: op.instrumental ? '' : op.letra,
      style: op.estilo,
      title: op.titulo,
      customMode: true,
      instrumental: op.instrumental,
      model: op.modelo,
    }),
  })
  const d = r.data
  if (Array.isArray(d)) {
    const pistas = (d as Array<Record<string, unknown>>).map((i) => pistaDesdeItem(i, op.titulo))
    if (pistas.length) return pistas
  } else if (d && typeof d === 'object') {
    const obj = d as Record<string, unknown>
    if (obj.taskId || obj.id) return [pistaDesdeItem(obj, op.titulo)]
  }
  throw new Error('Suno API: la respuesta no trajo ninguna pista (taskId)')
}

/**
 * Consulta el estado de una pista por su taskId. Cuando termina,
 * llega con las URLs del audio y la portada.
 */
export async function consultarPista(motor: MotorSuno, taskId: string, tituloAlternativo?: string): Promise<PistaSuno> {
  const r = await pedir(motor, `/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`)
  const d = (r.data ?? {}) as Record<string, unknown>
  const estado = String(d.status ?? 'PENDING').toUpperCase()
  const items = Array.isArray(d.listData)
    ? (d.listData as Array<Record<string, unknown>>)
    : Array.isArray(d.data)
      ? (d.data as Array<Record<string, unknown>>)
      : []
  const propia = items.find((i) => String(i.taskId ?? i.id ?? '') === taskId) ?? items[0] ?? d
  const pista = pistaDesdeItem({ ...propia, taskId }, tituloAlternativo ?? (propia.title as string))

  if (estado.includes('ERROR') || estado.includes('FAILED')) {
    pista.estado = 'error'
    pista.error = (d.fail_reason as string) ?? (d.msg as string) ?? estado
  } else if (pista.urlAudio) {
    pista.estado = 'lista'
  } else {
    pista.estado = 'generando'
  }
  return pista
}
