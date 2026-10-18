#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// 🧱 fork.mjs — TrackStack → TU nueva app en un comando
//
//   npm run fork -- "PetTrack" com.pettrack.app "#22c55e" 3310
//                   │            │             │       └─ puerto dev (opcional)
//                   │            │             └─ color de acento (opcional)
//                   │            └─ appId Android (requerido)
//                   └─ Nombre visible (requerido)
//
// Renombra TODO: identidad, appId, paquete, acento, puerto,
// workflows CI, README y el prefijo de localStorage (así los
// datos de cada app quedan aislados, patrón wallettrack_*).
// ═══════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [nombreArg, appIdArg, acentoArg, puertoArg] = process.argv.slice(2)

if (!nombreArg || !appIdArg) {
  console.error(`
Uso:  npm run fork -- "Nombre App" com.empresa.app ["#color"] [puerto]

Ejemplo:
  npm run fork -- "PetTrack" com.pettrack.app "#f59e0b" 3310
`)
  process.exit(1)
}

const nombre = nombreArg.trim()
const appId = appIdArg.trim().toLowerCase()
const acento = acentoArg?.trim() ?? '#3b82f6'
const puerto = puertoArg?.trim() ?? '3300'

if (!/^com\.[a-z0-9]+(\.[a-z0-9]+)+$/.test(appId)) {
  console.error(`❌ appId inválido: "${appId}" — formato esperado: com.empresa.app (solo minúsculas)`)
  process.exit(1)
}
if (!/^#[0-9a-fA-F]{6}$/.test(acento)) {
  console.error(`❌ Color inválido: "${acento}" — formato esperado: #22c55e`)
  process.exit(1)
}

const kebab = nombre
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
const prefijo = kebab.replace(/-/g, '')

const RAIZ = process.cwd()
const cambios = []

function editar(archivo, reemplazos) {
  const ruta = join(RAIZ, archivo)
  let contenido
  try {
    contenido = readFileSync(ruta, 'utf8')
  } catch {
    console.warn(`⚠️  ${archivo} no existe — saltando`)
    return
  }
  const original = contenido
  for (const [buscar, reemplazo] of reemplazos) {
    contenido = contenido.replaceAll(buscar, reemplazo)
  }
  if (contenido !== original) {
    writeFileSync(ruta, contenido)
    cambios.push(archivo)
  }
}

// 1️⃣ Identidad — única fuente de verdad
editar('src/data/app.ts', [
  ["nombre: 'TrackStack'", `nombre: '${nombre}'`],
  ["id: 'com.trackstack.app'", `id: '${appId}'`],
  ["version: '1.0.0'", `version: '1.0.0'`],
  ["prefijoClaves: 'trackstack'", `prefijoClaves: '${prefijo}'`],
  ["acento: '#22c55e'", `acento: '${acento}'`],
])

// 2️⃣ package.json — nombre del paquete + puerto de dev
editar('package.json', [
  ['"name": "trackstack"', `"name": "${kebab}"`],
  ['--port=3300', `--port=${puerto}`],
])

// 3️⃣ Capacitor — appId + nombre visible
editar('capacitor.config.json', [
  ['com.trackstack.app', appId],
  ['"appName": "TrackStack"', `"appName": "${nombre}"`],
])

// 4️⃣ index.html — título + descripción + color del navegador
editar('index.html', [
  ['<title>TrackStack 🧱</title>', `<title>${nombre}</title>`],
  ['TrackStack — el esqueleto modular de la familia Track: React 19 + Vite 6 + Tailwind 4 + Capacitor 6 + Firebase + IA.', `${nombre} — hecha con TrackStack.`],
  ['content="#0a0a0a"', `content="${acento}"`],
])

// 5️⃣ Acento del tema (lo usan todos los componentes vía bg-acento)
editar('src/index.css', [
  ['--ts-acento: #22c55e', `--ts-acento: ${acento}`],
])

// 6️⃣ CI — workflows, artefactos, strings del APK, alias del keystore
editar('.github/workflows/build-apk.yml', [
  ['TrackStack', nombre],
  ['com.trackstack.app', appId],
  ['trackstack123', `${prefijo}123`],
  ['alias trackstack', `alias ${prefijo}`],
  ['CN=TrackStack', `CN=${nombre}`],
  ['- alias trackstack', `- alias ${prefijo}`],
])
editar('.github/workflows/generate-keystore.yml', [
  ['TrackStack', nombre],
  ['trackstack123', `${prefijo}123`],
  ['alias trackstack', `alias ${prefijo}`],
  ['CN=TrackStack', `CN=${nombre}`],
])

// 7️⃣ README — título principal (el resto personalizalo a mano)
editar('README.md', [['# 🧱 TrackStack', `# ${nombre}`]])

console.log(`
✅  ${nombre} está listo — ${cambios.length} archivos actualizados:
${cambios.map((c) => `   · ${c}`).join('\n')}

Identidad generada:
   · appId:        ${appId}
   · paquete npm:  ${kebab}
   · prefijo:      ${prefijo}_ (claves de localStorage)
   · acento:       ${acento}
   · puerto dev:   ${puerto}

Próximos pasos:
   1. git add -A && git commit -m "🎉 nace ${nombre}"
   2. Personalizá el README y las vistas (src/views/)
   3. Actions → "Generate Keystore & Secrets" → copiá el base64
      al secret KEYSTORE_BASE64 (una sola vez, guardalo bien)
   4. Push a main → el APK firmado sale solo en Actions 🚀
`)
