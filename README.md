# 🧱 TrackStack

**El esqueleto de la familia Track** — cualquier app futura nace de acá: base modular, CI con APK firmado, temas, sesión, sync, IA y notificaciones ya resueltas. De las apps que ya andan (RiderTrack · WalletTrack · FitTrack · PlantTrack) para todas las que vienen.

## 🤔 ¿Qué es?

TrackStack es un **template repository**: cada app nueva empieza como copia limpia de este repo, con el 60% del trabajo ya hecho. Nació de comparar archivo por archivo las 4 apps v2 y extraer el ADN común:

| Heredado de | Qué trae |
|-------------|----------|
| 🛡️ RiderTrack v2 | Arquitectura modular, orquestador de pestañas, arranque nativo, temas, CI de APK firmado |
| 🪙 WalletTrack v2 | Almacenamiento con prefijo, respaldo JSON versionado, sync en la nube con merge sin borrar |
| 💪 FitTrack v2 | Patrón BYO-token de IA (Claude directo desde el cliente, sin backend) |
| 🌿 PlantTrack v2 | Visión IA (foto → análisis), estructura limpia de 5 carpetas |

## 📱 ¿Qué incluye?

| Módulo | Dónde | Qué hace |
|--------|-------|----------|
| 🎨 Temas | `src/core/theme/` | Oscuro (default) / claro / auto, persistido, con meta theme-color |
| 👤 Sesión | `src/core/auth/` | Google (web popup + nativo Android), modo local si no hay Firebase |
| 💾 Almacenamiento | `src/core/storage/` | localStorage con prefijo por app + respaldo JSON exportable/importable |
| ☁️ Sync | `src/core/sync/` | Documento `{prefijo}_sync/{uid}` en Firestore, merge sin borrar |
| 🤖 IA | `src/core/ai/` | Claude BYO-token: chat y visión (foto → texto) |
| 🔔 Notificaciones | `src/core/notificaciones/` | Locales, con permiso Android 13+ |
| 📱 Nativos | `src/core/natives/` | Cámara, vibración, share, splash, status bar — todo web-safe |
| 🎛️ UI | `src/components/` | Botón, Modal, KPI, Toast, EmptyState, Header, BottomNav |
| 📋 Vistas ejemplo | `src/views/` | Dashboard, CRUD local (Módulo 1), chat IA (Módulo 2), Ajustes completo |

## 🚀 Crear tu próxima app (5 pasos)

```bash
# 1. En GitHub: botón verde "Code" → "Use this template" → nombre del repo nuevo

# 2. Clonar y bautizar (renombla TODO: appId, paquete, acento, CI…)
npm install
npm run fork -- "PetTrack" com.pettrack.app "#22c55e" 3310

# 3. Commitear el nacimiento
git add -A && git commit -m "🎉 nace PetTrack" && git push

# 4. ONE TIME: Actions → "Generate Keystore & Secrets" → Run workflow
#    → copiá el base64 al secret KEYSTORE_BASE64 (y guardalo en un lugar seguro!)

# 5. Push a main → APK firmado en Actions → TrackStack-APK 🎉
```

Desde el celular el flujo es igual: "Use this template" desde la web de GitHub, editás con tu editor de código móvil (o pedís cambios por acá), y el APK lo arma la CI.

## 📁 Estructura

```
src/
├── App.tsx              # Orquestador: providers + pestañas + arranque nativo
├── main.tsx             # Entrada
├── types.ts             # Tipos compartidos
├── data/app.ts          # 🧱 IDENTIDAD: nombre, appId, prefijo, acento (fork.mjs edita acá)
├── core/                # EL NÚCLEO — no hace falta tocarlo casi nunca
│   ├── theme/           #   TemaProvider + useTema
│   ├── auth/            #   AuthProvider + useAuth
│   ├── storage/         #   almacenamiento (leer/guardar/respaldo)
│   ├── sync/            #   respaldo/restauración en Firestore
│   ├── ai/              #   claude.ts (chat + visión)
│   ├── notificaciones/  #   notificaciones locales
│   └── natives/         #   cámara, vibrar, share, splash…
├── components/
│   ├── ui/              #   Boton, Modal, KPI, Toast, EmptyState
│   └── layout/          #   Header, BottomNav
├── views/               # Dashboard + Módulo 1 + Módulo 2 + Ajustes
└── services/firebase.ts # ☁️ Claves de TU proyecto Firebase (placeholder)
```

