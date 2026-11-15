import { useEffect, useRef, useState } from 'react'
import { Bot, Check, Cloud, Database, Download, Eye, EyeOff, FolderOpen, Info, KeyRound, LogIn, LogOut, Mic, Music2, Palette, Piano, RefreshCw, RotateCcw, Square, Trash2, Upload, User } from 'lucide-react'
import { APP } from '@/data/app'
import { leerAjustes, leer, guardar, borrarClave, descargarRespaldo, importarRespaldo, contarClaves } from '@/core/storage/almacenamiento'
import { respaldarNube, restaurarNube } from '@/core/sync/sync'
import { preguntarIA, traducirErrorClaude } from '@/core/ai/claude'
import {
  consultarCreditos,
  crearVozPersonal,
  consultarFraseVoz,
  consultarVozCreada,
  iniciarValidacionVoz,
  subirAudioVoz,
  vozDisponible,
  type MotorSuno,
  type TareaVozSuno,
  type VozPersonal,
} from '@/core/ai/suno'
import { probarLyria } from '@/core/ai/lyria'
import { useTema } from '@/core/theme/TemaProvider'
import { useAuth } from '@/core/auth/useAuth'
import { useToast } from '@/components/ui/Toast'
import { Boton } from '@/components/ui/Boton'
import {
  borrarConfigFirebase,
  firebaseConfigurado,
  fuenteConfigFirebase,
  guardarConfigFirebase,
  parsearConfigFirebase,
} from '@/services/firebase'
import { plataformaActual, vibrar, abrirURL } from '@/core/natives/plataforma'
import { buscarUltimaVersion, esMasNueva, type InfoActualizacion } from '@/core/actualizacion/actualizacion'
import { ACENTOS, AJUSTES_POR_DEFECTO, MODELOS_CLAUDE, MODELOS_LYRIA, MODELOS_SUNO, MODELOS_SUNO_VIEJOS, modeloClaudeConocido, type Ajustes, type Tema } from '@/types'

// ═══════════════════════════════════════════════════════════
// ⚙️ AJUSTES — el panel de control del esqueleto:
// IA (BYO token) · tema · respaldo/import · sync nube · sesión.
// Todo lo que un usuario necesita para configurar TU app antes
// de usarla. Añadile tus propias secciones al final.
// ═══════════════════════════════════════════════════════════

