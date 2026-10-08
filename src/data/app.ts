// ═══════════════════════════════════════════════════════════
// 🧱 IDENTIDAD DE LA APP — única fuente de verdad.
//
// `npm run fork -- "PetTrack" com.pettrack.app "#22c55e" 3310`
// reescribe este archivo (y los configs) — ver scripts/fork.mjs.
//
// prefijoClaves: TODAS las claves de localStorage llevan este
// prefijo (`${prefijo}_ajustes`, `${prefijo}_notas`…). Así el
// respaldo, la sync en la nube y la migración entre versiones
// quedan aisladas por app (patrón wallettrack_* de WalletTrack).
// ═══════════════════════════════════════════════════════════

export interface IdentidadApp {
  nombre: string
  id: string
  version: string
  prefijoClaves: string
  acento: string
  descripcion: string
}

export const APP: IdentidadApp = {
  nombre: 'TrackStack',
  id: 'com.trackstack.app',
  version: '1.0.0',
  prefijoClaves: 'trackstack',
  acento: '#22c55e',
  descripcion: 'Esqueleto modular para apps de la familia Track — React 19 + Vite 6 + Tailwind 4 + Capacitor 6.',
}
