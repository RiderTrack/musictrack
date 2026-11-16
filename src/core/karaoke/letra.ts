import type { LineaLrc } from '@/core/audio/mp3'

// ═══════════════════════════════════════════════════════════
// ✏️ v0.23.0 — LETRA DEL VIDEO KARAOKE (pedido de Rudy):
// «yo escribo mis canciones con (Coro), (Verso 1), (Outro)…
// y esas marcas se plasmaban en el videoclip». Acá viven las
// dos herramientas para que el video muestre SOLO lo que se
// canta:
//   1. FILTRO DE MARCAS — las líneas que son pura marca de
//      estructura se esconden, y las que arrancan con una marca
//      «(Coro) Bailamos…» quedan «Bailamos…». La letra guardada
//      de la canción NUNCA se toca: el filtro es solo para el
//      dibujo del video.
//   2. ALINEACIÓN DE LA LETRA EDITADA — si Rudy edita la letra
//      del video (saca líneas, corrige typos, agrega otras),
//      cada línea editada hereda el tiempo de su original; las
//      nuevas se interpolan entre las vecinas.
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
  // «Coro:» → «Coro»
  t = t.replace(/[\s:：,;·|—-]+$/u, '').trim()
  // «coro x2» / «coro (x2)» → «coro»
  t = t.replace(/[([]?\s*x\s*\d+\s*[)\]]?$/i, '').trim()
  const n = normalizar(t)
  if (!n) return envuelta // «()» o «(x2)» sueltos: también escondemos
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
  const parentesis = texto.match(/^\s*[(\[]([^)\]]{1,30})[)\]]\s*/)
  if (parentesis && esMarcaEstructura(`(${parentesis[1].trim()})`)) {
    return texto
      .slice(parentesis[0].length)
      .replace(/^\s*[|·»-]\s*/, '')
      .trim()
  }
  const conDospuntos = texto.match(/^\s*([^:：]{2,30})[:：]\s+(.*)$/s)
  if (conDospuntos && esMarcaEstructura(conDospuntos[1].trim())) {
    return conDospuntos[2].trim()
  }
  return texto.trim()
}

/** La letra lista para el video: sin líneas-marca y sin marcas al
 * inicio de las mixtas. Los tiempos van intactos (cada línea
 * conserva el suyo; las escondidas no molestan). */
export function filtrarMarcasEstructura(lineas: LineaLrc[], quitarPrefijos = true): LineaLrc[] {
  const listas: LineaLrc[] = []
  for (const l of lineas) {
    if (esMarcaEstructura(l.texto)) continue
    const texto = quitarPrefijos ? quitarMarcaAlInicio(l.texto) : l.texto.trim()
    if (!texto) continue
    listas.push(texto === l.texto ? l : { ...l, texto })
  }
  return listas
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
 * sincronía. */
export function alinearLetraEditada(originales: LineaLrc[], texto: string): LineaLrc[] {
  const crudas = texto
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
  if (!crudas.length) return []

  const libres = originales.map((l) => ({ l, usado: false }))
  const resultado: (LineaLrc | null)[] = crudas.map(() => null)

  // 1) match exacto (ignora MAYÚSCULAS, acentos y espacios de más)
  crudas.forEach((t, i) => {
    const n = normalizar(t)
    const hit = libres.find((o) => !o.usado && normalizar(o.l.texto) === n)
    if (hit) {
      hit.usado = true
      resultado[i] = { texto: t, startS: hit.l.startS, ...(hit.l.palabras ? { palabras: hit.l.palabras } : {}) }
    }
  })

  // 2) parecidos (typos, palabras de más) — en orden, primera libre
  crudas.forEach((t, i) => {
    if (resultado[i]) return
    const hit = libres.find((o) => !o.usado && parecido(t, o.l.texto) >= 0.6)
    if (hit) {
      hit.usado = true
      resultado[i] = { texto: t, startS: hit.l.startS }
    }
  })

  // 3) las nuevas: tiempo interpolado entre las vecinas con tiempo
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

  // 4) monotonía: nada de tiempos hacia atrás (por las dudas)
  let anterior = -1
  for (const r of resultado) {
    if (!r) continue
    if (r.startS <= anterior) r.startS = anterior + 0.4
    anterior = r.startS
  }
  return resultado as LineaLrc[]
}