export function AjustesView() {
  const { mostrar } = useToast()
  const { tema, fijarTema, acento, fijarAcento } = useTema()
  const { sesion, loginGoogle, salir } = useAuth()
  const [ajustes, setAjustes] = useState<Ajustes>(leerAjustes)
  const [verToken, setVerToken] = useState(false)
  const [verTokenSuno, setVerTokenSuno] = useState(false)
  const [verTokenLyria, setVerTokenLyria] = useState(false)
  const [probandoIA, setProbandoIA] = useState(false)
  const [probandoSuno, setProbandoSuno] = useState(false)
  const [probandoLyria, setProbandoLyria] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [progresoSync, setProgresoSync] = useState('')
  const [avisoStorage, setAvisoStorage] = useState(false)
  const [ultimaSync, setUltimaSync] = useState(() => leer<number>('ultima_sync_nube', 0))
  const inputArchivo = useRef<HTMLInputElement>(null)

  // 🔄 Actualizador (FASE 2)
  const [buscandoUpdate, setBuscandoUpdate] = useState(false)
  const [nuevaDisponible, setNuevaDisponible] = useState<InfoActualizacion | null>(null)
  const [estadoUpdate, setEstadoUpdate] = useState<'al-dia' | 'error' | ''>('')

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
        token: ajustes.tokenIA.trim(),
        modelo: ajustes.modeloIA,
        mensajes: [{ rol: 'usuario', texto: 'Respondé únicamente: listo' }],
        maxTokens: 16,
      })
      mostrar('¡IA conectada! 🎉 — el token y el modelo andan bien', 'ok', 4000)
    } catch (e) {
      // 🩹 v0.15.2 — error en criollo y con más aire para leerlo
      mostrar(e instanceof Error ? traducirErrorClaude(e.message) : 'Falló la conexión', 'error', 7000)
    } finally {
      setProbandoIA(false)
    }
  }

  async function probarSuno() {
    if (!ajustes.tokenSuno) {
      mostrar('Pegá tu clave de Suno API primero', 'info')
      return
    }
    vibrar()
    setProbandoSuno(true)
    try {
      const msg = await consultarCreditos({ url: ajustes.urlSuno, token: ajustes.tokenSuno })
      mostrar(msg, 'ok', 4000)
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló la conexión', 'error', 4500)
    } finally {
      setProbandoSuno(false)
    }
  }

  async function probarLyriaConexion() {
    if (!ajustes.tokenLyria) {
      mostrar('Pegá tu API key de Google primero', 'info')
      return
    }
    vibrar()
    setProbandoLyria(true)
    try {
      const msg = await probarLyria({ token: ajustes.tokenLyria })
      mostrar(msg, 'ok', 4500)
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló la conexión', 'error', 4500)
    } finally {
      setProbandoLyria(false)
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

  // 🔐 v0.12.0 — activar Firebase pegando el firebaseConfig
  const [firebasePegado, setFirebasePegado] = useState('')
  function activarFirebase() {
    const cfg = parsearConfigFirebase(firebasePegado)
    if (!cfg) {
      mostrar(
        'No encontré apiKey y projectId — copiá el bloque firebaseConfig ENTERO de Firebase Console y pegalo acá',
        'error',
        5500,
      )
      return
    }
    guardarConfigFirebase(cfg)
    vibrar('media')
    mostrar('Firebase activo ✔ — recargando para conectar tu cuenta…', 'ok', 2000)
    window.setTimeout(() => window.location.reload(), 1800)
  }

  function quitarFirebase() {
    borrarConfigFirebase()
    mostrar('Configuración quitada — recargando en modo local…', 'info', 1800)
    window.setTimeout(() => window.location.reload(), 1600)
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
    setAvisoStorage(false)
    try {
      const alProgresar = (p: { etapa: 'claves' | 'audios'; hecho: number; total: number }) => {
        setProgresoSync(p.etapa === 'claves' ? `Datos… (${p.hecho}/${p.total})` : `MP3… (${p.hecho}/${p.total})`)
      }
      if (accion === 'respaldar') {
        const r = await respaldarNube(sesion.uid, alProgresar)
        setAvisoStorage(r.avisoStorage)
        guardar('ultima_sync_nube', Date.now())
        mostrar(
          r.avisoStorage
            ? `${r.claves} datos subidos — los MP3 necesitan Storage activo`
            : `${r.claves} datos y ${r.audiosSubidos} MP3 nuevos en la nube`,
          r.avisoStorage ? 'info' : 'ok',
          4200,
        )
      } else {
        const r = await restaurarNube(sesion.uid, alProgresar)
        setAvisoStorage(r.avisoStorage)
        mostrar(
          r.claves || r.audiosBajados
            ? `${r.claves} datos y ${r.audiosBajados} canciones recuperadas`
            : 'La nube no tenía datos nuevos',
          r.claves || r.audiosBajados ? 'ok' : 'info',
        )
      }
      setUltimaSync(leer<number>('ultima_sync_nube', Date.now()))
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló la sync', 'error', 4000)
    } finally {
      setSincronizando(false)
      setProgresoSync('')
    }
  }

  async function buscarActualizaciones() {
    vibrar()
    setBuscandoUpdate(true)
    setNuevaDisponible(null)
    setEstadoUpdate('')
    try {
      const info = await buscarUltimaVersion()
      if (!info) {
        setEstadoUpdate('error')
        return
      }
      if (esMasNueva(info)) {
        setNuevaDisponible(info)
      } else {
        setEstadoUpdate('al-dia')
      }
    } finally {
      setBuscandoUpdate(false)
    }
  }

  async function descargarActualizacion() {
    if (!nuevaDisponible) return
    vibrar()
    const ok = await abrirURL(nuevaDisponible.urlApk)
    if (!ok) mostrar('No se pudo abrir el enlace de descarga', 'info')
  }

  const Temas: Array<{ id: Tema; etiqueta: string }> = [
    { id: 'oscuro', etiqueta: '🌙 Oscuro' },
    { id: 'amoled', etiqueta: '🖤 AMOLED' },
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
        {/* 🤖 v0.7.0 — selector de modelo con opciones claras; si
            el valor guardado es de otra versión, entra el modo
            «Personalizado» para no romper nada. */}
        <label className="mb-1 mt-3 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          Modelo — también lo cambiás al crear letras
        </label>
        <select
          value={modeloClaudeConocido(ajustes.modeloIA) ? ajustes.modeloIA : 'personalizado'}
          onChange={(e) => {
            if (e.target.value !== 'personalizado') actualizar({ modeloIA: e.target.value })
          }}
          className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors focus:border-acento dark:border-neutral-700"
        >
          {MODELOS_CLAUDE.map((m) => (
            <option key={m.id} value={m.id}>
              {m.etiqueta} · {m.detalle}
            </option>
          ))}
          <option value="personalizado">Personalizado…</option>
        </select>
        {!modeloClaudeConocido(ajustes.modeloIA) && (
          <input
            value={ajustes.modeloIA}
            onChange={(e) => actualizar({ modeloIA: e.target.value.trim() })}
            placeholder="claude-sonnet-4-5-20250929"
            className="mt-2 h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
          />
        )}
        <Boton className="mt-3 w-full" icono={<KeyRound className="h-4 w-4" />} onClick={probarIA} cargando={probandoIA}>
          Probar conexión
        </Boton>
      </section>

      {/* ── Motor Suno (FASE 3: motor doble) ──────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Music2 className="h-4 w-4" /> Motor de música — Suno
        </h2>
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          El segundo motor del motor doble: convierte las letras en canciones. Mismo patrón BYO — la clave queda solo en tu
          dispositivo. (La cuenta gratis de <span className="font-semibold">suno.com</span> es aparte, para la app oficial; esta
          clave es de la API.)
        </p>
        <p className="mb-3 rounded-xl bg-neutral-100 p-2.5 text-[11px] leading-relaxed text-neutral-500 dark:bg-neutral-800/60 dark:text-neutral-400">
          ⚡ <span className="font-semibold">Las dos colas:</span> Suno no vende API oficial, así que esta clave pasa por un
          intermediario con cola compartida (en horas pico se demora mucho). La <span className="font-semibold">cola oficial</span> —la
          de las apps rápidas— vive en suno.com o su app oficial (Suno, Inc.): gratis con tu Google (50 créditos/día) o Pro
          ($8/mes, cola prioritaria). Desde la pestaña Música tenés el botón «⚡ Urgente» para saltar ahí cuando quieras.
        </p>
        <label className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">URL base de la API</label>
        <input
          value={ajustes.urlSuno}
          onChange={(e) => actualizar({ urlSuno: e.target.value.trim() })}
          placeholder="https://api.sunoapi.org"
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
        />
        <label className="mb-1 mt-3 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          Clave de Suno API (Bearer) — queda SOLO en tu dispositivo
        </label>
        <div className="relative">
          <input
            type={verTokenSuno ? 'text' : 'password'}
            value={ajustes.tokenSuno}
            onChange={(e) => actualizar({ tokenSuno: e.target.value.trim() })}
            placeholder="sk-…"
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 pr-10 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
          />
          <button
            type="button"
            onClick={() => setVerTokenSuno((v) => !v)}
            aria-label={verTokenSuno ? 'Ocultar clave' : 'Mostrar clave'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {verTokenSuno ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <label className="mb-1 mt-3 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Modelo</label>
        <select
          value={ajustes.modeloSuno}
          onChange={(e) => actualizar({ modeloSuno: e.target.value })}
          className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors focus:border-acento dark:border-neutral-700"
        >
          {MODELOS_SUNO.map((m) => (
            <option key={m.id} value={m.id}>
              {m.etiqueta}
            </option>
          ))}
        </select>
        {(MODELOS_SUNO_VIEJOS as readonly string[]).includes(ajustes.modeloSuno) && (
          <p className="mt-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            ⚠️ Tu modelo ({ajustes.modeloSuno.replace('_', '.')}) está discontinuado en sunoapi.org — para esperar menos,
            cambiate a V6 Mini (o V6, el recomendado)
          </p>
        )}
        <Boton className="mt-3 w-full" variante="secundario" icono={<KeyRound className="h-4 w-4" />} onClick={probarSuno} cargando={probandoSuno}>
          Probar conexión y créditos
        </Boton>
      </section>

      {/* ── 🎤 Mi voz (FASE 14) ─────────────────────────── */}
      <MiVozSection ajustes={ajustes} />

      {/* ── 💾 Descargas de MP3 (v0.7.1) ─────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Download className="h-4 w-4" /> Descargas de MP3
        </h2>
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          Cuando tocás <b>MP3 + letra</b> en la Biblioteca, el archivo se guarda de verdad en el teléfono: en la carpeta pública{' '}
          <span className="font-semibold">Documentos</span>, adentro de esta subcarpeta tuya (se crea sola la primera vez).
          En la versión web cae en las descargas del navegador. Desde la v0.9.0 cada canción baja <b>con la letra adentro</b>{' '}
          (la leen los reproductores) y acompañada de un archivito <span className="font-semibold">.lrc</span> con el mismo
          nombre — con esos dos, apps como Musicolet o Poweramp te muestran la letra avanzando con la música, como en Spotify.
        </p>
        <label className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Nombre de la carpeta</label>
        <input
          value={ajustes.carpetaDescargas}
          onChange={(e) => actualizar({ carpetaDescargas: e.target.value })}
          placeholder="Música de Rudy"
          maxLength={40}
          className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
        />
        <p className="mt-1.5 text-[11px] text-neutral-400">
          Quedará en: <span className="font-semibold text-neutral-500 dark:text-neutral-300">Documentos/{ajustes.carpetaDescargas || '…'}/</span>
          — la ves con el explorador de archivos y los reproductores de música
        </p>
      </section>

      {/* ── Motor alternativo: Google Lyria ──────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Piano className="h-4 w-4" /> Motor alternativo — Google Lyria
        </h2>
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          El plan B musical: si Suno se queda sin créditos, cambiás de motor en la pestaña Música y seguís. Usá tu API key de
          Google AI Studio (<span className="font-semibold">aistudio.google.com</span> — la misma cuenta Google de tu Firebase).
          ⚠️ Los modelos de música de Google no tienen capa gratis: requiere billing activo ($0.08/canción).
        </p>
        <label className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          API key de Google AI Studio — queda SOLO en tu dispositivo
        </label>
        <div className="relative">
          <input
            type={verTokenLyria ? 'text' : 'password'}
            value={ajustes.tokenLyria}
            onChange={(e) => actualizar({ tokenLyria: e.target.value.trim() })}
            placeholder="AIza…"
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 pr-10 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
          />
          <button
            type="button"
            onClick={() => setVerTokenLyria((v) => !v)}
            aria-label={verTokenLyria ? 'Ocultar clave' : 'Mostrar clave'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {verTokenLyria ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <label className="mb-1 mt-3 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Modelo</label>
        <select
          value={ajustes.modeloLyria}
          onChange={(e) => actualizar({ modeloLyria: e.target.value })}
          className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors focus:border-acento dark:border-neutral-700"
        >
          {MODELOS_LYRIA.map((m) => (
            <option key={m.id} value={m.id}>
              {m.etiqueta}
            </option>
          ))}
        </select>
        <Boton className="mt-3 w-full" variante="secundario" icono={<KeyRound className="h-4 w-4" />} onClick={probarLyriaConexion} cargando={probandoLyria}>
          Probar conexión
        </Boton>
      </section>

      {/* ── Apariencia ─────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Palette className="h-4 w-4" /> Apariencia
        </h2>
        <div className="grid grid-cols-2 gap-2">
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
        {/* 🎨 v0.13.0 — acento de color de toda la app */}
        <label className="mb-2 mt-4 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          Color de acento
        </label>
        <div className="flex flex-wrap gap-2.5">
          {ACENTOS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                vibrar('ligera')
                fijarAcento(a.id)
              }}
              title={`Acento ${a.etiqueta.toLowerCase()}`}
              aria-label={`Acento ${a.etiqueta}`}
              aria-pressed={acento === a.id}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-90 ${
                acento === a.id ? 'ring-2 ring-offset-2 ring-neutral-400 dark:ring-offset-neutral-900' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: a.color }}
            >
              {acento === a.id && <Check className="h-5 w-5 text-white drop-shadow" />}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-neutral-400">
          AMOLED pinta los fondos de negro puro: en pantallas OLED ahorra batería y se ve más premium.
        </p>
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

      {/* ── Cuenta Google / Firebase (v0.12.0) ──────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <LogIn className="h-4 w-4" /> Cuenta Google (Firebase)
        </h2>
        {firebaseConfigurado ? (
          <div className="space-y-2">
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              ✅ Firebase activo — ingreso con Google y respaldo en la nube habilitados.
            </p>
            <p className="text-xs text-neutral-400">
              Configurado {fuenteConfigFirebase() === 'ajustes' ? 'desde acá (Ajustes)' : 'en el código de la app'}.
            </p>
            {fuenteConfigFirebase() === 'ajustes' && (
              <Boton variante="fantasma" icono={<LogOut className="h-4 w-4" />} onClick={quitarFirebase}>
                Quitar la configuración (volver a modo local)
              </Boton>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Ingresá con tu cuenta Google y respaldá todo en la nube. Se configura UNA sola vez, gratis (~5 minutos).
            </p>
            <details className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <summary className="cursor-pointer select-none font-bold text-neutral-600 dark:text-neutral-300">
                📋 Guía paso a paso
              </summary>
              <ol className="mt-2 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                <li>
                  Entrá a <b>console.firebase.google.com</b> con tu cuenta Google y creá un proyecto nuevo
                  (nombre: <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">musictrack</code>, plan gratis).
                </li>
                <li>
                  Menú <b>Build → Authentication → Comenzar</b> → elegí <b>Google</b> → <b>Habilitar</b> (poné tu email de
                  soporte) → Guardar.
                </li>
                <li>
                  En <b>Authentication → Settings → Dominios autorizados</b> → agregá{' '}
                  <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">ridertrack.github.io</code> (para la
                  versión web).
                </li>
                <li>
                  Menú <b>Build → Firestore Database</b> → <b>Crear base de datos</b> → modo producción → la región que
                  quieras → Crear.
                </li>
                <li>
                  Menú <b>Build → Storage</b> → <b>Comenzar</b> → modo producción (para respaldar también los MP3 de tus
                  canciones — plan gratis, 5 GB).
                </li>
                <li>
                  <b>⚙️ Configuración del proyecto</b> → abajo en «Tus apps» tocá el ícono{' '}
                  <b>&lt;/&gt;</b> (web) → registrala sin hosting → te muestra el bloque{' '}
                  <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">firebaseConfig</code> → copialo ENTERO.
                </li>
                <li>Pegalo abajo y tocá «Activar». Listo — ingresás con tu cuenta desde Sesión.</li>
              </ol>
              <p className="mt-2 text-[11px] text-neutral-400">
                Para el APK, además: guardá el archivo google-services.json en el secret GOOGLE_SERVICES_JSON de GitHub y
                la CI lo inyecta sola (README, sección Firebase).
              </p>
            </details>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                Pegá acá el bloque firebaseConfig completo
              </span>
              <textarea
                value={firebasePegado}
                onChange={(e) => setFirebasePegado(e.target.value)}
                rows={5}
                spellCheck={false}
                placeholder={'const firebaseConfig = {\n  apiKey: "AIza…",\n  authDomain: "tu-proyecto.firebaseapp.com",\n  projectId: "tu-proyecto",\n  …\n}'}
                className="min-h-[110px] w-full resize-y rounded-xl border border-neutral-300 bg-transparent p-3 font-mono text-xs outline-none transition-colors focus:border-acento dark:border-neutral-700"
              />
            </label>
            <Boton className="w-full" icono={<LogIn className="h-4 w-4" />} onClick={activarFirebase}>
              Activar — guardar y conectar
            </Boton>
          </div>
        )}
      </section>

      {/* ── Nube ───────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Cloud className="h-4 w-4" /> Sync en la nube
        </h2>
        {!firebaseConfigurado ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Activá Firebase en la sección «Cuenta Google» de arriba para respaldar en la nube (la app funciona igual en modo local).
          </p>
        ) : !sesion ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Iniciá sesión para respaldar tus datos en la nube.</p>
        ) : (
          <>
            <div className="mb-3 space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
              <p>
                🤖 <b>Respaldo automático:</b> cada cambio que hacés sube solo (letras, canciones, listas, ajustes, claves y los MP3).
              </p>
              <p>
                ☁️ Todo va a <b>TU</b> proyecto Firebase — merge sin borrar: lo local siempre manda.
              </p>
              {ultimaSync > 0 && (
                <p className="text-neutral-400">
                  Último respaldo: {new Date(ultimaSync).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              )}
            </div>
            {sincronizando && progresoSync && (
              <p className="mb-2 flex items-center gap-2 text-sm text-acento">
                <RefreshCw className="h-4 w-4 animate-spin" /> Subiendo/Bajando {progresoSync}
              </p>
            )}
            {avisoStorage && (
              <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                ⚠️ Los MP3 no viajaron: activá <b>Storage</b> en Firebase Console (Build → Storage → Comenzar, plan gratis, 5 GB) y volvé a respaldar. Tus letras y datos SÍ quedaron en la nube.
              </div>
            )}
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
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Sin Firebase activo no hay cuentas — modo 100% local (activálo en «Cuenta Google» de arriba).</p>
        )}
      </section>

      {/* ── Actualización (FASE 2) ───────────────────── */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <RefreshCw className="h-4 w-4" /> Actualización
        </h2>
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          Instalada: v{APP.version} — las APKs nuevas se publican en GitHub Releases y se instalan encima sin perder datos.
        </p>
        <Boton
          className="w-full"
          icono={<RefreshCw className="h-4 w-4" />}
          onClick={buscarActualizaciones}
          cargando={buscandoUpdate}
        >
          Buscar actualizaciones
        </Boton>
        {estadoUpdate === 'al-dia' && (
          <p className="mt-2 text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            ✅ Ya tenés la última versión
          </p>
        )}
        {estadoUpdate === 'error' && (
          <p className="mt-2 text-center text-xs font-semibold text-red-500">No se pudo verificar — revisá tu conexión</p>
        )}
        {nuevaDisponible && (
          <Boton
            className="mt-2 w-full"
            icono={<Download className="h-4 w-4" />}
            onClick={descargarActualizacion}
          >
            Descargar v{nuevaDisponible.version}
          </Boton>
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

// ═══════════════════════════════════════════════════════════
// 🎤 v0.17.0 — FASE 14: MI VOZ. El usuario graba una muestra
// (cantando o conversando), la API le devuelve una frase para
// CANTAR (verificación), y con los dos audios Suno arma su
// perfil de voz — después sus canciones pueden salir cantadas
// por él con el interruptor de la pestaña Música.
//
// Toda la creación es RETOMABLE: la tarea en curso se guarda en
// localStorage (`voz_tarea`), así que cambiar de pestaña o
// cerrar la app NO la pierde — al volver, sigue del mismo paso.
// ═══════════════════════════════════════════════════════════

/** Estado del flujo de creación, paso por paso. */
type FlujoVoz =
  | { paso: 'reposo' }
  | { paso: 'subiendo-muestra' }
  | { paso: 'esperando-frase'; taskId: string; desde: number }
  | { paso: 'frase-lista'; taskId: string; frase: string; desde: number }
  | { paso: 'subiendo-frase'; taskId: string; frase: string }
  | { paso: 'creando'; taskId: string; frase?: string; desde: number }
  | {
      paso: 'error'
      mensaje: string
      /** A dónde volver si la tarea sigue viva (timeout/red). */
      reanudar?: { etapa: 'esperando-frase' | 'frase-lista' | 'creando'; taskId: string; frase?: string }
    }

/** Duración en segundos de un audio elegido del teléfono
 * (null si el navegador no la puede leer — se asume 30). */
function duracionAudioSeg(audio: Blob): Promise<number | null> {
  return new Promise((resolver) => {
    const url = URL.createObjectURL(audio)
    const el = new Audio()
    const listo = (v: number | null) => {
      URL.revokeObjectURL(url)
      resolver(v)
    }
    el.preload = 'metadata'
    el.onloadedmetadata = () => listo(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null)
    el.onerror = () => listo(null)
    el.src = url
  })
}

function MiVozSection({ ajustes }: { ajustes: Ajustes }) {
  const { mostrar } = useToast()
  const motorSuno: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }

  const [voz, setVoz] = useState<VozPersonal | null>(() => leer<VozPersonal | null>('voz_suno', null))
  const [verificando, setVerificando] = useState(false)
  const [flujo, setFlujo] = useState<FlujoVoz>(() => {
    // retomar una creación dejada a medias: la tarea sigue viva
    // del lado de la API (hasta 20 min de margen, generoso)
    const tarea = leer<TareaVozSuno | null>('voz_tarea', null)
    if (!tarea) return { paso: 'reposo' }
    if (Date.now() - tarea.inicio > 20 * 60 * 1000) {
      borrarClave('voz_tarea')
      return { paso: 'reposo' }
    }
    if (tarea.etapa === 'frase')
      return tarea.frase
        ? { paso: 'frase-lista', taskId: tarea.taskId, frase: tarea.frase, desde: tarea.inicio }
        : { paso: 'esperando-frase', taskId: tarea.taskId, desde: tarea.inicio }
    return { paso: 'creando', taskId: tarea.taskId, frase: tarea.frase, desde: tarea.inicio }
  })
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  // ── grabación con el micrófono (MediaRecorder) ──
  const [grabando, setGrabando] = useState<'muestra' | 'frase' | null>(null)
  const [segundos, setSegundos] = useState(0)
  const segundosRef = useRef(0)
  const cronometro = useRef(0)
  const grabadora = useRef<MediaRecorder | null>(null)
  const inputMuestra = useRef<HTMLInputElement>(null)
  const inputFrase = useRef<HTMLInputElement>(null)

  // al desmontar: cortar el cronómetro y la grabación suave
  useEffect(
    () => () => {
      window.clearInterval(cronometro.current)
      if (grabadora.current?.state === 'recording') grabadora.current.stop()
    },
    [],
  )

  // ── polling de la tarea (frase → voz), cada 5 s ──
  const fallosRed = useRef(0)
  useEffect(() => {
    if (flujo.paso !== 'esperando-frase' && flujo.paso !== 'creando') return
    const { paso, taskId, desde } = flujo
    // la frase solo viaja en la etapa de creación (para retomar)
    const frase = flujo.paso === 'creando' ? flujo.frase : undefined
    let vivo = true
    const tic = async () => {
      if (!vivo) return
      // vencimiento suave: a los 6 min se pausa con botón para
      // retomar — la tarea no se pierde, solo deja de sondearse
      if (Date.now() - desde > 6 * 60 * 1000) {
        setFlujo({
          paso: 'error',
          mensaje: 'La tarea está demorando más de lo normal (más de 6 minutos) — tocá «Seguir con la tarea» para no perderla, o empezá de nuevo.',
          reanudar: { etapa: paso, taskId, frase },
        })
        return
      }
      try {
        if (paso === 'esperando-frase') {
          const r = await consultarFraseVoz(motorSuno, taskId)
          if (!vivo) return
          fallosRed.current = 0
          if (r.error) {
            borrarClave('voz_tarea')
            setFlujo({ paso: 'error', mensaje: r.error })
          } else if (r.frase) {
            const tarea = leer<TareaVozSuno | null>('voz_tarea', null)
            guardar('voz_tarea', { etapa: 'frase', taskId, inicio: tarea?.inicio ?? Date.now(), frase: r.frase })
            vibrar()
            setFlujo({ paso: 'frase-lista', taskId, frase: r.frase, desde })
          }
        } else {
          const r = await consultarVozCreada(motorSuno, taskId)
          if (!vivo) return
          fallosRed.current = 0
          if (r.error) {
            borrarClave('voz_tarea')
            setFlujo({ paso: 'error', mensaje: r.error })
          } else if (r.voiceId) {
            const nueva: VozPersonal = { voiceId: r.voiceId, taskId, nombre: 'Mi voz', fecha: Date.now() }
            borrarClave('voz_tarea')
            guardar('voz_suno', nueva)
            setVoz(nueva)
            setFlujo({ paso: 'reposo' })
            vibrar('media')
            mostrar('¡Tu voz está lista! 🎤 — activala en Música con el interruptor «Cantar con mi voz»', 'ok', 6000)
          }
        }
      } catch {
        if (!vivo) return
        // bips de red puntuales se toleran; 30 seguidos, se avisa
        fallosRed.current += 1
        if (fallosRed.current >= 6)
          setFlujo({
            paso: 'error',
            mensaje: 'Se cortó la conexión con la API — tocá «Seguir con la tarea» cuando vuelva tu internet.',
            reanudar: { etapa: paso, taskId, frase },
          })
      }
    }
    void tic()
    const t = window.setInterval(() => void tic(), 5000)
    return () => {
      vivo = false
      window.clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flujo])

  async function grabar(que: 'muestra' | 'frase') {
    if (grabando) return
    if (!ajustes.tokenSuno) {
      mostrar('Pegá tu clave de Suno API más arriba primero', 'info', 3500)
      return
    }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      mostrar('Acá no puedo grabar — usá 📂 con un audio grabado con cualquier app de grabación', 'info', 5500)
      return
    }
    let mic: MediaStream
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      mostrar('No pude usar el micrófono (permiso negado) — usá 📂 y subí un audio grabado con cualquier app', 'info', 5500)
      return
    }
    vibrar()
    // el formato que mejor agarra este dispositivo (en Android
    // suele ser webm/opus; Safari graba mp4)
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    )
    const rec = new MediaRecorder(mic, mimeType ? { mimeType } : undefined)
    const trozos: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size) trozos.push(e.data)
    }
    rec.onstop = () => {
      mic.getTracks().forEach((t) => t.stop())
      const audio = new Blob(trozos, { type: rec.mimeType || 'audio/webm' })
      const segs = segundosRef.current
      if (segs < 5) {
        mostrar('Muy cortito (menos de 5 segundos) — probá de nuevo y dale un poco más de cuerda', 'info', 4000)
        return
      }
      if (que === 'muestra') void mandarMuestra(audio, segs)
      else void mandarFrase(audio)
    }
    trozos.length = 0
    segundosRef.current = 0
    setSegundos(0)
    grabadora.current = rec
    setGrabando(que)
    rec.start()
    cronometro.current = window.setInterval(() => {
      segundosRef.current += 1
      setSegundos(segundosRef.current)
    }, 1000)
  }

  function pararGrabacion() {
    window.clearInterval(cronometro.current)
    setGrabando(null)
    grabadora.current?.stop()
  }

  async function mandarMuestra(audio: Blob, segs: number) {
    if (!ajustes.tokenSuno) {
      mostrar('Pegá tu clave de Suno API más arriba primero', 'info', 3500)
      return
    }
    setFlujo({ paso: 'subiendo-muestra' })
    try {
      const url = await subirAudioVoz(motorSuno, audio)
      const taskId = await iniciarValidacionVoz(motorSuno, url, segs)
      const inicio = Date.now()
      guardar('voz_tarea', { etapa: 'frase', taskId, inicio })
      setFlujo({ paso: 'esperando-frase', taskId, desde: inicio })
      mostrar('Muestra recibida — ahora preparo tu frase de verificación 👂', 'ok', 3500)
    } catch (e) {
      setFlujo({ paso: 'error', mensaje: e instanceof Error ? e.message : 'Falló la subida del audio' })
    }
  }

  async function mandarFrase(audio: Blob) {
    if (flujo.paso !== 'frase-lista') return
    const { taskId, frase } = flujo
    setFlujo({ paso: 'subiendo-frase', taskId, frase })
    try {
      const url = await subirAudioVoz(motorSuno, audio)
      const taskIdNuevo = await crearVozPersonal(motorSuno, {
        taskIdValidacion: taskId,
        urlVerificacion: url,
        nombre: 'Mi voz',
      })
      const inicio = Date.now()
      guardar('voz_tarea', { etapa: 'creando', taskId: taskIdNuevo, inicio, frase })
      setFlujo({ paso: 'creando', taskId: taskIdNuevo, frase, desde: inicio })
    } catch (e) {
      setFlujo({
        paso: 'error',
        mensaje: e instanceof Error ? e.message : 'Falló la subida de la verificación',
        reanudar: { etapa: 'frase-lista', taskId, frase },
      })
    }
  }

  async function elegirArchivo(evento: React.ChangeEvent<HTMLInputElement>, que: 'muestra' | 'frase') {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!archivo) return
    if (!ajustes.tokenSuno) {
      mostrar('Pegá tu clave de Suno API más arriba primero', 'info', 3500)
      return
    }
    if (que === 'frase' && flujo.paso !== 'frase-lista') return
    if (archivo.size > 9_000_000) {
      mostrar('Ese audio pesa más de 10 MB — elegí uno más corto o recortalo', 'error', 4500)
      return
    }
    const segs = (await duracionAudioSeg(archivo)) ?? 30
    if (segs < 5) {
      mostrar('Muy cortito (menos de 5 segundos) — necesito al menos unos segundos de tu voz', 'info', 4000)
      return
    }
    if (que === 'muestra') void mandarMuestra(archivo, segs)
    else void mandarFrase(archivo)
  }

  function seguirEsperando() {
    if (flujo.paso !== 'error' || !flujo.reanudar) return
    const r = flujo.reanudar
    if (r.etapa === 'frase-lista' && r.frase) {
      setFlujo({ paso: 'frase-lista', taskId: r.taskId, frase: r.frase, desde: Date.now() })
      return
    }
    setFlujo(
      r.etapa === 'creando'
        ? { paso: 'creando', taskId: r.taskId, frase: r.frase, desde: Date.now() }
        : { paso: 'esperando-frase', taskId: r.taskId, desde: Date.now() },
    )
  }

  function empezarDeNuevo() {
    borrarClave('voz_tarea')
    fallosRed.current = 0
    setFlujo({ paso: 'reposo' })
  }

  async function verificar() {
    if (!voz || verificando) return
    setVerificando(true)
    try {
      const ok = await vozDisponible(motorSuno, voz.taskId)
      mostrar(
        ok
          ? 'Tu voz sigue activa en tu cuenta de sunoapi.org ✔'
          : 'La API dice que tu voz ya no está disponible — creala de nuevo cuando quieras',
        ok ? 'ok' : 'error',
        4500,
      )
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló la verificación', 'error', 4500)
    } finally {
      setVerificando(false)
    }
  }

  function rehacerVoz() {
    if (!voz) return
    // doble toque para no borrarla sin querer (la recreación
    // vuelve a pedir los dos audios)
    if (!confirmarBorrado) {
      setConfirmarBorrado(true)
      window.setTimeout(() => setConfirmarBorrado(false), 4000)
      return
    }
    setConfirmarBorrado(false)
    borrarClave('voz_suno')
    borrarClave('voz_tarea')
    setVoz(null)
    setFlujo({ paso: 'reposo' })
    mostrar('Voz borrada — creala de nuevo cuando quieras', 'info')
  }

  const cargandoPaso =
    flujo.paso === 'subiendo-muestra' || flujo.paso === 'esperando-frase' || flujo.paso === 'subiendo-frase' || flujo.paso === 'creando'

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
        <Mic className="h-4 w-4" /> Mi voz
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        Cantá tus canciones con <b>tu propia voz</b>: grabate una muestra corta, Suno arma tu perfil de voz y lo activás
        desde la pestaña Música con el interruptor «🎤 Cantar con mi voz» (modelo V6). La voz queda guardada en tu cuenta
        de sunoapi.org — se crea una sola vez y podés rehacerla cuando quieras.
      </p>

      {/* ✅ la voz ya existe: tarjeta con acciones */}
      {voz ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">✅ Tu voz está creada — «{voz.nombre}»</p>
          <p className="mt-1 text-[11px] leading-relaxed text-emerald-600/90 dark:text-emerald-400/80">
            Creada el {new Date(voz.fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })} · vive en tu
            cuenta de sunoapi.org y no vence.
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            Para usarla: pestaña 🎧 Música → interruptor <b>«🎤 Cantar con mi voz»</b> (modelo V6). Las canciones salen
            cantadas con tu timbre — combiná con el estilo que quieras, hasta la criolla 🇵🇪.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Boton
              variante="secundario"
              tamano="sm"
              icono={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void verificar()}
              cargando={verificando}
            >
              Verificar que siga activa
            </Boton>
            <Boton variante="peligro" tamano="sm" icono={<Trash2 className="h-3.5 w-3.5" />} onClick={rehacerVoz}>
              {confirmarBorrado ? '⚠ Tocá de nuevo para borrar' : 'Rehacer mi voz'}
            </Boton>
          </div>
        </div>
      ) : (
        <>
          {/* 🔴 grabación en curso */}
          {grabando ? (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-500/40 dark:bg-red-500/10">
              <p className="flex items-center gap-2 text-sm font-bold text-red-600 dark:text-red-400">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                Grabando {grabando === 'muestra' ? 'tu muestra' : 'la frase'}… {Math.floor(segundos / 60)}:
                {String(segundos % 60).padStart(2, '0')}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-red-500/80 dark:text-red-400/70">
                {grabando === 'muestra'
                  ? 'Cantá o conversá unos 15-30 segundos — SOLO tu voz, sin música de fondo y en un lugar tranquilo.'
                  : 'Cantá la frase de arriba como te salga, entera y con ganas — no tiene que ser perfecta.'}
              </p>
              <Boton variante="peligro" className="mt-2 w-full" icono={<Square className="h-4 w-4" />} onClick={pararGrabacion}>
                ⏹ Listo, cortar
              </Boton>
            </div>
          ) : flujo.paso === 'reposo' ? (
            <div className="space-y-2">
              {!ajustes.tokenSuno && (
                <p className="rounded-xl bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  Pegá tu clave de Suno API más arriba primero — sin ella no puedo hablar con la API.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Boton icono={<Mic className="h-4 w-4" />} onClick={() => void grabar('muestra')}>
                  🎤 Grabar muestra
                </Boton>
                <Boton variante="secundario" icono={<FolderOpen className="h-4 w-4" />} onClick={() => inputMuestra.current?.click()}>
                  📂 Audio mío
                </Boton>
              </div>
              <p className="text-[11px] leading-relaxed text-neutral-400">
                💡 La muestra: 15-30 segundos cantando o conversando, SOLO tu voz (sin música de fondo). Después te doy una
                frase corta para cantar y listo. «📂 Audio mío» sirve para un audio ya grabado con cualquier app — el
                flujo consume unos créditos de tu cuenta.
              </p>
            </div>
          ) : flujo.paso === 'frase-lista' ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold leading-relaxed text-neutral-500 dark:text-neutral-400">
                2º paso — Suno te pide <b>CANTAR</b> esta frase para verificar que sos vos:
              </p>
              <div className="select-all rounded-xl border-2 border-dashed border-acento/50 bg-acento/5 p-3 text-center text-sm font-bold italic leading-relaxed text-neutral-800 dark:text-neutral-100">
                «{flujo.frase}»
              </div>
              <p className="text-[11px] leading-relaxed text-neutral-400">
                Cantala mejor que leerla (así sale más parecida) — como te salga, sin apuro. También podés grabarla con
                otra app y traerla con 📂.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Boton icono={<Mic className="h-4 w-4" />} onClick={() => void grabar('frase')}>
                  🎤 Grabarme cantando
                </Boton>
                <Boton variante="secundario" icono={<FolderOpen className="h-4 w-4" />} onClick={() => inputFrase.current?.click()}>
                  📂 Audio mío
                </Boton>
              </div>
            </div>
          ) : flujo.paso === 'error' ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
              <p className="text-sm font-semibold leading-relaxed text-red-600 dark:text-red-400">⚠ {flujo.mensaje}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {flujo.reanudar && (
                  <Boton variante="secundario" tamano="sm" onClick={seguirEsperando}>
                    ⏳ Seguir con la tarea
                  </Boton>
                )}
                <Boton variante="fantasma" tamano="sm" onClick={empezarDeNuevo}>
                  Empezar de nuevo
                </Boton>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2.5 rounded-xl bg-neutral-100 p-3 text-sm text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
                <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
                <span className="leading-relaxed">
                  {flujo.paso === 'subiendo-muestra' && 'Subiendo tu audio…'}
                  {flujo.paso === 'esperando-frase' && 'La API está escuchando tu voz y preparando tu frase de verificación… (suele tardar menos de un minuto)'}
                  {flujo.paso === 'subiendo-frase' && 'Subiendo tu verificación…'}
                  {flujo.paso === 'creando' && 'Creando tu voz… (1 a 3 minutos)'}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">
                Podés salir de acá y volver — sigo yo solo y te espero en el mismo paso
                {cargandoPaso ? ' (la tarea no se pierde)' : ''}.
              </p>
            </div>
          )}
        </>
      )}

      {/* inputs ocultos para elegir audios ya grabados */}
      <input ref={inputMuestra} type="file" accept="audio/*" className="hidden" onChange={(e) => void elegirArchivo(e, 'muestra')} />
      <input ref={inputFrase} type="file" accept="audio/*" className="hidden" onChange={(e) => void elegirArchivo(e, 'frase')} />
    </section>
  )
}
