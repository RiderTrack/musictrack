import { contarPalabrasCantables, tokensSinMarcas, type LineaLrc, type PalabraLrc } from '@/core/audio/mp3'

// ═══════════════════════════════════════════════════════════
// ✏️ v0.23.0 — LETRA DEL VIDEO KARAOKE (pedido de Rudy):
// «yo escribo mis canciones con (Coro), (Verso 1), (Outro)…
// y esas marcas se plasmaban en el videoclip». Acá viven las
// dos herramientas para que el video muestre SOLO lo que se
// canta:
//   1. FILTRO DE MARCAS — las líneas que son pura marca de
//      estructura se esconden, y las que traen una marca («(Coro)
//      Bailamos…») quedan «Bailamos…». La letra guardada de
//      la canción NUNCA se toca: el filtro es solo para el
//      dibujo del video.
//   2. ALINEACIÓN DE LA LETRA EDITADA — si Rudy edita la letra
//      del video (saca líneas, corrige typos, agrega otras),
//      cada línea editada hereda el tiempo de su original; las
//      nuevas se interpolan entre las vecinas.
//
// 🩹 v0.23.1 — el filtro se le escapaba por tres lados y las
// marcas SEGUIAN saliendo en el video (Rudy lo reportó):
//   · el video dibuja las PALABRAS (con su tiempo), no el texto:
//     se limpiaba `texto` pero las `palabras` seguían trayendo
//     el «(Coro)» → ahora se limpian las dos cosas.
//   · las etiquetas largas ([Male Vocal - Soft and Romantic])
//     no contaban como marca → ahora TODO lo que está envuelto
//     de punta a punta entre (…) o […] es marca, diga lo que
//     diga (es la guía que Rudy escribe, no se canta).
//   · las marcas del FINAL o del medio («letra (x2)») quedaban
//     → ahora se sacan todos los pedazos entre ( ) y [ ].
// Módulo 100% puro (sin DOM ni storage) para testearlo fácil.
// ═══════════════════════════════════════════════════════════

/** Marcas que SOLO cuentan como marca (nunca serían una línea de
 * letra por sí solas sin paréntesis): coro, verso, puente… */
const MARCAS_SEGURAS: ReadonlySet<string> = new Set([
  'coro',
  'coros',
  'estribillo',
  'verso',
  'versos',
  'estrofa',
  'estrofas',
  'pre-coro',
  'precoro',
  'pre coro',
  'puente',
  'bridge',
  'intro',
  'entrada',
  'outro',
  'salida',
  'coda',
  'interludio',
  'instrumental',
  'ad-lib',
  'adlib',
  'ad lib',
  'falsete',
  'falsetto',
  'male vocal',
  'female vocal',
  'voz principal',
  'coro de fondo',
  'voces de fondo',
  'dueto',
  'duet',
  'guitar solo',
  'piano solo',
  'solo de guitarra',
  'solo de piano',
  'hablado',
  'spoken',
  'rapeado',
  'susurrado',
  'whisper',
])

/** Palabras que SÍ pueden ser letra («solo tú y yo»): solo valen
 * como marca si Rudy las puso ENTRE paréntesis o corchetes. */
const MARCAS_ENTRE_PARENTESIS: ReadonlySet<string> = new Set([
  'solo',
  'solos',
  'break',
  'hook',
  'drop',
  'final',
  'fin',
  'repite',
  'repeticion',
  'repetición',
  'bis',
])

/** Minúsculas, sin acentos, espacios simples — para comparar. */
function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** ¿es un número de sección? — «verso 2», «coro iii», «x2» */
function esNumeral(s: string): boolean {
  return /^\d+$/.test(s) || /^(x{0,3})(ix|iv|v?i{0,3})$/.test(s) || /^x\s*\d+$/.test(s)
}

/** ¿esta línea es PURA marca de estructura y no letra?
 * Acepta «(Coro)», «[Verso 1]», «Coro:», «CORO», «Estribillo x2»,
 * «Pre-coro:», «(Outro)»… pero NO «(te amo)» ni «Coro bailamos». */
