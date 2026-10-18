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
  /** v0.8.0 — id del audio en Suno (item.id de sunoData): lo pide
   * /generate/extend para continuar ESTA pista en particular. */
  audioId?: string
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
  const audioId = item.id ?? item.audioId
  return {
    taskId: String(item.taskId ?? item.id ?? ''),
    audioId: typeof audioId === 'string' && audioId ? audioId : undefined,
    titulo: (item.title as string) ?? tituloAlternativo,
    urlAudio: typeof urlAudio === 'string' && urlAudio ? urlAudio : undefined,
    urlPortada: typeof urlPortada === 'string' && urlPortada ? urlPortada : undefined,
    duracionSeg: typeof duracion === 'number' ? duracion : undefined,
    estado: 'generando',
  }
}

/** Modelos que aceptan el parámetro `duration` en /generate
 * (docs.sunoapi.org): solo V5_5 y la familia V6. En los viejos
 * (V4/V4_5/V5) mandarlo puede responder 400 — mejor ni enviarlo. */
export function modeloSunoSoportaDuracion(modelo: string): boolean {
  return ['V6', 'V6_MINI', 'V6_WILD', 'V5_5'].includes(modelo)
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

/** Extrae las pistas de la respuesta de un POST de generación
 * (generate y extend contestan igual: data con taskId, o un array
 * de items). */
function pistasDesdeRespuesta(r: RespuestaSuno, tituloAlternativo: string): PistaSuno[] {
  const d = r.data
  if (Array.isArray(d)) {
    const pistas = (d as Array<Record<string, unknown>>).map((i) => pistaDesdeItem(i, tituloAlternativo))
    if (pistas.length) return pistas
  } else if (d && typeof d === 'object') {
    const obj = d as Record<string, unknown>
    if (obj.taskId || obj.id) return [pistaDesdeItem(obj, tituloAlternativo)]
  }
  throw new Error('Suno API: la respuesta no trajo ninguna pista (taskId)')
}

/**
 * Lanza la generación de una canción (Custom Mode: letra propia
 * + estilo). Devuelve las pistas creadas (normalmente 2 versiones)
 * en estado 'generando', cada una con su taskId para consultar.
 *
 * v0.8.0 — `duracionSeg`: Suno ajusta el canto para que la letra
 * QUEPA entera en esa duración (docs: rango 10–360 s, solo V6/V5_5).
 * Sin ella, Suno decide solo la longitud… y en letras largas se
 * queda corto: la canción termina antes de cantar las últimas
 * estrofas (el bug que arreglamos acá).
 */
export async function generarMusica(
  motor: MotorSuno,
  op: {
    letra: string
    estilo: string
    titulo: string
    instrumental: boolean
    modelo: string
    duracionSeg?: number
  },
): Promise<PistaSuno[]> {
  // duration solo vale en customMode y en modelos que lo soportan;
  // en los otros ni se manda (la API podría rechazar el pedido).
  const duracion =
    op.duracionSeg && op.duracionSeg >= 10 && modeloSunoSoportaDuracion(op.modelo) ? op.duracionSeg : undefined
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
      ...(duracion ? { duration: duracion } : {}),
      callBackUrl: CALLBACK_URL,
    }),
  })
  return pistasDesdeRespuesta(r, op.titulo)
}

/**
 * v0.8.0 — EXTENDER una pista ya hecha: Suno continúa la canción
 * desde `continueAt` segundos, cantando la letra que falte en el
 * MISMO estilo musical (el modelo tiene que ser el mismo de la
 * original). Es el arreglo para las canciones que se cortaron antes
 * de terminar la letra: no hay que rehacerla, se completa.
 * docs.sunoapi.org → POST /api/v1/generate/extend.
 */
export async function extenderMusica(
  motor: MotorSuno,
  op: {
    audioId: string
    taskId?: string
    continueAt: number
    letra: string
    estilo: string
    titulo: string
    instrumental: boolean
    modelo: string
  },
): Promise<PistaSuno[]> {
  const r = await pedir(motor, '/api/v1/generate/extend', {
    method: 'POST',
    body: JSON.stringify({
      audioId: op.audioId,
      ...(op.taskId ? { taskId: op.taskId } : {}),
      continueAt: Math.round(op.continueAt),
      // igual que en generate: la API nueva prioriza lyrics; ambas van
      lyrics: op.instrumental ? '' : op.letra,
      prompt: op.instrumental ? '' : op.letra,
      style: op.estilo,
      title: op.titulo,
      instrumental: op.instrumental,
      // ⚠️ docs: el modelo debe ser el MISMO de la canción original
      model: op.modelo,
      callBackUrl: CALLBACK_URL,
    }),
  })
  return pistasDesdeRespuesta(r, op.titulo)
}

/** Resultado del análisis de la letra sincronizada. */
export interface LetraConTiempos {
  /** Cuántas palabras alcanzó a cantar la canción. */
  palabrasCantadas: number
  /** Segundo donde terminó el último canto (fin de la última palabra). */
  finUltimoCanto?: number
}

/**
 * v0.8.0 — letra sincronizada de una pista (docs: POST
 * /api/v1/generate/get-timestamped-lyrics con taskId + audioId).
 * Devuelve palabra por palabra CON SEGUNDOS: con eso sabemos
 * EXACTAMENTE hasta dónde llegó a cantar una canción cortada
 * (palabrasCantadas / finUltimoCanto) para armar la continuación
 * con lo que faltó. Si la pista no tiene datos (instrumental,
 * canción vieja, API sin datos) → null, sin lanzar error.
 */
export async function consultarLetraConTiempos(
  motor: MotorSuno,
  taskId: string,
  audioId: string,
): Promise<LetraConTiempos | null> {
  try {
    const r = await pedir(motor, '/api/v1/generate/get-timestamped-lyrics', {
      method: 'POST',
      body: JSON.stringify({ taskId, audioId }),
    })
    const d = r.data as Record<string, unknown> | null
    const palabras = Array.isArray(d?.alignedWords) ? (d?.alignedWords as Array<Record<string, unknown>>) : []
    if (!palabras.length) return null
    let cantadas = 0
    let fin = 0
    for (const p of palabras) {
      if (p.success === false) continue
      cantadas += 1
      const endS = typeof p.endS === 'number' ? p.endS : 0
      if (endS > fin) fin = endS
    }
    return { palabrasCantadas: cantadas, finUltimoCanto: fin > 0 ? fin : undefined }
  } catch {
    // es un PLUS opcional: si falla, el usuario edita la letra a mano
    return null
  }
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

  // 🩹 v0.6.5 — EL BUG DE LA COLA ETERNA: sunoapi.org migró el
  // formato de record-info (docs actuales) y las pistas ahora viven
  // en data.response.sunoData. Nosotros leíamos solo listData/data
  // (formato de las docs viejas), así que una tarea TERMINADA se
  // veía como lista vacía → «generando» para siempre, aunque la
  // canción ya estuviera hecha y los créditos consumidos.
  // Formato actual primero; los viejos quedan como respaldo para
  // URLs base que apunten a despliegues anteriores de la API.
  const respuesta = (d.response ?? {}) as Record<string, unknown>
  const items = Array.isArray(respuesta.sunoData)
    ? (respuesta.sunoData as Array<Record<string, unknown>>)
    : Array.isArray(d.listData)
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