## 🧱 Stack técnico

- **React 19 + TypeScript + Vite 6**
- **Tailwind CSS 4** + Lucide (íconos)
- **Capacitor 6** — la web se empaqueta como APK Android
- **Firebase** — Auth (Google) + Firestore (sync) — *opcional: sin claves funciona 100% local*
- **Claude API (Anthropic)** — BYO-token: cada usuario pone su clave

## 💻 Desarrollo local

```bash
npm install
npm run dev      # http://localhost:3300
npm run lint     # tsc --noEmit
npm run build    # vite build → dist/
npm run fork -- "Nombre" com.nombre.app "#color" puerto   # bautizar app nueva
```

## 🔄 CI (GitHub Actions)

Cada push a `main` dispara `build-apk.yml`:

1. `npm install` + `npm run build` (la web)
2. `cap add android` (el proyecto Android no se commitea — se genera fresco)
3. APK Release firmado con el keystore (secret `KEYSTORE_BASE64`) → artifact **TrackStack-APK**
4. Build web publicado en `docs/` → GitHub Pages (probá la app desde el navegador)

**Secrets a configurar** (Settings → Secrets and variables → Actions):

| Secret | Qué es | Necesario para |
|--------|--------|----------------|
| `KEYSTORE_BASE64` | Base64 del keystore (lo da `generate-keystore.yml`) | Que el APK actualice sobre el instalado |
| `GOOGLE_SERVICES_JSON` | Base64 del google-services.json de Firebase | Login Google nativo + Firestore en Android |

> ⚠️ Sin `KEYSTORE_BASE64` la CI genera un keystore temporario por build (sirve para probar, pero cada APK es "de otra app"). Sin `GOOGLE_SERVICES_JSON` la app anda en modo local.

## ☁️ Firebase (opcional pero recomendado)

1. Creá/Usá tu proyecto en [console.firebase.google.com](https://console.firebase.google.com)
2. Web app → copiá las claves a `src/services/firebase.ts`
3. Android app con el package name de TU app (post-fork) → bajá `google-services.json` → base64 → secret `GOOGLE_SERVICES_JSON`
4. Authentication → habilitá Google (y agregá el SHA-1 del keystore que te muestra `generate-keystore.yml`)
5. Firestore → reglas de `({prefijo}_sync/{uid})`: solo el dueño lee/escribe

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trackstack_sync/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

*(reemplazá `trackstack` por el prefijo de tu app post-fork)*

## 🗺️ Hoja de ruta del template

| Fase | Estado | Contenido |
|------|--------|-----------|
| F1 | ✅ | Base modular: App orquestador, BottomNav 4 pestañas, Header, Toasts, temas |
| F2 | ✅ | Core: almacenamiento con prefijo, respaldo JSON, useAuth (Google + local), sync con merge |
| F3 | ✅ | Nativos + CI: cámara, haptics, notificaciones, share, splash + workflow APK firmado + Pages |
| F4 | ✅ | IA: claude.ts BYO-token (chat + visión) + vista Ajustes completa |
| F5 | ✅ | fork.mjs + README (bautizar apps en un comando) |
| F6 | 🔜 | Ideas: biometría (@capgo/capacitor-native-biometric), export Excel (exceljs), widget de escritorio, más vistas ejemplo |

## 🧱 Familia Track

- 🛡️ [RiderTrack v2](https://github.com/RiderTrack/ridertrack-v2) — gestión para riders
- 🪙 [WalletTrack v2](https://github.com/RiderTrack/wallettrack-v2) — finanzas personales
- 💪 [FitTrack v2](https://github.com/RiderTrack/fittrack-v2) — entrenamiento + salud
- 🌿 [PlantTrack v2](https://github.com/RiderTrack/planttrack-v2) — jardín con IA

---

*TrackStack — porque la próxima app debería empezar en el 60%, no en cero.*
