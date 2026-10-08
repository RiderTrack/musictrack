import { useRef, useState } from 'react'
import { Bot, Cloud, Database, Eye, EyeOff, Info, KeyRound, LogIn, LogOut, Palette, RotateCcw, Upload, User } from 'lucide-react'
import { APP } from '@/data/app'
import { leer, guardar, descargarRespaldo, importarRespaldo, contarClaves } from '@/core/storage/almacenamiento'
import { respaldarNube, restaurarNube } from '@/core/sync/sync'
import { preguntarIA } from '@/core/ai/claude'
import { useTema } from '@/core/theme/TemaProvider'
import { useAuth } from '@/core/auth/useAuth'
import { useToast } from '@/components/ui/Toast'
import { Boton } from '@/components/ui/Boton'
import { firebaseConfigurado } from '@/services/firebase'
import { plataformaActual, vibrar } from '@/core/natives/plataforma'
import { AJUSTES_POR_DEFECTO, type Ajustes, type Tema } from '@/types'

// ═══════════════════════════════════════════════════════════
// ⚙️ AJUSTES — el panel de control del esqueleto:
// IA (BYO token) · tema · respaldo/import · sync nube · sesión.
// Todo lo que un usuario necesita para configurar TU app antes
// de usarla. Añadile tus propias secciones al final.
// ═══════════════════════════════════════════════════════════

