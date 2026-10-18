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
  /** Estado crudo de la API (PENDING, TEXT_SUCCESS, FIRST_SUCCESS…). */
  estadoCrudo?: string
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

// sunoapi.org exige callBackUrl desde octubre de 2026 (antes era
// opcional): es a donde POSTea el resultado cuando la canción
// está lista. MusicTrack usa polling (/record-info), así que el
// callback no se necesita para nada — se manda la URL pública de
// la web de la app solo para satisfacer la validación de la API.
const CALLBACK_URL = 'https://ridertrack.github.io/musictrack/'

/** Traduce los errores más comunes de sunoapi.org (llegan en
 * inglés) para que el toast se entienda a la primera.
 * Los desconocidos pasan sin tocar. */
function traducirErrorSuno(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('unauthorized') || m.includes('authentication failed'))
    return 'clave de Suno inválida o expirada — pegála de nuevo en Ajustes'
  if (m.includes('callbackurl'))
    return 'la API pide la URL de callback (ya corregida — actualizá tu APK desde Releases)'
  if (m.includes('insufficient') || m.includes('credit'))
    return 'no te alcanzan los créditos en sunoapi.org — cargá más o cambiá al motor Lyria'
  if (m.includes('content') || m.includes('sensitive') || m.includes('policy'))
    return 'Suno rechazó el contenido — suavizá la letra o el estilo y probá de nuevo'
  if (m.includes('rate') || m.includes('too many'))
    return 'demasiados pedidos seguidos — esperá unos segundos y reintentá'
  return msg
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
    throw new Error(`Suno API: ${traducirErrorSuno(cuerpo?.msg ?? `${resp.status} ${resp.statusText}`)}`)
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
 * Consulta los créditos restantes de la cuenta y los devuelve como
 * número (null si la API no los informa). No consume créditos.
 */
export async function creditosRestantes(motor: MotorSuno): Promise<number | null> {
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
  return creditos ?? null
}

/**
 * Prueba de conexión: consulta los créditos restantes de la cuenta.
 * Sirve para el botón "Probar conexión" de Ajustes.
 */
export async function consultarCreditos(motor: MotorSuno): Promise<string> {
  const creditos = await creditosRestantes(motor)
  return creditos !== null ? `Conectado — te quedan ${creditos} créditos` : 'Conectado ✔ (la API no informó créditos)'
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
      // La API nueva prioriza `lyrics` sobre `prompt` cuando existe
      // (docs.sunoapi.org, custom mode) — se mandan ambas por si la
      // URL base del usuario apunta a una versión vieja de la API.
      lyrics: op.instrumental ? '' : op.letra,
      style: op.estilo,
      title: op.titulo,
      customMode: true,
      instrumental: op.instrumental,
      model: op.modelo,
      callBackUrl: CALLBACK_URL,
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
 * Consulta el estado de una tarea y devuelve TODAS sus versiones
 * (Suno genera 2 canciones por pedido): cada una con su propio
 * audio, portada y duración. Mientras ninguna tiene audio, devuelve
 * una sola pista 'generando' con el estado crudo de la tarea.
 */
export async function consultarPistas(
  motor: MotorSuno,
  taskId: string,
  tituloAlternativo?: string,
): Promise<PistaSuno[]> {
  const r = await pedir(motor, `/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`)
  const d = (r.data ?? {}) as Record<string, unknown>
  const estado = String(d.status ?? 'PENDING').toUpperCase()

  if (estado.includes('ERROR') || estado.includes('FAILED')) {
    return [
      {
        taskId,
        titulo: tituloAlternativo,
        estado: 'error',
        estadoCrudo: estado,
        error:
          (d.fail_reason as string) ??
          (d.errorMessage as string) ??
          (d.msg as string) ??
          estado,
      },
    ]
  }

  const items = Array.isArray(d.listData)
    ? (d.listData as Array<Record<string, unknown>>)
    : Array.isArray(d.data)
      ? (d.data as Array<Record<string, unknown>>)
      : []

  if (!items.length) {
    return [{ taskId, titulo: tituloAlternativo, estado: 'generando', estadoCrudo: estado }]
  }

  return items.map((item) => {
    const p = pistaDesdeItem({ ...item, taskId }, tituloAlternativo)
    p.estadoCrudo = estado
    // Si el audio ya existe, está lista aunque su callback haya fallado
    // (CALLBACK_EXCEPTION no es culpa nuestra: nosotros usamos polling,
    // el callBackUrl es solo para satisfacer la validación de la API).
    p.estado = p.urlAudio ? 'lista' : 'generando'
    return p
  })
}
