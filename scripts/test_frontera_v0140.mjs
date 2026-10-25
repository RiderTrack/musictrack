// ═══════════════════════════════════════════════════════════
// 🧪 v0.14.0 — Test de la FRONTERA DE SUNO con el código REAL:
// compila suno.ts y types.ts con esbuild (sin copias que se
// atrasan) y verifica el diccionario de traducción completo.
// Corré: node scripts/test_frontera_v0140.mjs
// ═══════════════════════════════════════════════════════════
import { execSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const raiz = path.dirname(fileURLToPath(import.meta.url))
const tmp = path.join(raiz, '.tmp-frontera')
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })

// suno.ts y types.ts son archivos puros (sin imports externos):
// se compilan con el MISMO esbuild de vite y se importan directo.
for (const [origen, destino] of [
  ['../src/core/ai/suno.ts', 'suno.compilado.mjs'],
  ['../src/types.ts', 'types.compilado.mjs'],
]) {
  execSync(
    `node_modules/.bin/esbuild ${path.join(raiz, origen)} --bundle --format=esm --outfile=${path.join(tmp, destino)}`,
    { stdio: 'inherit', cwd: path.join(raiz, '..') },
  )
}

const { estiloParaSuno, letraParaSuno } = await import(path.join(tmp, 'suno.compilado.mjs'))
const { FAMILIAS_RECETAS, estiloConInspiracion, LIMITE_ESTILO_SUNO } = await import(
  path.join(tmp, 'types.compilado.mjs')
).then(async (m) => {
  // LIMITE_ESTILO_SUNO vive en suno.ts — types no lo tiene
  const { LIMITE_ESTILO_SUNO: limite } = await import(path.join(tmp, 'suno.compilado.mjs'))
  return { ...m, LIMITE_ESTILO_SUNO: limite }
})

let fallos = 0
let pruebas = 0
function ok(cond, mensaje) {
  pruebas++
  if (!cond) {
    fallos++
    console.error(`  ✗ ${mensaje}`)
  }
}

console.log('═'.repeat(64))
console.log('1) Voces (regresión v0.11.2/0.11.3 — no se rompió nada)')
console.log('═'.repeat(64))
ok(estiloParaSuno('voz femenina') === 'female vocals, solo female singer', 'voz femenina → female vocals + refuerzo')
ok(estiloParaSuno('voz masculina') === 'male vocals, solo male singer', 'voz masculina → male vocals + refuerzo')
ok(
  estiloParaSuno('rock, dúo de voces').includes('male and female duet vocals') &&
    !estiloParaSuno('rock, dúo de voces').includes('solo '),
  'dúo NO lleva refuerzo «solo»'
)
ok(
  estiloParaSuno('balada anime, piano, voz femenina, emocional, 70 bpm') ===
    'anime ballad, piano, female vocals, emotional, 70 bpm, solo female singer',
  'balada anime + voz femenina + emocional traducidos y refuerzo al final'
)
ok(
  estiloParaSuno('metal sinfónico, orquestal, cuerdas, coros, voz femenina, épica, 128 bpm') ===
    'symphonic metal, orchestral, strings, backing vocals, female vocals, epic, 128 bpm, solo female singer',
  'metal sinfónico: todo el combo traducido'
)

console.log('═'.repeat(64))
console.log('2) El diccionario completo — cumbia, funk, retro y más')
console.log('═'.repeat(64))
const casos = [
  [
    'cumbia peruana, orquesta, trompetas, saxofón, tumbadoras, timbales, güiro, romántica, 100 bpm',
    'peruvian cumbia, orchestra, trumpets, saxophone, congas, timbales, guiro, romantic, 100 bpm',
    'receta Cumbia · Orquesta clásica',
  ],
  [
    'cumbia peruana, orquesta, trompetas, timbales, güiro, coros respondones, festiva, 100 bpm',
    'peruvian cumbia, orchestra, trumpets, timbales, guiro, call and response vocals, festive, 100 bpm',
    'receta Cumbia · Con coros',
  ],
  [
    'chicha, guitarra eléctrica, órgano, timbales, bongó, psicodélica, nostálgica, 100 bpm',
    'peruvian chicha, electric guitar, organ, timbales, bongos, psychedelic, nostalgic, 100 bpm',
    'receta Cumbia · Chicha amazónica',
  ],
  [
    'salsa, trompetas, trombón, piano, tumbadoras, timbales, bongó, contrabajo, enérgica, 100 bpm',
    'salsa, trumpets, trombone, piano, congas, timbales, bongos, double bass, energetic, 100 bpm',
    'receta Salsa dura',
  ],
  [
    'funk, bajo slap, guitarra eléctrica, clavinet, palmadas, sección de metales, 100 bpm',
    'funk, slap bass, electric guitar, clavinet, claps, horn section, 100 bpm',
    'receta Funk',
  ],
  [
    'synth pop, pop, sintetizadores, caja de ritmos, coros, brillante, 128 bpm',
    'synth pop, pop, synthesizers, drum machine, backing vocals, bright, 128 bpm',
    'receta Pop ochentero',
  ],
  [
    'arena rock, hard rock, guitarras distorsionadas, sintetizadores, solo de guitarra, coros, épica, 128 bpm',
    'arena rock, hard rock, distorted guitars, synthesizers, guitar solo, backing vocals, epic, 128 bpm',
    'receta Rock 80s',
  ],
  [
    'boom bap, hip-hop, bajo, batería, jazz, nostálgica, 90 bpm',
    'boom bap, hip-hop, bass, drums, jazz, nostalgic, 90 bpm',
    'receta Hip-hop 90s',
  ],
  [
    'balada, piano, guitarra eléctrica, coros, dramática, 70 bpm',
    'ballad, piano, electric guitar, backing vocals, dramatic, 70 bpm',
    'receta Power ballad',
  ],
  [
    'balada romántica, piano, cuerdas',
    'romantic ballad, piano, strings',
    'la vieja receta de la biblioteca (regresión)',
  ],
  [
    'cumbia peruana romántica, orquesta, trompetas, saxo, tumbadoras',
    'peruvian cumbia romantic, orchestra, trumpets, saxophone, congas',
    'estilo VIEJO de la biblioteca (saxo sin acento también)',
  ],
]
for (const [entrada, esperado, nombre] of casos) {
  ok(estiloParaSuno(entrada) === esperado, `${nombre}\n      entró:  ${entrada}\n      salió:  ${estiloParaSuno(entrada)}\n      espero: ${esperado}`)
}