export function AjustesView() {
  const { mostrar } = useToast()
  const { tema, fijarTema } = useTema()
  const { sesion, loginGoogle, salir } = useAuth()
  const [ajustes, setAjustes] = useState<Ajustes>(() => leer('ajustes', AJUSTES_POR_DEFECTO))
  const [verToken, setVerToken] = useState(false)
  const [probandoIA, setProbandoIA] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)

  function actualizar(parcial: Partial<Ajustes>) {
    const nuevos = { ...ajustes, ...parcial }
    setAjustes(nuevos)
    guardar('ajustes', nuevos)
  }

  async function probarIA() {
    if (!ajustes.tokenIA) {
      mostrar('Pegá tu token primero', 'info')
      return
    }
    vibrar()
    setProbandoIA(true)
    try {
      await preguntarIA({
        token: ajustes.tokenIA,
        modelo: ajustes.modeloIA,
        mensajes: [{ rol: 'usuario', texto: 'Respondé únicamente: listo' }],
        maxTokens: 16,
      })
      mostrar('¡IA conectada! 🎉', 'ok')
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló la conexión', 'error', 4500)
    } finally {
      setProbandoIA(false)
    }
  }

  async function importar(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    if (!archivo) return
    setSincronizando(true)
    try {
      const n = await importarRespaldo(archivo)
      mostrar(`${n} claves importadas — recargando…`, 'ok', 1600)
      window.setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Archivo inválido', 'error', 4000)
      setSincronizando(false)
    }
    evento.target.value = ''
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

  async function syncNube(accion: 'respaldar' | 'restaurar') {
    if (!sesion) return
    vibrar()
    setSincronizando(true)
    try {
      if (accion === 'respaldar') {
        const n = await respaldarNube(sesion.uid)
        mostrar(`${n} claves subidas a la nube`, 'ok')
      } else {
        const n = await restaurarNube(sesion.uid)
        mostrar(n ? `${n} claves traídas de la nube` : 'La nube no tenía datos', 'info')
      }
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló la sync', 'error', 4000)
    } finally {
      setSincronizando(false)
    }
  }

  const Temas: Array<{ id: Tema; etiqueta: string }> = [
    { id: 'oscuro', etiqueta: '🌙 Oscuro' },
    { id: 'claro', etiqueta: '☀️ Claro' },
    { id: 'auto', etiqueta: '🔄 Auto' },
  ]

  return (
    <div className="space-y-4">
      {/* ── IA ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Bot className="h-4 w-4" /> Inteligencia Artificial
        </h2>
        <label className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          Token de Claude (Anthropic) — queda SOLO en tu dispositivo
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={verToken ? 'text' : 'password'}
              value={ajustes.tokenIA}
              onChange={(e) => actualizar({ tokenIA: e.target.value.trim() })}
              placeholder="sk-ant-…"
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 pr-10 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
            />
            <button
              type="button"
              onClick={() => setVerToken((v) => !v)}
              aria-label={verToken ? 'Ocultar token' : 'Mostrar token'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {verToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <label className="mb-1 mt-3 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Modelo</label>
        <input
          value={ajustes.modeloIA}
          onChange={(e) => actualizar({ modeloIA: e.target.value.trim() })}
          placeholder="claude-sonnet-4-5-20250929"
          className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
        />
        <Boton className="mt-3 w-full" icono={<KeyRound className="h-4 w-4" />} onClick={probarIA} cargando={probandoIA}>
          Probar conexión
        </Boton>
      </section>

      {/* ── Apariencia ─────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Palette className="h-4 w-4" /> Apariencia
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {Temas.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                vibrar()
                fijarTema(t.id)
              }}
              className={`h-11 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                tema === t.id
                  ? 'bg-acento text-black'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
              }`}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>
      </section>

      {/* ── Datos ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Database className="h-4 w-4" /> Datos locales
        </h2>
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          {contarClaves()} claves con prefijo <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{APP.prefijoClaves}_</code>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Boton
            variante="secundario"
            onClick={() => {
              vibrar()
              descargarRespaldo()
              mostrar('Respaldo descargado', 'ok')
            }}
          >
            Exportar
          </Boton>
          <Boton variante="secundario" icono={<Upload className="h-4 w-4" />} onClick={() => inputArchivo.current?.click()} cargando={sincronizando}>
            Importar
          </Boton>
        </div>
        <input ref={inputArchivo} type="file" accept="application/json,.json" className="hidden" onChange={importar} />
      </section>

      {/* ── Nube ───────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Cloud className="h-4 w-4" /> Sync en la nube
        </h2>
        {!firebaseConfigurado ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Firebase sin configurar — completá las claves en <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">src/services/firebase.ts</code> para activar respaldo en la nube (la app funciona igual en modo local).
          </p>
        ) : !sesion ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Iniciá sesión para respaldar tus datos en la nube.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              Documento <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{APP.prefijoClaves}_sync/{sesion.uid.slice(0, 8)}…</code> — merge sin borrar, lo local manda.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Boton variante="secundario" icono={<Upload className="h-4 w-4" />} onClick={() => syncNube('respaldar')} cargando={sincronizando}>
                Respaldo
              </Boton>
              <Boton variante="secundario" icono={<RotateCcw className="h-4 w-4" />} onClick={() => syncNube('restaurar')} cargando={sincronizando}>
                Restaurar
              </Boton>
            </div>
          </>
        )}
      </section>

      {/* ── Sesión ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <User className="h-4 w-4" /> Sesión
        </h2>
        {sesion ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {sesion.foto && <img src={sesion.foto} alt={sesion.nombre} referrerPolicy="no-referrer" className="h-9 w-9 rounded-full" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{sesion.nombre}</p>
                <p className="truncate text-xs text-neutral-400">{sesion.uid}</p>
              </div>
            </div>
            <Boton variante="fantasma" icono={<LogOut className="h-4 w-4" />} onClick={manejarSesion}>
              Salir
            </Boton>
          </div>
        ) : firebaseConfigurado ? (
          <Boton variante="secundario" className="w-full" icono={<LogIn className="h-4 w-4" />} onClick={manejarSesion}>
            Ingresar con Google
          </Boton>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Sin Firebase configurado no hay cuentas — modo 100% local.</p>
        )}
      </section>

      {/* ── Acerca de ──────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Info className="h-4 w-4" /> Acerca de
        </h2>
        <ul className="space-y-1 text-sm text-neutral-500 dark:text-neutral-400">
          <li>{APP.nombre} v{APP.version} · plataforma: {plataformaActual()}</li>
          <li>{APP.descripcion}</li>
          <li>Hecho con 🧱 TrackStack — de la familia Track (RiderTrack · WalletTrack · FitTrack · PlantTrack)</li>
        </ul>
      </section>
    </div>
  )
}
