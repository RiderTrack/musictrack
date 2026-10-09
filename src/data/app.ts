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
  nombre: 'MusicTrack',
  id: 'com.ridertrack.musictrack',
  version: '0.3.0',
  prefijoClaves: 'musictrack',
  acento: '#a855f7',
  descripcion: 'Creación de música con IA: generá letras con Claude, escribí las tuyas y musicalizá con Suno — el motor doble.',
}
