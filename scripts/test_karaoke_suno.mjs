// Test del karaoke palabra por palabra (v0.13.0) — copia de las
// funciones puras de src/core/audio/mp3.ts (mismo patrón que
// test_estilo_suno.mjs / test_letra_suno.mjs). Corré: node scripts/test_karaoke_suno.mjs

// ── copia fiel de las funciones ──────────────────────────────
function palabrasDeLinea(linea) {
  return linea.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length
}

function lineasConTiempo(letra, palabras) {
  const out = []
  let idx = 0
  for (const linea of letra.split('\n')) {
    const cantables = palabrasDeLinea(linea)
    if (!cantables) continue
    const primera = palabras[idx]
    if (!primera) break
    const propias = palabras.slice(idx, idx + cantables).map((p) => ({ texto: p.palabra, startS: p.startS }))
    idx += cantables
    out.push({ texto: linea.trim(), startS: primera.startS, palabras: propias })
  }
  return out
}

function palabrasInterpoladas(texto, desdeS, hastaS) {
  const crudas = texto.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean)
  if (!crudas.length) return []
  const pesos = crudas.map((p) => Math.max(2, p.length))
  const total = pesos.reduce((a, b) => a + b, 0)
  let acum = 0
  return crudas.map((p, i) => {
    const startS = desdeS + (acum / total) * (hastaS - desdeS)
    acum += pesos[i]
    return { texto: p, startS }
  })
}

function estimarLineasConTiempo(letra, duracionSeg) {
  if (!duracionSeg || duracionSeg < 10) return []
  const lineas = letra.split('\n').map((l) => l.trim()).filter((l) => l && !/^\[[^\]]*\]$/.test(l))
  if (!lineas.length) return []
  const pesos = lineas.map((l) => Math.max(2, palabrasDeLinea(l)))
  const total = pesos.reduce((a, b) => a + b, 0)
  const intro = Math.min(12, duracionSeg * 0.08)
  const canto = Math.max(10, duracionSeg - intro - 4)
  let acum = 0
  const bases = lineas.map((texto, i) => {
    const startS = intro + (acum / total) * canto
    acum += pesos[i]
    return { texto, startS }
  })
  return bases.map((l, i) => {
    const fin = bases[i + 1]?.startS ?? l.startS + 4
    return { ...l, palabras: palabrasInterpoladas(l.texto, l.startS, fin) }
  })
}

// ── assertions ────────────────────────────────────────────────
let fallos = 0
function ok(cond, mensaje) {
  if (cond) console.log(`  ✔ ${mensaje}`)
  else {
    fallos++
    console.error(`  ✘ ${mensaje}`)
  }
}

console.log('1) lineasConTiempo — palabras reales viajan con cada línea')
{
  const letra = ['[Verso 1]', 'hola mundo cruel', '', '[Coro]', 'canta conmigo ya'].join('\n')
  const palabras = [
    { palabra: 'hola', startS: 12.1, endS: 12.5 },
    { palabra: 'mundo', startS: 12.5, endS: 13.0 },
    { palabra: 'cruel', startS: 13.0, endS: 13.6 },
    { palabra: 'canta', startS: 20.0, endS: 20.4 },
    { palabra: 'conmigo', startS: 20.4, endS: 21.0 },
    { palabra: 'ya', startS: 21.0, endS: 21.2 },
  ]
  const ls = lineasConTiempo(letra, palabras)
  ok(ls.length === 2, `2 líneas cantables (tags y vacías fuera) — hay ${ls.length}`)
  ok(ls[0].startS === 12.1 && ls[0].palabras.length === 3, 'línea 1 arranca en 12.1 con sus 3 palabras')
  ok(ls[1].startS === 20.0 && ls[1].palabras.length === 3, 'línea 2 arranca en 20.0 con sus 3 palabras')
  ok(ls[0].palabras[1].texto === 'mundo' && ls[0].palabras[1].startS === 12.5, 'la 2ª palabra de la línea 1 es «mundo» @12.5')
  ok(ls.every((l) => l.palabras.every((p, j) => j === 0 || l.palabras[j - 1].startS <= p.startS)), 'palabras de cada línea en orden temporal')
}

console.log('2) estimarLineasConTiempo — karaoke interpolado sin Suno')
{
  const letra = ['[Verso 1]', 'una línea corta', 'esta es una línea mucho más larga para pesar', '', '[Coro]', 'coro pegadizo'].join('\n')
  const ls = estimarLineasConTiempo(letra, 180)
  ok(ls.length === 3, `3 líneas con tiempo — hay ${ls.length}`)
  ok(ls.every((l) => Array.isArray(l.palabras) && l.palabras.length === palabrasDeLineaCopia(l.texto)), 'cada línea tiene TODAS sus palabras')
  for (const l of ls) {
    const enRango = l.palabras.every((p) => p.startS >= l.startS - 1e-9)
    ok(enRango, `«${l.texto.slice(0, 18)}…»: palabras desde el arranque de su línea`)
    const creciente = l.palabras.every((p, j) => j === 0 || l.palabras[j - 1].startS < p.startS)
    ok(creciente, `«${l.texto.slice(0, 18)}…»: palabras en orden creciente`)
  }
  const l0 = ls[0]
  const l1 = ls[1]
  ok(l1.startS > l0.startS, 'la línea 2 empieza después de la línea 1')
  ok(l0.palabras[l0.palabras.length - 1].startS <= l1.startS + 1e-9, 'la última palabra de la línea 1 no invade la línea 2')
  ok(ls[2].palabras.length === 2 && ls[2].palabras[0].texto === 'coro', 'el coro interpoló «coro pegadizo»')
}

console.log('3) bordes')
{
  ok(estimarLineasConTiempo('hola', undefined).length === 0, 'sin duración → []')
  ok(estimarLineasConTiempo('hola', 5).length === 0, 'duración < 10 s → []')
  const soloTags = estimarLineasConTiempo('[Coro]\n[Verso 1]', 100)
  ok(soloTags.length === 0, 'letra de puros tags → []')
  const ultima = estimarLineasConTiempo('una sola línea', 60)[0]
  ok(ultima.palabras.length === 3 && ultima.palabras[2].startS > ultima.palabras[0].startS, 'línea única: 3 palabras interpoladas en los 4 s finales')
}

function palabrasDeLineaCopia(linea) {
  return linea.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length
}

console.log(fallos === 0 ? '\nTODO OK ✅' : `\n${fallos} FALLOS ❌`)
process.exit(fallos === 0 ? 0 : 1)