console.log('═'.repeat(64))
console.log('3) Las 56 recetas: viajan limpias y dentro del tope')
console.log('═'.repeat(64))
const sospechosos = [
  ' trompetas',
  'guitarras',
  'sintetizadores',
  'bajo profundo',
  'coros',
  'tumbadoras',
  'batería',
  'romántic',
  'enérgic',
  'nostálgic',
  'alegre',
  'tranquil',
  'oscur',
  'bajo slap',
  'caja de ritmos',
]
let total = 0
for (const familia of FAMILIAS_RECETAS) {
  for (const r of familia.recetas) {
    total++
    const traducido = estiloParaSuno(r.estilo)
    ok(
      traducido.length <= LIMITE_ESTILO_SUNO,
      `«${familia.titulo} · ${r.etiqueta}» cabe en 200 chars (${traducido.length})`
    )
    for (const s of sospechosos) {
      ok(
        !traducido.toLowerCase().includes(s.toLowerCase()),
        `«${familia.titulo} · ${r.etiqueta}» sin resto español «${s.trim()}» → ${traducido}`
      )
    }
  }
}
ok(total >= 50, `hay ${total} recetas (esperaba 50+)`)

console.log('═'.repeat(64))
console.log('4) Los retratos de artistas retro también viajan en inglés')
console.log('═'.repeat(64))
const inspiraciones = [
  ['Michael Jackson', 'pop with funk'],
  ['Bon Jovi', '80s'],
  ['Queen', 'layered choirs'],
  ['Pearl Jam', '90s'],
  ['Grupo 5', 'peruvian cumbia'],
  ['James Brown', 'horn section'],
  ['Earth Wind & Fire', 'horn section'],
]
for (const [artista, fragmento] of inspiraciones) {
  const { estilo } = estiloConInspiracion('pop', artista)
  ok(
    estiloParaSuno(estilo).toLowerCase().includes(fragmento.toLowerCase()),
    `esencia de ${artista} viaja con «${fragmento}» → ${estiloParaSuno(estilo)}`
  )
}
// la esencia no agrega refuerzos raros ni rompe el tope
const inspirada = estiloConInspiracion(
  'cumbia peruana, orquesta, trompetas, saxofón, tumbadoras, timbales, güiro, romántica, 100 bpm',
  'Grupo 5, Agua Marina'
)
ok(estiloParaSuno(inspirada.estilo).length <= LIMITE_ESTILO_SUNO, 'receta + esencia cabe en 200')
ok(
  !estiloParaSuno(inspirada.estilo).includes('singer'),
  'esencia de grupos (sin voz explícita) no agrega «solo singer»'
)

console.log('═'.repeat(64))
console.log('5) Metatags de la letra (regresión v0.11.3)')
console.log('═'.repeat(64))
ok(
  letraParaSuno('[Coro]\n[Voz mujer]\n[Verso 1]\n[Pre-Coro]\n[Puente]\n[Solo de guitarra]\n[Final]') ===
    '[Chorus]\n[Female Vocals]\n[Verse 1]\n[Pre-Chorus]\n[Bridge]\n[Guitar Solo]\n[Outro]',
  'metatags siguen traduciéndose'
)

console.log('═'.repeat(64))
if (fallos === 0) {
  console.log(`✅ TODO OK — ${pruebas} aserciones pasaron`)
} else {
  console.error(`❌ ${fallos} de ${pruebas} aserciones fallaron`)
  process.exit(1)
}
