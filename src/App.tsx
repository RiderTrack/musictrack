import { useEffect, useState } from 'react'
import { TemaProvider } from '@/core/theme/TemaProvider'
import { AuthProvider } from '@/core/auth/useAuth'
import { ToastProvider } from '@/components/ui/Toast'
import { ReproductorProvider, useReproductor } from '@/core/audio/reproductor'
import { Header } from '@/components/layout/Header'
import { BottomNav } from '@/components/layout/BottomNav'
import { MiniReproductor } from '@/components/layout/MiniReproductor'
import { ReproductorCompleto } from '@/components/layout/ReproductorCompleto'
import { DashboardView } from '@/views/DashboardView'
import { LetrasView } from '@/views/LetrasView'
import { CrearView } from '@/views/CrearView'
import { MusicaView } from '@/views/MusicaView'
import { ReproductorView } from '@/views/ReproductorView'
import { BibliotecaView } from '@/views/BibliotecaView'
import { AjustesView } from '@/views/AjustesView'
import { arranqueNativo } from '@/core/natives/plataforma'
import { pedirPermisoNotificaciones } from '@/core/notificaciones/notificaciones'
import { iniciarSeguimientoSuno } from '@/core/ai/seguimiento'
import type { PestannaId } from '@/types'

// ═══════════════════════════════════════════════════════════
// 🧱 Orquestador — mismo patrón que tus apps v2:
// providers → pestañas + toasts + arranque nativo.
// Agregá vistas nuevas en src/views/ y registralas acá
// y en components/layout/BottomNav.tsx.
// ═══════════════════════════════════════════════════════════

export default function App() {
  return (
    <TemaProvider>
      <AuthProvider>
        <ToastProvider>
          {/* v0.10.0 — el reproductor ÚNICO vive acá: por encima de
              las pestañas, así la música no se corta al navegar. */}
          <ReproductorProvider>
            <Contenido />
          </ReproductorProvider>
        </ToastProvider>
      </AuthProvider>
    </TemaProvider>
  )
}

function Contenido() {
  const [pestanna, setPestanna] = useState<PestannaId>('inicio')
  const { actual } = useReproductor()

  useEffect(() => {
    arranqueNativo()
    pedirPermisoNotificaciones()
    iniciarSeguimientoSuno()
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Header />
      {/* con el mini-reproductor abierto, el contenido respira por
          arriba de la barra fija (nav 56px + reproductor ~72px) */}
      <main className={`mx-auto w-full max-w-2xl flex-1 px-4 pt-5 ${actual ? 'pb-44' : 'pb-28'}`}>
        {pestanna === 'inicio' && <DashboardView irA={setPestanna} />}
        {pestanna === 'letras' && <LetrasView irA={setPestanna} />}
        {pestanna === 'crear' && <CrearView irA={setPestanna} />}
        {pestanna === 'musica' && <MusicaView irA={setPestanna} />}
        {pestanna === 'reproductor' && <ReproductorView irA={setPestanna} />}
        {pestanna === 'biblioteca' && <BibliotecaView irA={setPestanna} />}
        {pestanna === 'ajustes' && <AjustesView />}
      </main>
      <MiniReproductor />
      {/* v0.11.0 — la pantalla grande tipo Spotify, encima de
          todo lo demás (se abre tocando la mini-barra) */}
      <ReproductorCompleto />
      <BottomNav activa={pestanna} alCambiar={setPestanna} />
    </div>
  )
}
