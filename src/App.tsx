import { useEffect, useState } from 'react'
import { TemaProvider } from '@/core/theme/TemaProvider'
import { AuthProvider } from '@/core/auth/useAuth'
import { ToastProvider } from '@/components/ui/Toast'
import { Header } from '@/components/layout/Header'
import { BottomNav } from '@/components/layout/BottomNav'
import { DashboardView } from '@/views/DashboardView'
import { Modulo1View } from '@/views/Modulo1View'
import { Modulo2View } from '@/views/Modulo2View'
import { AjustesView } from '@/views/AjustesView'
import { arranqueNativo } from '@/core/natives/plataforma'
import { pedirPermisoNotificaciones } from '@/core/notificaciones/notificaciones'
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
          <Contenido />
        </ToastProvider>
      </AuthProvider>
    </TemaProvider>
  )
}

function Contenido() {
  const [pestanna, setPestanna] = useState<PestannaId>('inicio')

  useEffect(() => {
    arranqueNativo()
    pedirPermisoNotificaciones()
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-5">
        {pestanna === 'inicio' && <DashboardView irA={setPestanna} />}
        {pestanna === 'modulo1' && <Modulo1View />}
        {pestanna === 'modulo2' && <Modulo2View irA={setPestanna} />}
        {pestanna === 'ajustes' && <AjustesView />}
      </main>
      <BottomNav activa={pestanna} alCambiar={setPestanna} />
    </div>
  )
}