export function esMarcaEstructura(texto: string): boolean {
  let t = texto.trim()
  if (!t) return false
  // ¿envuelta en (…) […] {…}? (puede traer varias capas)
  let envuelta = false
  let cambio = true
  while (cambio) {
    cambio = false
    for (const [abre, cierra] of [
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
    ] as const) {
      if (t.length >= 2 && t.startsWith(abre) && t.endsWith(cierra)) {
        t = t.slice(1, -1)
        envuelta = true
        cambio = true
      }
    }
  }
  // 🩹 v0.23.1 — TODO lo envuelto de punta a punta es marca,
  // diga lo que diga y por más largo que sea: (Coro), (x2),
  // [Male Vocal - Soft and Romantic]… es la guía que Rudy
  // escribe para armar la canción — al video no va.
  if (envuelta) return true
  // «Coro:» → «Coro»
  t = t.replace(/[\s:：,;·|—-]+$/u, '').trim()
  // «coro x2» / «coro (x2)» → «coro»
  t = t.replace(/[([]?\s*x\s*\d+\s*[)\]]?$/i, '').trim()
  const n = normalizar(t)
  if (!n) return false
  const palabras = n.split(' ').filter((p) => !esNumeral(p) && p !== 'parte' && p !== 'pt' && p !== 'pt.')
  if (!palabras.length) return true // «2» solo… raro, pero es marca
  if (palabras.length > 3) return false
  const junto = palabras.join(' ')
  return MARCAS_SEGURAS.has(junto) || (envuelta && MARCAS_ENTRE_PARENTESIS.has(junto))
}

/** Le saca la marca DEL PRINCIPIO a una línea mixta:
 * «(Coro) Bailamos» → «Bailamos» · «Coro: Bailamos» → «Bailamos».
 * Si la línea no arranca con marca (o la marca no es marca),
 * vuelve igual (solo acomodada al costado). */
export function quitarMarcaAlInicio(texto: string): string {
  // 🩹 v0.23.1 — el tope de 30 caracteres se le quedaba corto a
  // etiquetas como «[Male Vocal - Soft and Romantic]» (32+)
  const parentesis = texto.match(/^\s*[(\[]([^)\]]{1,60})[)\]]\s*/)
  if (parentesis && esMarcaEstructura(`(${parentesis[1].trim()})`)) {
    return texto
      .slice(parentesis[0].length)
      .replace(/^\s*[|·»-]\s*/, '')
      .trim()
  }
  const conDospuntos = texto.match(/^\s*([^:：]{2,60})[:：]\s+(.*)$/s)
  if (conDospuntos && esMarcaEstructura(conDospuntos[1].trim())) {
    return conDospuntos[2].trim()
  }
  return texto.trim()
}

/** 🩹 v0.23.1 — le saca a una línea TODOS los pedazos que estén
 * entre (…) o […] (anidados o no; al principio, en el medio o
 * al final). Lo que Rudy pone entre paréntesis o corchetes es
 * guía de estructura — al video no va. */
export function sinFragmentosEntreMarcas(texto: string): string {
  let t = texto
  let cambio = true
  while (cambio) {
    cambio = false
    const limpio = t
      .replace(/\([^()]*\)/g, ' ')
      .replace(/\[[^\][]*\]/g, ' ')
      .replace(/\{[^{}]*\}/g, ' ')
    if (limpio !== t) {
      t = limpio
      cambio = true
    }
  }
  return t.replace(/\s+/g, ' ').trim()
}

/** ¿dos palabras dicen lo mismo? — sin MAYÚSCULAS, acentos ni
 * puntuación: «(Coro),» y «coro» son gemelas. */
function gemelas(a: string, b: string): boolean {
  const cruda = (s: string) => normalizar(s).replace(/[^a-z0-9\s]/g, '').trim()
  const x = cruda(a)
  return !!x && x === cruda(b)
}

/** 🩹 v0.23.1 — las palabras-con-tiempo de una línea, dejando
 * solo las que siguen en el texto limpio: la «(Coro)» se va con
 * su tiempo y lo cantable queda igual (el video dibuja LAS
 * PALABRAS — si acá quedaba una marca, era la que se veía).
 * Si una palabra cantable no aparece (una marca se la llevó al
 * contar), se REPONE con el tiempo de la anterior: la línea se
 * ve entera siempre. */
