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

// 🔧 v0.19.1 — FASE 17 (bug que encontró Rudy): el File Upload API
// NO vive en api.sunoapi.org — ahí /api/file-base64-upload responde
// 404 y la creación de la voz moría en el PRIMER paso (subir la
// grabación). Según la doc (docs.sunoapi.org → File Upload API), la
// subida de archivos tiene host PROPIO: comparte la misma clave
// Bearer, responde el mismo formato {code, msg, data} y acepta CORS
// desde cualquier origen (verificado a mano: POST sin clave → code
// 401; OPTIONS → access-control-allow-origin: *). Los archivos
// subidos viven 3 días, de sobra para el flujo de voz.
const HOST_ARCHIVOS_SUNO = 'https://sunoapiorg.redpandaai.co'

/** Traduce los errores más comunes de sunoapi.org (llegan en
 * inglés) para que el toast se entienda a la primera.
 * Los desconocidos pasan sin tocar. */
function traducirErrorSuno(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('unauthorized') || m.includes('authentication failed'))
    return 'clave de Suno inválida o expirada — pegála de nuevo en Ajustes'
  // 🔧 v0.19.1 — el 404 que le salió a Rudy: dirección que la API
  // ya no conoce (host o ruta movidos) → mensaje accionable.
  if (m.includes('404') || m.includes('not found'))
    return 'la API no encontró esa dirección (404) — revisá la URL base en Ajustes o actualizá la app a la última versión'
  if (m.includes('callbackurl'))
    return 'la API pide la URL de callback (ya corregida — actualizá tu APK desde Releases)'
  if (m.includes('insufficient') || m.includes('credit'))
    return 'no te alcanzan los créditos en sunoapi.org — cargá más o cambiá al motor Lyria'
  if (m.includes('content') || m.includes('sensitive') || m.includes('policy'))
    return 'Suno rechazó el contenido — suavizá la letra o el estilo y probá de nuevo'
  if (m.includes('rate') || m.includes('too many'))
    return 'demasiados pedidos seguidos — esperá unos segundos y reintentá'
  if (m.includes('5000') || m.includes('length of lyrics') || m.includes('lyrics cannot exceed'))
    return 'la letra supera el límite de 5.000 caracteres de Suno — acortala o completá la canción con ⏩ Extender'
  return msg
}

