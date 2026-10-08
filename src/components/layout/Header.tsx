import { LogIn, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { APP } from '@/data/app'
import { useTema } from '@/core/theme/TemaProvider'
import { useAuth } from '@/core/auth/useAuth'
import { useToast } from '@/components/ui/Toast'
import { Boton } from '@/components/ui/Boton'
import { vibrar } from '@/core/natives/plataforma'

// ═══════════════════════════════════════════════════════════
// 🔝 HEADER — identidad + tema + sesión. Sticky con blur.
// ═══════════════════════════════════════════════════════════

export function Header() {
  const { tema, fijarTema } = useTema()
  const { sesion, loginGoogle, salir } = useAuth()
  const { mostrar } = useToast()

  function cambiarTema() {
    vibrar()
    const orden = ['oscuro', 'claro', 'auto'] as const
    const siguiente = orden[(orden.indexOf(tema) + 1) % orden.length]
    fijarTema(siguiente)
    mostrar(`Tema: ${siguiente}`, 'info', 1400)
  }

  async function manejarSesion() {
    vibrar()
    try {
      if (sesion) {
        await salir()
        mostrar('Sesión cerrada', 'ok')
      } else {
        await loginGoogle()
        mostrar('¡Bienvenido!', 'ok')
      }
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'No se pudo iniciar sesión', 'error', 4000)
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 pt-seguro backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-acento text-lg font-black text-black">
            {APP.nombre.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight text-neutral-900 dark:text-white">
              {APP.nombre}
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">v{APP.version}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={cambiarTema}
            aria-label="Cambiar tema"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {tema === 'oscuro' ? (
              <Moon className="h-5 w-5" />
            ) : tema === 'claro' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Monitor className="h-5 w-5" />
            )}
          </button>

          {sesion ? (
            <button
              onClick={manejarSesion}
              aria-label="Cerrar sesión"
              title={`Salir de ${sesion.nombre}`}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {sesion.foto ? (
                <img src={sesion.foto} alt={sesion.nombre} referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
              ) : (
                <LogOut className="h-5 w-5" />
              )}
            </button>
          ) : (
            <Boton variante="secundario" tamano="sm" icono={<LogIn className="h-4 w-4" />} onClick={manejarSesion}>
              Ingresar
            </Boton>
          )}
        </div>
      </div>
    </header>
  )
}