export function limpiarPalabrasDeLinea(
  palabras: PalabraLrc[] | undefined,
  textoLimpio: string,
  arranque?: number,
): PalabraLrc[] | undefined {
  if (!palabras?.length) return palabras
  const esperadas = textoLimpio.split(/\s+/).filter(Boolean)
  if (!esperadas.length) return undefined
  // apareo por subsecuencia común más larga (líneas cortas: chico)
  const n = palabras.length
  const m = esperadas.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = gemelas(palabras[i].texto, esperadas[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const parejas: (PalabraLrc | null)[] = esperadas.map(() => null)
  let i = 0
  let j = 0
  let casadas = 0
  while (i < n && j < m) {
    if (gemelas(palabras[i].texto, esperadas[j])) {
      parejas[j] = palabras[i]
      casadas++
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  if (!casadas) return undefined // nada que casar: se enciende la línea entera
  let ultimo = arranque ?? parejas.find((p) => p)?.startS ?? palabras[0].startS
  return esperadas.map((texto, k) => {
    const p = parejas[k]
    if (p) {
      ultimo = p.startS
      // por si la palabra venía envuelta: «(Coro)» → «Coro»
      const limpia = p.texto.replace(/^[({\[]+/, '').replace(/[)}\]]+$/, '').trim()
      return limpia && limpia !== p.texto ? { ...p, texto: limpia } : p
    }
    return { texto, startS: ultimo }
  })
}

/** La letra lista para el video: sin líneas-marca, sin marcas
 * pegadas a lo que se canta (principio, medio o final) y con
 * las palabras-con-tiempo limpias también. Los tiempos van
 * intactos (cada línea conserva el suyo; las escondidas no
 * molestan).
 * 🩹 v0.23.2 — el atajo «el texto ya está limpio → línea tal
 * cual» dejaba pasar las PALABRAS envenenadas: Suno devuelve
 * las marcas ([Verse 1], (Coro)…) como palabras más, y el
 * video dibuja las palabras → salía «[Verse 1] En la casona…»
 * aunque el texto estuviera limpio (Rudy lo vio en la vista
 * previa). Ahora las palabras SIEMPRE se pasan por el cedazo:
 * las que no casan con el texto (marcas o palabras corridas)
 * se sacan y las que faltan se reponen con el tiempo vecino. */
export function filtrarMarcasEstructura(lineas: LineaLrc[], quitarPrefijos = true): LineaLrc[] {
  const listas: LineaLrc[] = []
  for (const l of lineas) {
    if (esMarcaEstructura(l.texto)) continue
    const paso1 = quitarPrefijos ? quitarMarcaAlInicio(l.texto) : l.texto.trim()
    const texto = quitarPrefijos ? sinFragmentosEntreMarcas(paso1) : paso1
    if (!texto) continue
    if (texto === l.texto) {
      const palabras = limpiarPalabrasDeLinea(l.palabras, texto, l.startS)
      listas.push(palabras ? { ...l, palabras } : { ...l })
      continue
    }
    const palabras = limpiarPalabrasDeLinea(l.palabras, texto, l.startS)
    listas.push(palabras ? { ...l, texto, palabras } : { ...l, texto })
  }
  return listas
}

/** 🩹 v0.23.2 — repara una letra con tiempos cuyas PALABRAS
 * quedaron envenenadas por las marcas de Suno (los cachés lrc-
 * guardados por versiones viejas): junta TODAS las palabras
 * (la corriente completa, en orden), les saca los grupos-marca
 * y las REPARTE línea por línea según cuántas palabras
 * cantables tiene cada texto — con esto cada palabra recupera
 * SU tiempo real de Suno, en vez del tiempo prestado del
 * vecino. Devuelve el MISMO array si no había nada que reparar
 * (así el caché no se reescribe al pedo). */
export function repararPalabrasDeLineas(lineas: LineaLrc[]): LineaLrc[] {
  const corriente: PalabraLrc[] = []
  for (const l of lineas) {
    if (l.palabras?.length) corriente.push(...l.palabras)
  }
  if (!corriente.length) return lineas // sin palabras: nada que reparar
  const limpias = tokensSinMarcas(corriente, (p) => p.texto)
  if (limpias.length === corriente.length) return lineas // ya sanea
  let idx = 0
  return lineas.map((l) => {
    const cantables = contarPalabrasCantables(l.texto)
    const propias = limpias.slice(idx, idx + cantables)
    idx += cantables
    if (!propias.length) return l.palabras?.length ? { ...l, palabras: undefined } : l
    return { ...l, startS: propias[0].startS, palabras: propias }
  })
}

/** El texto plano de unas líneas (para llenar el editor). */
export function textoDeLineas(lineas: LineaLrc[]): string {
  return lineas.map((l) => l.texto).join('\n')
}

/** ¿cuánto se parecen dos frases? (0–1) — bolsas de palabras. */
function parecido(a: string, b: string): number {
  const A = new Set(normalizar(a).split(' '))
  const B = new Set(normalizar(b).split(' '))
  if (!A.size || !B.size) return 0
  let comunes = 0
  for (const p of A) if (B.has(p)) comunes++
  return comunes / (A.size + B.size - comunes)
}

/** Alinea una letra EDITADA con los tiempos de la original:
 *   · línea idéntica (o con typos) → hereda el tiempo (y las
 *     palabras con sus tiempos, si el texto coincide)
 *   · línea nueva → tiempo interpolado entre las vecinas
 *   · siempre sale en orden, sin tiempos repetidos
 * Con esto Rudy puede editar la letra del video sin romper la
 * sincronía.
 * 🩹 v0.23.1 — cada original tiene DOS caras: la cruda (con sus
 * marcas) y la LIMPIA (sin ellas, palabras incluidas). Si Rudy
 * editó desde «solo la letra» (el editor se llena sin marcas),
 * sus líneas casan con la cara limpia y heredan las palabras ya
 * limpias; si editó con las marcas a la vista, casan con la
 * cruda. Antes la edición sin marcas no encontraba a las cortas
 * («(Coro) Hoy» vs «Hoy») y perdían la sincronía. */
export function alinearLetraEditada(originales: LineaLrc[], texto: string): LineaLrc[] {
  const crudas = texto
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
  if (!crudas.length) return []

  const pares = originales.map((l) => {
    const [limpia] = filtrarMarcasEstructura([l], true)
    return { cruda: l, limpia: limpia ?? null, usado: false }
  })
  const resultado: (LineaLrc | null)[] = crudas.map(() => null)

  const usar = (i: number, fuente: LineaLrc, conPalabras: boolean): void => {
    resultado[i] = {
      texto: crudas[i],
      startS: fuente.startS,
      ...(conPalabras && fuente.palabras ? { palabras: fuente.palabras } : {}),
    }
  }

  // 1) match exacto contra la cara LIMPIA (ignora MAYÚSCULAS,
  // acentos y espacios de más) — es el caso «edité sin marcas»
  crudas.forEach((t, i) => {
    const n = normalizar(t)
    const hit = pares.find((o) => !o.usado && o.limpia && normalizar(o.limpia.texto) === n)
    if (hit?.limpia) {
      hit.usado = true
      usar(i, hit.limpia, true)
    }
  })
  // 2) match exacto contra la cara CRUDA (editó con marcas visibles)
  crudas.forEach((t, i) => {
    if (resultado[i]) return
    const n = normalizar(t)
    const hit = pares.find((o) => !o.usado && normalizar(o.cruda.texto) === n)
    if (hit) {
      hit.usado = true
      usar(i, hit.cruda, true)
    }
  })
  // 3) parecidos (typos, palabras de más) — primero la limpia,
  // después la cruda; en orden, primera libre
  crudas.forEach((t, i) => {
    if (resultado[i]) return
    const hit = pares.find((o) => !o.usado && o.limpia && parecido(t, o.limpia.texto) >= 0.6)
    if (hit?.limpia) {
      hit.usado = true
      usar(i, hit.limpia, false)
    }
  })
  crudas.forEach((t, i) => {
    if (resultado[i]) return
    const hit = pares.find((o) => !o.usado && parecido(t, o.cruda.texto) >= 0.6)
    if (hit) {
      hit.usado = true
      usar(i, hit.cruda, false)
    }
  })

  // 4) las nuevas: tiempo interpolado entre las vecinas con tiempo
  const tiempos = resultado.map((r) => (r ? r.startS : null))
  resultado.forEach((r, i) => {
    if (r) return
    // vecino anterior con tiempo (o con tiempo asignado ya)
    let prev: number | null = null
    for (let j = i - 1; j >= 0; j--)
      if (tiempos[j] !== null) {
        prev = tiempos[j]
        break
      }
    let next: number | null = null
    for (let j = i + 1; j < resultado.length; j++)
      if (tiempos[j] !== null) {
        next = tiempos[j]
        break
      }
    // ¿cuántas seguidas sin tiempo hay entre esas dos anclas?
    let hueco = 0
    for (let j = i; j < resultado.length && tiempos[j] === null; j++) hueco++
    let t: number
    if (prev !== null && next !== null) {
      const paso = (next - prev) / (hueco + 1)
      t = prev + paso
    } else if (prev !== null) {
      t = prev + 2.5
    } else if (next !== null) {
      t = Math.max(0, next - 2.5)
    } else {
      t = i * 3 + 1 // sin originales: repartido parejo
    }
    tiempos[i] = t
    resultado[i] = { texto: crudas[i], startS: t }
  })

  // 5) monotonía: nada de tiempos hacia atrás (por las dudas)
  let anterior = -1
  for (const r of resultado) {
    if (!r) continue
    if (r.startS <= anterior) r.startS = anterior + 0.4
    anterior = r.startS
  }
  return resultado as LineaLrc[]
}