async function pedir(
  motor: MotorSuno,
  ruta: string,
  init?: RequestInit,
  /** 🔧 v0.19.1 — origen alternativo (p. ej. el host de archivos
   * de sunoapi.org); por defecto, la URL configurada del motor. */
  origen?: string,
): Promise<RespuestaSuno> {
  let resp: Response
  try {
    resp = await fetch(`${base(origen ?? motor.url)}${ruta}`, {
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

/** v0.8.1 — tope de caracteres de la letra que acepta Suno
 * ("The length of lyrics cannot exceed 5000 characters"). Es un
 * limite DURO de la API: pasarse = pedido rechazado. */
export const LIMITE_LETRA_SUNO = 5000

/** v0.9.0 — le saca el ESPACIO DE MÁS antes de medir: espacios
 * dobles, aire al costado de cada línea y 3+ saltos de línea seguidos.
 * El usuario descubrió que letras con mucho espacio al aire rebotaban
 * contra el tope sin necesidad — con la limpieza, varias entran ENTERAS
 * (y si igual no alcanzan, se recortan por estrofa como en v0.8.1). */
function normalizarEspaciosLetra(letra: string): string {
  return letra
    .split('\n')
    .map((l) => l.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** v0.8.1 — recorta una letra al límite de Suno SIN partir una
 * estrofa a la mitad: si se pasa de 5.000, corta en el último
 * fin de estrofa (línea vacía) que quepa entero; si la letra no
 * tiene estrofas, en el último salto de línea; si tampoco, corte
 * duro. Lo que queda afuera es exactamente lo que después se
 * completa con ⏩ Extender.
 * v0.9.0 — devuelve `normalizada` cuando la limpieza de espacios
 * alcanzó para que la letra ENTRE entera (para avisarle al usuario
 * que no se cortó nada, solo se le acomodó el aire). */
export function recortarLetraParaSuno(letra: string): { letra: string; recortada: boolean; normalizada: boolean } {
  const entrada = letra.trim()
  const limpia = normalizarEspaciosLetra(entrada)
  const cambioEspacios = limpia !== entrada
  if (limpia.length <= LIMITE_LETRA_SUNO) return { letra: limpia, recortada: false, normalizada: cambioEspacios }
  const ventana = limpia.slice(0, LIMITE_LETRA_SUNO)
  const porEstrofa = ventana.lastIndexOf('\n\n')
  const porLinea = ventana.lastIndexOf('\n')
  // estrofa completa primero; sin estrofas, línea; el guard de la
  // mitad evita cortar absurdamente corto si el único corte vive
  // muy al principio (letra rara) — en ese caso, corte duro.
  const corte = porEstrofa >= 0 ? porEstrofa : porLinea
  const final = corte > LIMITE_LETRA_SUNO * 0.5 ? ventana.slice(0, corte) : ventana
  return { letra: final.trim(), recortada: true, normalizada: cambioEspacios }
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

/** v0.11.2 — tope de caracteres del CAMPO ESTILO que acepta
 * Suno (docs.sunoapi.org: style, máximo 200). Pasarse puede
 * rechazar el pedido entero (créditos perdidos). */
export const LIMITE_ESTILO_SUNO = 200

/** v0.15.2 — tope de estilo SEGÚN EL MODELO (docs.sunoapi.org):
 * V4 y más viejos aceptan 200; V4.5+, V5, V5_5 y toda la familia
 * V6 aceptan 1000. El 200 fijo quedó de la época de V4 y recortaba
 * los prompts largos (el vals criollo «bien peruano» de Rudy)
 * sin avisar. */
export function limiteEstiloSuno(modelo: string): number {
  return /^(V6|V5|V4_5)/.test(modelo) ? 1000 : LIMITE_ESTILO_SUNO
}

/** v0.14.0 — DICCIONARIO DE FRONTERA COMPLETO. La lección de
 * v0.11.2 (las voces se mezclaban porque Suno se entrenó con tags
 * en INGLÉS) aplica a TODO el estilo, no solo a las voces: «tumba-
 * doras» o «ochentero» viajan a medias y la esencia se pierde.
 * Este pase traduce géneros, instrumentos, energías, épocas y
 * producción al inglés canónico JUSTO ANTES de enviar a la API —
 * lo que se ve, se guarda y se comparte queda en español.
 * Ordenadas de MÁS específica a menos: «coro épico» antes que
 * «coro», «cumbia peruana» antes que «cumbia», «bajo profundo»
 * antes que «bajo». Lo que no está en el diccionario pasa tal
 * cual (cumbia, salsa, reggaeton, perreo… son palabras que Suno
 * ya conoce). NUNCA se toca «solo» (vive en el refuerzo
 * «solo female singer»). */
const TRADUCCIONES_ESTILO: ReadonlyArray<readonly [RegExp, string]> = [
  // ── épocas (la musicalidad de cada década) ──
  [/m[úu]sica de los (70|80|90)s?/gi, '$1s'],
  [/\ba[ñn]os (70|80|90)\b/gi, '$1s'],
  [/\bde los (70|80|90)s?\b/gi, '$1s'],
  [/\bochenter[oa]s?\b/gi, '80s'],
  [/\bnoventer[oa]s?\b/gi, '90s'],
  [/\bsetenter[oa]s?\b/gi, '70s'],
  // ── géneros latinos y del mundo ──
  [/cumbia peruana/gi, 'peruvian cumbia'],
  [/cumbia colombiana/gi, 'colombian cumbia'],
  [/cumbia amaz[óo]nica/gi, 'amazonian cumbia'],
  [/tecno-?cumbia/gi, 'tecno cumbia'],
  [/\bchicha\b/gi, 'peruvian chicha'],
  // 🇵🇪 v0.15.1 — música criolla «rompevenas» (pedido de Rudy):
  // vals, polca, marinera, festejo y jarana limeña
  [/vals criollo/gi, 'peruvian waltz'],
  [/polca criolla/gi, 'peruvian polka'],
  [/marinera lime[ñn]a/gi, 'peruvian marinera'],
  [/\bfestejo\b/gi, 'afro-peruvian festejo'],
  [/jarana criolla/gi, 'peruvian jarana'],
  // 🇵🇪 v0.16.0 — FASE 13 (pedido de Rudy): las movidas (alcatraz,
  // landó, tondero) y el bolero cantinero de las canciones
  // antiguas. OJO con alcatraz: sin esta regla Suno lo lee como
  // LA CÁRCEL de San Francisco. «garra afroperuana» va ANTES que
  // «afroperuano» para que no se la pise (reglas más específicas
  // primero, como siempre en este diccionario).
  [/alcatraz/gi, 'afro-peruvian alcatraz'],
  // ⚠️ «landó»: \b NO sirve con la ó acentuada (JS la trata como
  // no-palabra) — se cuida el borde con grupos, para no tocar
  // «bailando» ni «Orlando».
  [/(^|[^a-zà-ÿ])land[óo](?![a-zà-ÿ])/gi, '$1afro-peruvian lando'],
  [/tondero/gi, 'peruvian tondero'],
  [/bolero cantinero/gi, 'old-school barroom bolero'],
  [/\bcantiner[oa]s?\b/gi, 'cantina-style'],
  [/\bantigu[oa]s?\b/gi, 'old-school'],
  [/garra afroperuana/gi, 'afro-peruvian soul power'],
  [/afroperuan[oa]s?\b/gi, 'afro-peruvian'],
  [/coste[ñn][oa]s?\b/gi, 'peruvian coastal'],
  [/tr[íi]o criollo/gi, 'criollo trio'],
  [/tr[íi]o bolero/gi, 'bolero trio'],
  [/d[ée]cimas?\b/gi, 'spanish decima poetry'],
  [/serenata\b/gi, 'serenade'],
  [/m[úu]sica criolla/gi, 'peruvian criollo music'],
  [/guitarra criolla/gi, 'criollo guitar'],
  [/pe[ñn]a lime[ñn]a/gi, 'lima peña'],
  [/nostalgia lime[ñn]a/gi, 'lima nostalgia'],
  [/rockola/gi, 'jukebox'],
  [/sutiles?\b/gi, 'subtle'],
  [/balada romántica/gi, 'romantic ballad'],
  [/balada anime/gi, 'anime ballad'],
  [/\bbalada\b/gi, 'ballad'],
  [/metal sinf[óo]nico/gi, 'symphonic metal'],
  [/sinf[óo]nic[oa]s?\b/gi, 'symphonic'],
  [/orquesta completa/gi, 'full orchestra'],
  [/\borquestas?\b/gi, 'orchestra'],
  [/orquestal(?:es)?\b/gi, 'orchestral'],
  [/trap latino/gi, 'latin trap'],
  [/pop latino/gi, 'latin pop'],
  [/reggaet[óo]n/gi, 'reggaeton'],
  [/salsa romántica/gi, 'romantic salsa'],
  [/folclore andino/gi, 'andean folk'],
  [/m[úu]sica medieval/gi, 'medieval music'],
  [/banda sonora épica/gi, 'epic soundtrack'],
  [/polka norte[ñn]a/gi, 'norteño polka'],
  [/ritmo uno\b/gi, 'on the one'],
  // ── guitarras y bajo ──
  [/guitarras distorsionadas/gi, 'distorted guitars'],
  [/guitarra distorsionada/gi, 'distorted guitar'],
  [/guitarra el[ée]ctrica/gi, 'electric guitar'],
  [/guitarras el[ée]ctricas/gi, 'electric guitars'],
  [/guitarra ac[úu]stica/gi, 'acoustic guitar'],
  [/guitarras ac[úu]sticas/gi, 'acoustic guitars'],
  [/guitarra espa[ñn]ola/gi, 'spanish guitar'],
  [/guitarras psicod[ée]licas/gi, 'psychedelic guitars'],
  [/guitarras r[áa]pidas/gi, 'fast guitars'],
  [/guitarras crudas/gi, 'raw guitars'],
  [/guitarras sucias/gi, 'dirty guitars'],
  [/guitarras grandes/gi, 'big guitars'],
  [/guitarras gemelas/gi, 'twin guitars'],
  // 🇵🇪 v0.16.0 — FASE 13: la guitarra del criollismo
  [/bordoneos/gi, 'syncopated guitar bass lines'],
  [/requinto/gi, 'requinto guitar'],
  [/guitarras melodiosas/gi, 'melodic guitars'],
  [/muro de guitarras/gi, 'wall of guitars'],
  [/muros de guitarra/gi, 'wall of guitars'],
  [/guitarra r[íi]tmica/gi, 'rhythm guitar'],
  [/guitarra atmosf[ée]rica/gi, 'atmospheric guitar'],
  [/guitarra folcl[óo]rica/gi, 'folk guitar'],
  [/solos de guitarra/gi, 'guitar solos'],
  [/solo de guitarra/gi, 'guitar solo'],
  [/riff saltar[íi]n/gi, 'bouncy riff'],
  [/riffs pesados/gi, 'heavy riffs'],
  [/riff pesado/gi, 'heavy riff'],
  [/doble bombo/gi, 'double kick drums'],
  [/bajo profundo/gi, 'deep bass'],
  [/bajo el[ée]ctrico/gi, 'electric bass'],
  [/bajo slap/gi, 'slap bass'],
  [/bajo galopante/gi, 'galloping bass'],
  [/bajo pulsante/gi, 'pulsing bass'],
  [/bajo protag[óo]nico/gi, 'prominent bass'],
  [/\bbajo\b/gi, 'bass'],
  // ── teclas, cuerdas y vientos ──
  [/cajas de ritmos/gi, 'drum machines'],
  [/caja de ritmos/gi, 'drum machine'],
  [/sintetizadores\b/gi, 'synthesizers'],
  [/sintetizador\b/gi, 'synthesizer'],
  [/teclados\b/gi, 'keyboards'],
  [/teclado\b/gi, 'keyboard'],
  [/[óo]rgano\b/gi, 'organ'],
  [/clavec[íi]n/gi, 'harpsichord'],
  [/acorde[óo]n/gi, 'accordion'],
  [/bandone[óo]n/gi, 'bandoneon'],
  [/secci[óo]n de metales/gi, 'horn section'],
  [/\bmetales\b/gi, 'horns'],
  [/saxof[óo]n/gi, 'saxophone'],
  [/\bsaxo\b/gi, 'saxophone'],
  [/trompetas\b/gi, 'trumpets'],
  [/trompeta\b/gi, 'trumpet'],
  [/tromb[óo]n/gi, 'trombone'],
  [/corno franc[ée]s/gi, 'french horn'],
  [/flauta dulce/gi, 'recorder'],
  [/\bflauta\b/gi, 'flute'],
  [/\bquena\b/gi, 'quena flute'],
  [/zampo[ñn]a/gi, 'andean panpipes'],
  [/\bgaitas?\b/gi, 'bagpipes'],
  [/contrabajo/gi, 'double bass'],
  [/\bcuerdas\b/gi, 'strings'],
  [/viol[íi]n/gi, 'violin'],
  [/\bchelo\b/gi, 'cello'],
  [/arpa c[ée]ltica/gi, 'celtic harp'],
  [/\barpa\b/gi, 'harp'],
  [/la[úu]d\b/gi, 'lute'],
  [/mandolina/gi, 'mandolin'],
  [/dulc[ée]mele/gi, 'dulcimer'],
  [/cuerno de guerra/gi, 'war horn'],
  [/vibr[áa]fono/gi, 'vibraphone'],
  [/arm[óo]nica\b/gi, 'harmonica'],
  [/arm[óo]nico\b/gi, 'harmonic'],
  [/armon[íi]as operísticas/gi, 'operatic harmonies'],
  [/armon[íi]as vocales/gi, 'vocal harmonies'],
  [/armon[íi]as\b/gi, 'harmonies'],
  // ── percusión ──
  [/tumbadoras/gi, 'congas'],
  [/\bbong[óo](?![a-záéíóúüñ])/gi, 'bongos'],
  [/g[üu]iro\b/gi, 'guiro'],
  [/g[üu]ira\b/gi, 'guira'],
  [/caj[óo]n(?![a-záéíóúüñ])/gi, 'cajon drum'],
  // 🇵🇪 v0.15.1 — percusión criolla y afroperuana
  [/quijada/gi, 'jawbone'],
  [/cajita\b/gi, 'cajita drum'],
  [/\btabla\b/gi, 'tabla drums'],
  [/tambores de guerra/gi, 'war drums'],
  [/tambores taiko/gi, 'taiko drums'],
  [/\btambores\b/gi, 'drums'],
  [/percusi[óo]n [ée]pica/gi, 'epic percussion'],
  [/percusi[óo]n latina/gi, 'latin percussion'],
  [/percusi[óo]n brasile[ñn]a/gi, 'brazilian percussion'],
  [/\bpercusi[óo]n\b/gi, 'percussion'],
  [/campanas tubulares/gi, 'tubular bells'],
  [/\bcampanas\b/gi, 'bells'],
  [/bater[íi]a\b/gi, 'drums'],
  [/pandereta/gi, 'tambourine'],
  [/casta[ñn]uelas/gi, 'castanets'],
  [/palmadas/gi, 'claps'],
  [/\bpalmas\b/gi, 'handclaps'],
  // ── coros y voces (después de las de dúo, que van primero) ──
  [/coros respondones/gi, 'call and response vocals'],
  [/coros vocales/gi, 'vocal harmonies'],
  [/coros gospel/gi, 'gospel choir'],
  [/coro gregoriano/gi, 'gregorian chant'],
  [/coros [ée]picos/gi, 'epic choirs'],
  [/coro [ée]pico/gi, 'epic choir'],
  [/coro femenino/gi, 'female choir'],
  [/coro masculino/gi, 'male choir'],
  [/coros de guerra/gi, 'war chants'],
  [/coros de estadio/gi, 'stadium chants'],
  [/coros de taberna/gi, 'tavern choir'],
  [/coros masivos/gi, 'massive choirs'],
  [/coros gigantes/gi, 'huge choirs'],
  [/coros festivos/gi, 'festive choirs'],
  [/coros cantables/gi, 'singalong choirs'],
  [/coros en capas/gi, 'layered choirs'],
  [/voces femeninas/gi, 'female vocals'],
  [/voces masculinas/gi, 'male vocals'],
  [/voces en multicapas/gi, 'layered vocals'],
  [/voces agudas/gi, 'high-pitched vocals'],
  [/voz aguda/gi, 'high vocals'],
  [/voz rasposa/gi, 'raspy vocals'],
  [/voz grave/gi, 'deep vocals'],
  [/voz de tenor/gi, 'tenor vocals'],
  // 🎤 v0.16.0 — FASE 13: las voces criollas (perfiles de voz y
  // retratos de artistas). Lo específico va primero: «dinámica
  // rompevenas» antes que «rompevenas» a secas.
  [/voz de contralta/gi, 'contralto female vocals'],
  [/voz de bar[íi]tono/gi, 'baritone male vocals'],
  [/\brasgada\b/gi, 'raspy'],
  [/quej[íi]o/gi, 'sobbing soulful delivery'],
  [/melism[áa]tic[oa]s?\b/gi, 'melismatic'],
  [/bolerista\b/gi, 'bolero crooner'],
  [/quiebres emotivos/gi, 'emotional vocal breaks'],
  [/fraseo libre/gi, 'free phrasing'],
  [/voz quebrada/gi, 'emotional voice cracks'],
  [/dinámica rompevenas/gi, 'heart-wrenching dynamics'],
  [/cl[íi]max agudo/gi, 'soaring high climax'],
  [/rompevenas\b/gi, 'heart-wrenching'],
  [/voz de terciopelo/gi, 'velvet vocals'],
  [/voz desgarrada/gi, 'heartbroken vocals'],
  [/voz poderosa/gi, 'powerful vocals'],
  [/voz femenina oper[áa]tica/gi, 'operatic female vocals'],
  [/gritos de alma/gi, 'soulful shouts'],
  [/canto grupal/gi, 'group singing'],
  [/coros\b/gi, 'backing vocals'],
  [/\bcoro\b/gi, 'choir'],
  // ── energía, carácter y producción ──
  [/en[ée]rgic[oa]s?\b/gi, 'energetic'],
  [/energ[ée]tico\b/gi, 'energetic'],
  [/tranquil[oa]s?\b/gi, 'calm'],
  [/relajad[oa]s?\b/gi, 'relaxed'],
  [/[ée]pic[oa]s?\b/gi, 'epic'],
  [/agresiv[oa]s?\b/gi, 'aggressive'],
  [/alegre[s]?\b/gi, 'upbeat'],
  // 🇵🇪 v0.15.1 — caracteres criollos
  [/sentid[oa]s?\b/gi, 'soulful'],
  [/picaresc[oa]s?\b/gi, 'playful'],
  [/coquet[oa]s?\b/gi, 'flirtatious'],
  [/melanc[óo]lic[oa]s?\b/gi, 'melancholic'],
  [/romantiqu[íi]/gi, 'romantic'],
  [/rom[áa]ntic[oa]s?\b/gi, 'romantic'],
  [/oscur[oa]s?\b/gi, 'dark'],
  [/nost[áa]lgic[oa]s?\b/gi, 'nostalgic'],
  [/dram[áa]tic[oa]s?\b/gi, 'dramatic'],
  // 🎭 v0.16.0 — FASE 13: carácter criollo y bolero de barra
  [/majestuos[oa]s?\b/gi, 'majestic'],
  [/pausad[oa]s?\b/gi, 'unhurried'],
  [/c[áa]lidas?\b/gi, 'warm'],
  [/elegantes?\b/gi, 'elegant'],
  [/fren[ée]tic[oa]s?\b/gi, 'frantic'],
  [/hipn[óo]tic[oa]s?\b/gi, 'hypnotic'],
  [/medio tiempo/gi, 'half-time'],
  [/motivacional/gi, 'motivational'],
  [/triunfante/gi, 'triumphant'],
  [/festiv[oa]s?\b/gi, 'festive'],
  [/vibrante/gi, 'vibrant'],
  [/brillante[s]?\b/gi, 'bright'],
  [/psicod[ée]lic[oa]s?\b/gi, 'psychedelic'],
  [/emocional(?:es)?\b/gi, 'emotional'],
  [/emotiv[oa]s?\b/gi, 'emotional'],
  [/juvenil(?:es)?\b/gi, 'youthful'],
  [/fresc[oa]s?\b/gi, 'fresh'],
  [/festivaler[oa]s?\b/gi, 'festival'],
  [/bailables?\b/gi, 'danceable'],
  [/[íi]ntim[oa]s?\b/gi, 'intimate'],
  [/pegadiz[oa]s?\b/gi, 'catchy'],
  [/pegajos[oa]s?\b/gi, 'catchy'],
  [/potente[s]?\b/gi, 'powerful'],
  [/nocturn[oa]s?\b/gi, 'nocturnal'],
  [/cinematogr[áa]fic[oa]s?\b/gi, 'cinematic'],
  [/ac[úu]stic[oa]s?\b/gi, 'acoustic'],
  [/en vivo\b/gi, 'live'],
  [/distorsionad[oa]s?\b/gi, 'distorted'],
  [/r[áa]pid[oa]s?\b/gi, 'fast'],
  [/veloces\b/gi, 'fast'],
  [/lent[oa]s?\b/gi, 'slow'],
  [/suave[s]?\b/gi, 'smooth'],
  [/\bduro\b/gi, 'hard'],
  [/a la vez\b/gi, 'at once'],
  [/gigante[s]?\b/gi, 'huge'],
  [/enorme[s]?\b/gi, 'massive'],
  [/profund[oa]s?\b/gi, 'deep'],
  [/pulsante/gi, 'pulsing'],
  [/hipn[óo]tic[oa]s?\b/gi, 'hypnotic'],
  [/atmosf[ée]ric[oa]s?\b/gi, 'atmospheric'],
  [/so[ñn]ad[oa]s?\b/gi, 'dreamy'],
  [/oper[áa]ticas?\b/gi, 'operatic'],
  [/[ée]terea?\b/gi, 'ethereal'],
  [/dulce[s]?\b/gi, 'sweet'],
  [/callejer[oa]s?\b/gi, 'street'],
  [/colorid[oa]s?\b/gi, 'colorful'],
  [/singular(?:es)?\b/gi, 'singular'],
  [/crud[oa]s?\b/gi, 'raw'],
  [/cl[áa]sic[oa]s?\b/gi, 'classic'],
  [/impecable/gi, 'polished'],
  [/pulido\b/gi, 'polished'],
  [/minimalista/gi, 'minimalist'],
  [/esperanzador/gi, 'hopeful'],
  [/caribe[ñn][oa]\b/gi, 'caribbean'],
  [/brasile[ñn][oa]\b/gi, 'brazilian'],
  [/porte[ñn][oa]\b/gi, 'buenos aires style'],
  [/operáticas\b/gi, 'operatic'],
  // ── conectores y ambientitos (para que no quede spanglish) ──
  [/\by\b/gi, 'and'],
  [/\bcon\b/gi, 'with'],
  [/\bsin\b/gi, 'without'],
  [/\bfiesta\b/gi, 'party'],
  [/\bverano\b/gi, 'summer'],
  [/\bne[óo]n\b/gi, 'neon'],
  [/\btaberna\b/gi, 'tavern'],
  [/\bestadio\b/gi, 'stadium'],
  [/\bhimnos\b/gi, 'anthems'],
  [/\bhimno\b/gi, 'anthem'],
  [/\bvinilo\b/gi, 'vinyl'],
  [/\becos\b/gi, 'echoes'],
  [/\beco\b/gi, 'echo'],
  [/\bfalsete\b/gi, 'falsetto'],
  [/muestras de jazz/gi, 'jazz samples'],
  [/samples de jazz/gi, 'jazz samples'],
  [/\bguturales\b/gi, 'growling vocals'],
  [/\bgutural\b/gi, 'growled vocals'],
  [/\bgalope\b/gi, 'galloping'],
  [/\bcine de autos\b/gi, 'night drive'],
  [/producci[óo]n\b/gi, 'production'],
  [/\binstrumentos\b/gi, 'instruments'],
]

/** v0.11.2 — «le pedí solo voz femenina y salió mezclado»:
 * NO es error del usuario. El modelo de Suno se entrenó con
 * estilos en INGLÉS, así que el tag «voz femenina» en español
 * lo interpreta a medias… y en géneros que en su entrenamiento
 * son mayoría masculina (rock, metal…) a veces lo suelta y
 * mezcla hombre y mujer.
 *
 * Este pase traduce los tags de voz a su forma canónica en
 * inglés JUSTO ANTES DE ENVIAR a la API (la interfaz, los chips
 * y lo guardado en la biblioteca quedan en español):
 *   voz femenina   → female vocals  (+ refuerzo «solo female singer»)
 *   voz masculina  → male vocals    (+ refuerzo «solo male singer»)
 *   dúo de voces   → male and female duet vocals
 *   a capela       → a cappella (la grafía inglesa correcta)
 * También traduce las voces que llegan dentro de la esencia de
 * los artistas (p. ej. «voz femenina operática» de Nightwish).
 * El refuerzo «solo X singer» es positivo a propósito: pedir
 * «no male vocals» (negativo) en estos modelos suele LOGRAR lo
 * contrario, porque la atención cae en la palabra «male».
 *
 * v0.14.0 — después de las voces pasa el DICCIONARIO COMPLETO
 * (TRADUCCIONES_ESTILO): géneros, instrumentos, energías y
 * épocas también viajan en inglés canónico — así Suno captura
 * de verdad la esencia pedida (los instrumentos de la cumbia
 * peruana, el bajo slap del funk, el tempo ochentero…). */
/** 🚫 v0.16.0 — FASE 13: ¿el estilo es criolla? Alimenta el
 * escudo anti-ranchera — matchea en español (chips, recetas,
 * retratos) o en inglés (prompt avanzado pegado en inglés). */
export function esEstiloCriolla(estilo: string): boolean {
  return /crioll|marinera|festejo|jarana|alcatraz|land[óo]|tondero|cantiner[oa]|peruvian waltz|peruvian polka|peruvian marinera|afro-peruvian|peruvian jarana|peruvian tondero|peruvian coastal/i.test(
    estilo,
  )
}

/** 🚫 v0.16.0 — ESCUDO ANTI-RANCHERA (pedido de Rudy: Suno
 * confundía su criolla con ranchera mexicana). La API de V6 tiene
 * `negativeTags` (docs.sunoapi.org: hasta 1000 caracteres, solo
 * custom mode) — lo que NO se quiere oír. Mejor que negarlo dentro
 * del estilo, donde nombrar «mariachi» hasta lo invoca. Devuelve
 * undefined si no aplica: estilo no criolla o modelo viejo (el
 * parámetro no existe ahí y mandarlo rompería el pedido). */
export function negativosAntiRanchera(estilo: string, modelo: string): string | undefined {
  if (!esEstiloCriolla(estilo)) return undefined
  if (!/^V6/.test(modelo)) return undefined
  return 'mariachi, trumpets, guitarron, banda sinaloense, norteno, tuba, reggaeton'
}

/** 📚 v0.18.0 — FASE 15 (pedido de Rudy): ¿la receta sigue
 * aplicada en el estilo? Ya NO se compara con igualdad exacta:
 * mientras TODAS sus partes sigan presentes — aunque se sume la
 * voz, se encienda un instrumento o se toque cualquier chip — el
 * ✓ del chip sigue prendido. Antes cualquier ajuste la
 * «desactivaba» y parecía que lo predeterminado se había perdido. */
export function recetaContenidaEn(recetaEstilo: string, estilo: string): boolean {
  const presentes = estilo
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
  return recetaEstilo
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .every((p) => presentes.includes(p))
}

/** 🎤 v0.18.0 — FASE 15: aplica una receta CONSERVANDO la voz ya
 * elegida. La receta manda en género, instrumentos, carácter y
 * tempo — pero los tags de voz del usuario (hombre/mujer/dúo y el
 * perfil criolla activo) se quedan: antes se los llevaba puestos
 * de reemplazo y la canción salía con la voz «cualquiera».
 * `tagsVoz` son los tags a preservar (TAGS_VOZ + los tags de los
 * perfiles criolla, que MusicaView pasa de su estudio). */
export function recetaConVoz(recetaEstilo: string, estiloActual: string, tagsVoz: string[]): string {
  const base = recetaEstilo
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const baseBaja = base.map((p) => p.toLowerCase())
  const aMantener = estiloActual
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && tagsVoz.includes(p.toLowerCase()) && !baseBaja.includes(p.toLowerCase()))
  return [...base, ...aMantener].join(', ')
}

export function estiloParaSuno(estilo: string, limite: number = LIMITE_ESTILO_SUNO): string {
  const e0 = estilo.trim()
  if (!e0) return e0
  const enMinusculas = e0.toLowerCase()
  const pideFemenina = enMinusculas.includes('voz femenina') || enMinusculas.includes('voces femeninas')
  const pideMasculina = enMinusculas.includes('voz masculina') || enMinusculas.includes('voces masculinas')
  const pideDuo = enMinusculas.includes('dúo de voces') || enMinusculas.includes('duo de voces')
  let e = e0
    .replace(/voz femenina oper[áa]tica/gi, 'operatic female vocals')
    .replace(/voz femenina/gi, 'female vocals')
    .replace(/voz masculina/gi, 'male vocals')
    .replace(/d[úu]o de voces/gi, 'male and female duet vocals')
    .replace(/\ba capela\b/gi, 'a cappella')
  // refuerzo solo cuando el pedido es de UNA voz (si pidió dúo,
  // mezclar es justamente lo buscado — nada que reforzar).
  if (pideFemenina && !pideDuo) e += ', solo female singer'
  if (pideMasculina && !pideDuo) e += ', solo male singer'
  // v0.14.0 — el resto del estilo también viaja en inglés: géneros,
  // instrumentos, energías, épocas y producción.
  e = TRADUCCIONES_ESTILO.reduce((texto, [busca, reemplazo]) => texto.replace(busca, reemplazo), e)
  // tope del estilo según el modelo (200 en los viejos, 1000 en
  // V4.5+/V5/V6): si el refuerzo no entró, se van soltando tags
  // del FINAL (nunca el primero, que es el género principal).
  if (e.length > limite) {
    const partes = e.split(',').map((p) => p.trim()).filter(Boolean)
    while (partes.length > 1 && partes.join(', ').length > limite) partes.pop()
    e = partes.join(', ')
  }
  return e
}

/** v0.11.3 — METATAGS de la letra en español → inglés canónico.
 *
 * LA PIEZA QUE FALTABA DEL DÚO (v0.11.2 arregló el estilo; esto
 * arregla la LETRA): para que Suno alterne hombre y mujer en un
 * dueto, lo que manda son las ETIQUETAS DE SECCIÓN dentro de la
 * letra. Claude las escribe en español ([Voz hombre], [Coro]…)
 * porque la letra es para Rudy — pero Suno solo OBEDECE las
 * canónicas en inglés ([Male Vocals], [Chorus]…): las nuestras
 * las interpreta a medias y por eso las voces se mezclaban.
 *
 * Mismo patrón que estiloParaSuno: traducción SOLO en la frontera
 * de la API. Lo que se ve, se guarda y se comparte queda español.
 * Lo que ya viene en inglés no se toca. */
const TRADUCCIONES_TAG: ReadonlyArray<readonly [RegExp, string]> = [
  // ── voces (el corazón del dúo) — primero los patrones largos ──
  [/\[\s*voz\s+hombre\s+y\s+mujer\s*\]/gi, '[Duet]'],
  [/\[\s*voz\s+mujer\s+y\s+hombre\s*\]/gi, '[Duet]'],
  [/\[\s*voz\s+de\s+hombre\s*\]/gi, '[Male Vocals]'],
  [/\[\s*voz\s+de\s+mujer\s*\]/gi, '[Female Vocals]'],
  [/\[\s*voz\s+masculina\s*\]/gi, '[Male Vocals]'],
  [/\[\s*voz\s+femenina\s*\]/gi, '[Female Vocals]'],
  [/\[\s*voz\s+hombre\s*\]/gi, '[Male Vocals]'],
  [/\[\s*voz\s+mujer\s*\]/gi, '[Female Vocals]'],
  [/\[\s*dueto\s*\]/gi, '[Duet]'],
  [/\[\s*d[úu]o\s*\]/gi, '[Duet]'],
  [/\[\s*amb[oa]s\s+(las\s+)?voces\s*\]/gi, '[Duet]'],
  [/\[\s*amb[oa]s\s*\]/gi, '[Duet]'],
  [/\[\s*hombre\s*\]/gi, '[Male Vocals]'],
  [/\[\s*mujer\s*\]/gi, '[Female Vocals]'],
  // ── estructura ──
  [/\[\s*pre[\s-]*coro\s*\]/gi, '[Pre-Chorus]'],
  [/\[\s*coro([^\]]*)\]/gi, '[Chorus$1]'],
  [/\[\s*verso([^\]]*)\]/gi, '[Verse$1]'],
  [/\[\s*puente\s*\]/gi, '[Bridge]'],
  [/\[\s*interludio\s*\]/gi, '[Interlude]'],
  [/\[\s*solo\s+de\s+guitarra\s*\]/gi, '[Guitar Solo]'],
  [/\[\s*solo\s+de\s+piano\s*\]/gi, '[Piano Solo]'],
  [/\[\s*final\s*\]/gi, '[Outro]'],
]

/** Aplica todas las traducciones de metatags de una sola pasada. */
export function letraParaSuno(letra: string): string {
  return TRADUCCIONES_TAG.reduce((texto, [busca, reemplazo]) => texto.replace(busca, reemplazo), letra)
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
    /** 🎤 v0.17.0 — FASE 14: voiceId de la voz personal del
     * usuario (se crea en Ajustes → «Mi voz»). Solo viaja en
     * canciones cantadas y con la familia V6 — en los otros
     * casos ni se manda (la API lo rechazaría). */
    vozId?: string
  },
): Promise<PistaSuno[]> {
  // duration solo vale en customMode y en modelos que lo soportan;
  // en los otros ni se manda (la API podría rechazar el pedido).
  const duracion =
    op.duracionSeg && op.duracionSeg >= 10 && modeloSunoSoportaDuracion(op.modelo) ? op.duracionSeg : undefined
  // 🎤 v0.17.0 — FASE 14: la voz personal viaja como personaId +
  // personaModel 'voice_persona' (docs.sunoapi.org: solo V6,
  // V6_MINI y V6_WILD). En instrumental no hay voz que clonar y
  // en modelos viejos el parámetro no existe: ni se manda.
  const persona =
    op.vozId && !op.instrumental && modeloSunoSoportaVoz(op.modelo) ? op.vozId : undefined
  // 🩹 v0.8.1 — red de seguridad: por más que la UI ya recorte,
  // acá NUNCA se manda una letra de más de 5.000 caracteres (la
  // API la rechaza entera y se pierden los créditos del intento).
  // v0.11.3 — la traducción de metatags va ANTES del recorte:
  // [Voz hombre]→[Male Vocals] alarga un poco el texto, así el
  // tope se mide sobre lo que REALMENTE va a viajar.
  const { letra: letraAEnviar } = recortarLetraParaSuno(
    letraParaSuno(op.instrumental ? '' : op.letra),
  )
  const r = await pedir(motor, '/api/v1/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: op.instrumental ? '' : letraAEnviar,
      // La API nueva prioriza `lyrics` sobre `prompt` cuando existe
      // (docs.sunoapi.org, custom mode) — se mandan ambas por si la
      // URL base del usuario apunta a una versión vieja de la API.
      lyrics: op.instrumental ? '' : letraAEnviar,
      // v0.11.2 — el estilo viaja TRADUCIDO a inglés en lo que es
      // voz (la frontera de la API): «voz femenina» a secas Suno
      // la entiende a medias y mezcla hombre y mujer; «female
      // vocals, solo female singer» sí lo respeta. Lo que se guarda
      // en la biblioteca queda en español, como siempre.
      style: estiloParaSuno(op.estilo, limiteEstiloSuno(op.modelo)),
      title: op.titulo,
      customMode: true,
      instrumental: op.instrumental,
      model: op.modelo,
      // 🚫 v0.16.0 — FASE 13: escudo anti-ranchera. Si el estilo es
      // criolla y el modelo es V6, viaja la lista de lo que NO se
      // quiere oír (mariachi, guitarrón…). En modelos viejos el
      // parámetro no existe: ni se manda.
      ...(negativosAntiRanchera(op.estilo, op.modelo)
        ? { negativeTags: negativosAntiRanchera(op.estilo, op.modelo) }
        : {}),
      // 🎤 v0.17.0 — FASE 14: con TU voz. Suno recibe el personaId
      // de la voz creada en Ajustes y canta la canción con tu
      // timbre (docs: personaModel 'voice_persona', familia V6).
      ...(persona ? { personaId: persona, personaModel: 'voice_persona' } : {}),
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
  // 🩹 v0.11.1 — mismo tope de 5.000 para la letra de la continuación
  // v0.11.3 — y mismos metatags traducidos: la continuación alterna
  // las voces igual que la parte original del dúo.
  const { letra: letraAEnviar } = recortarLetraParaSuno(
    letraParaSuno(op.instrumental ? '' : op.letra),
  )
  const r = await pedir(motor, '/api/v1/generate/extend', {
    method: 'POST',
    body: JSON.stringify({
      audioId: op.audioId,
      ...(op.taskId ? { taskId: op.taskId } : {}),
      continueAt: Math.round(op.continueAt),
      // igual que en generate: la API nueva prioriza lyrics; ambas van
      lyrics: op.instrumental ? '' : letraAEnviar,
      prompt: op.instrumental ? '' : letraAEnviar,
      // v0.11.2 — misma frontera que generate: la voz pide en
      // español, Suno la recibe en inglés reforzado (para que la
      // continuación respete la MISMA voz que la canción original).
      style: estiloParaSuno(op.estilo, limiteEstiloSuno(op.modelo)),
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

/** v0.9.0 — una palabra de la letra sincronizada de Suno, con su
 * segundo de inicio y fin. Con esta lista se arma el archivo .lrc
 * (letra que sigue la música, como en Spotify) al bajar el MP3. */
export interface PalabraSincronizada {
  palabra: string
  startS: number
  endS: number
}

/** v0.9.0 — LETRA SINCRONIZADA cruda de una pista (docs: POST
 * /api/v1/generate/get-timestamped-lyrics con taskId + audioId):
 * palabra por palabra CON SEGUNDOS. Con eso se arma el .lrc de la
 * canción al bajarla. Si la pista no tiene datos (instrumental,
 * canción vieja, API sin datos) → null, sin lanzar error: es un
 * plus, no un requisito. */
export async function pedirLetraSincronizada(
  motor: MotorSuno,
  taskId: string,
  audioId: string,
): Promise<PalabraSincronizada[] | null> {
  try {
    const r = await pedir(motor, '/api/v1/generate/get-timestamped-lyrics', {
      method: 'POST',
      body: JSON.stringify({ taskId, audioId }),
    })
    // formato tolerante: data.alignedWords | data.response.alignedWords
    // | data (array directo) — la API fue migrando el sobre con el tiempo.
    const d = r.data as Record<string, unknown> | null
    let crudo: unknown = d?.alignedWords
    if (!Array.isArray(crudo) && d && typeof d === 'object') {
      const resp = (d as Record<string, unknown>).response
      if (resp && typeof resp === 'object') crudo = (resp as Record<string, unknown>).alignedWords
    }
    if (!Array.isArray(crudo)) crudo = Array.isArray(d) ? d : null
    if (!Array.isArray(crudo) || !crudo.length) return null
    const palabras: PalabraSincronizada[] = []
    for (const item of crudo as Array<Record<string, unknown>>) {
      if (item.success === false) continue
      const startS = item.startS ?? item.startTime
      const endS = item.endS ?? item.endTime
      if (typeof startS !== 'number') continue
      const palabra = String(item.word ?? item.text ?? '')
      palabras.push({ palabra, startS, endS: typeof endS === 'number' ? endS : startS })
    }
    return palabras.length ? palabras : null
  } catch {
    // es un PLUS opcional: si falla, se baja el MP3 sin .lrc
    return null
  }
}

/**
 * v0.8.0 — análisis de la letra sincronizada de una pista: con
 * las palabras y sus segundos sabemos EXACTAMENTE hasta dónde
 * llegó a cantar una canción cortada (palabrasCantadas /
 * finUltimoCanto) para armar la continuación con lo que faltó.
 * Si la pista no tiene datos → null, sin lanzar error.
 */
export async function consultarLetraConTiempos(
  motor: MotorSuno,
  taskId: string,
  audioId: string,
): Promise<LetraConTiempos | null> {
  const palabras = await pedirLetraSincronizada(motor, taskId, audioId)
  if (!palabras) return null
  let fin = 0
  for (const p of palabras) if (p.endS > fin) fin = p.endS
  return { palabrasCantadas: palabras.length, finUltimoCanto: fin > 0 ? fin : undefined }
}

/** ⏳ v0.19.0 — FASE 16: la parte de la letra que QUEDÓ SIN
 * CANTARSE sabiendo cuántas palabras se cantaron: recorre línea
 * por línea (las marcas [Coro] no cuentan) y junta desde la
 * primera línea incompleta hasta el final — mejor re-cantar una
 * línea entera que dejarla cortada a la mitad. (Se mudó acá
 * desde BibliotecaView: ahora la usan también las continuaciones
 * automáticas del seguimiento.) */
export function restanteDeLetra(texto: string, palabrasCantadas: number): string {
  if (!texto.trim() || palabrasCantadas <= 0) return ''
  let cantadas = 0
  let modoRestante = false
  const restantes: string[] = []
  for (const linea of texto.split('\n')) {
    const esMarca = /^\s*\[[^\]]*\]\s*$/.test(linea)
    if (esMarca) {
      if (modoRestante) restantes.push(linea)
      continue
    }
    const palabras = linea.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length
    if (palabras === 0) {
      if (modoRestante) restantes.push(linea)
      continue
    }
    if (!modoRestante && cantadas + palabras <= palabrasCantadas) {
      cantadas += palabras // línea cantada entera
      continue
    }
    modoRestante = true
    restantes.push(linea)
  }
  return restantes.join('\n').trim()
}

/** ⏳ v0.19.0 — FASE 16 (pedido de Rudy): con lo que la pista llegó
 * a cantar, QUÉ continuación hace falta: la letra restante y el
 * segundo donde cortar (mismas fórmulas del modal ⏩ Extender,
 * ahora también en automático). null = no hace falta: se cantó
 * todo (o quedó menos de una línea suelta, que no justifica otra
 * generación). */
export function planContinuacion(
  letra: string,
  duracionSeg: number,
  palabrasCantadas: number,
  finUltimoCanto?: number,
): { restante: string; continueAt: number } | null {
  const restante = restanteDeLetra(letra, palabrasCantadas)
  const palabrasRestantes = restante
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  if (palabrasRestantes < 4) return null
  const dur = duracionSeg > 0 ? duracionSeg : 240
  const continueAt = finUltimoCanto
    ? Math.floor(Math.min(Math.max(finUltimoCanto - 2, 5), Math.max(5, dur - 3)))
    : Math.max(5, Math.floor(dur - 10))
  return { restante, continueAt }
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

// ═══════════════════════════════════════════════════════════
// 🎤 v0.17.0 — FASE 14: MI VOZ (Suno Voice API). El usuario
// graba DOS audios cortos y Suno arma su perfil de voz; desde
// ahí, las canciones pueden salir cantadas por él (se manda el
// voiceId como personaId en /generate — ver generarMusica).
//
// El flujo (docs.sunoapi.org, sección Voice):
//   1. subirAudioVoz — el audio va al File Upload API (host propio
//      de sunoapi.org, v0.19.1; vive 3 días, de sobra) y devuelve una
//      URL pública: la API no acepta el archivo directo, pide
//      voiceUrl/verifyUrl.
//   2. iniciarValidacionVoz — la API ESCUCHA la muestra (canta o
//      habla, sin música de fondo) y prepara una frase de
//      verificación en español.
//   3. consultarFraseVoz — polling hasta que la frase llega.
//   4. el usuario CANTA esa frase (docs: cantada funciona mejor
//      que hablada) y se sube igual que la muestra.
//   5. crearVozPersonal — la API cruza muestra + frase cantada y
//      crea la voz (devuelve un taskId NUEVO).
//   6. consultarVozCreada — polling hasta el voiceId.
// Nosotros usamos polling en todos los pasos (mismo patrón que
// las canciones): el callBackUrl viaja solo para satisfacer la
// validación de la API.
// ═══════════════════════════════════════════════════════════

/** La voz personal creada con Suno Voice — se guarda en el
 * dispositivo (clave `voz_suno`) y viaja a /generate como
 * personaId. `taskId` es el de la CREACIÓN: lo pide el
 * check-voice de disponibilidad. */
export interface VozPersonal {
  voiceId: string
  taskId: string
  nombre: string
  fecha: number
}

/** Creación en curso (clave `voz_tarea`): permite RETOMAR el
 * flujo si el usuario cambia de pestaña o cierra la app a mitad
 * de camino — la tarea sigue viva del lado de la API. */
export interface TareaVozSuno {
  etapa: 'frase' | 'creando'
  taskId: string
  inicio: number
  frase?: string
}

/** ¿El modelo acepta generar con voz personal? (docs: solo la
 * familia V6 — V5 y V5_5 están discontinuados). */
export function modeloSunoSoportaVoz(modelo: string): boolean {
  return /^V6/.test(modelo)
}

/** Traduce los errores propios del flujo de voz (llegan en
 * inglés) a criollo entendible. Los desconocidos pasan tal cual. */
function traducirErrorVoz(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('verification') || m.includes('verify') || m.includes('not match'))
    return 'la verificación de tu voz no coincidió — grabate cantando la frase bien clara, sin ruido de fondo, y probá de nuevo'
  if (m.includes('no voice') || m.includes('vocal') || m.includes('instrument') || m.includes('speech'))
    return 'la API no encontró tu voz en el audio — probá con una grabación donde se oiga SOLO tu voz, sin música'
  if (m.includes('expire'))
    return 'la tarea expiró — empezá de nuevo con una muestra nueva'
  return msg ? `Suno API: ${msg}` : 'la tarea de voz falló — probá de nuevo'
}

/** Blob → data URL (base64) — el formato que acepta el upload. */
function blobADataUrl(audio: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(lector.result as string)
    lector.onerror = () => rechazar(new Error('no pude leer el audio grabado'))
    lector.readAsDataURL(audio)
  })
}

/** Sube un audio al File Upload API de sunoapi.org (host propio,
 * ver HOST_ARCHIVOS_SUNO) y devuelve su URL pública (los archivos
 * viven 3 días — alcanza de sobra para el flujo de voz). Base64
 * está recomendado hasta ~10 MB (docs); más que eso se recorta del
 * lado del que graba. */
export async function subirAudioVoz(motor: MotorSuno, audio: Blob): Promise<string> {
  if (audio.size > 9_000_000)
    throw new Error('el audio pesa más de 10 MB — grabá algo más corto y volvé a probar')
  const r = await pedir(
    motor,
    '/api/file-base64-upload',
    {
      method: 'POST',
      body: JSON.stringify({
        base64Data: await blobADataUrl(audio),
        uploadPath: 'musictrack/voz',
        fileName: `audio-${Date.now()}`,
      }),
    },
    HOST_ARCHIVOS_SUNO,
  )
  // formato tolerante: data.downloadUrl | data.url (por si mueven el sobre)
  const d = (r.data ?? {}) as Record<string, unknown>
  const url = d.downloadUrl ?? d.url
  if (typeof url !== 'string' || !url)
    throw new Error('la API no devolvió la URL del audio subido')
  return url
}

/** Paso 1 — arranca el análisis: la API escucha la muestra
 * (0 → `segundos`, con tope de 30 que es más que suficiente)
 * y prepara la frase de verificación. Devuelve el taskId. */
export async function iniciarValidacionVoz(
  motor: MotorSuno,
  urlAudio: string,
  segundos: number,
): Promise<string> {
  const r = await pedir(motor, '/api/v1/voice/validate', {
    method: 'POST',
    body: JSON.stringify({
      voiceUrl: urlAudio,
      vocalStartS: 0,
      vocalEndS: Math.max(3, Math.min(Math.ceil(segundos), 30)),
      language: 'es',
      callBackUrl: CALLBACK_URL,
    }),
  })
  const d = (r.data ?? {}) as Record<string, unknown>
  if (typeof d.taskId !== 'string' || !d.taskId)
    throw new Error('la API no devolvió la tarea de validación')
  return d.taskId
}

/** Paso 2 — consulta la frase de verificación. `frase` llega
 * llena cuando está lista (estado wait_validating); mientras la
 * API trabaja llega null. Si la tarea falló, viene `error`. */
export async function consultarFraseVoz(
  motor: MotorSuno,
  taskId: string,
): Promise<{ frase: string | null; estado: string; error?: string }> {
  const r = await pedir(motor, `/api/v1/voice/validate-info?taskId=${encodeURIComponent(taskId)}`)
  const d = (r.data ?? null) as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || !Object.keys(d).length)
    return { frase: null, estado: 'wait_processing' }
  const estado = String(d.status ?? 'wait_processing')
  if (estado.includes('fail'))
    return { frase: null, estado, error: traducirErrorVoz(String(d.errorMessage ?? '')) }
  const frase =
    typeof d.validateInfo === 'string' && d.validateInfo.trim() ? d.validateInfo.trim() : null
  return { frase, estado }
}

/** Paso 3 — crea la voz con la grabación de la frase cantada.
 * Devuelve el taskId NUEVO de la creación (distinto del de la
 * validación). */
export async function crearVozPersonal(
  motor: MotorSuno,
  op: { taskIdValidacion: string; urlVerificacion: string; nombre: string },
): Promise<string> {
  const r = await pedir(motor, '/api/v1/voice/generate', {
    method: 'POST',
    body: JSON.stringify({
      taskId: op.taskIdValidacion,
      verifyUrl: op.urlVerificacion,
      voiceName: op.nombre,
      callBackUrl: CALLBACK_URL,
    }),
  })
  const d = (r.data ?? {}) as Record<string, unknown>
  if (typeof d.taskId !== 'string' || !d.taskId)
    throw new Error('la API no devolvió la tarea de creación de tu voz')
  return d.taskId
}

/** Paso 4 — sigue la creación de la voz: `voiceId` llega cuando
 * la tarea termina bien (estado success); si falla, `error`. */
export async function consultarVozCreada(
  motor: MotorSuno,
  taskId: string,
): Promise<{ voiceId: string | null; estado: string; error?: string }> {
  const r = await pedir(motor, `/api/v1/voice/record-info?taskId=${encodeURIComponent(taskId)}`)
  const d = (r.data ?? null) as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || !Object.keys(d).length)
    return { voiceId: null, estado: 'wait_processing' }
  const estado = String(d.status ?? 'wait_processing')
  if (estado.includes('fail'))
    return { voiceId: null, estado, error: traducirErrorVoz(String(d.errorMessage ?? '')) }
  const voiceId = typeof d.voiceId === 'string' && d.voiceId ? d.voiceId : null
  return { voiceId, estado }
}

/** ¿La voz sigue disponible en la cuenta de sunoapi.org?
 * (check-voice — para el botón «Verificar» de Ajustes). */
export async function vozDisponible(motor: MotorSuno, taskId: string): Promise<boolean> {
  const r = await pedir(motor, '/api/v1/voice/check-voice', {
    method: 'POST',
    body: JSON.stringify({ task_id: taskId }),
  })
  const d = (r.data ?? {}) as Record<string, unknown>
  return d.isAvailable === true
}
