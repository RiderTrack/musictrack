import { useEffect, useRef, useState } from 'react'
import { Disc3, Loader2, Music2, Piano, RefreshCw, Share2, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { leerAjustes, leer, guardar, borrarClave } from '@/core/storage/almacenamiento'
import { guardarAudio, leerAudio, borrarAudio } from '@/core/storage/audio'
import { generarMusica, consultarPista, type MotorSuno } from '@/core/ai/suno'
import { generarMusicaLyria, armarPromptLyria, type MotorLyria } from '@/core/ai/lyria'
import { Boton } from '@/components/ui/Boton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { compartir, vibrar } from '@/core/natives/plataforma'
import {
  ESTILOS_RAPIDOS,
  MODELOS_LYRIA,
  type Cancion,
  type Letra,
  type MotorMusica,
  type PestannaId,
} from '@/types'

// ═══════════════════════════════════════════════════════════
// 🎧 MÚSICA (FASE 3 — motor doble → triple): elegí una letra
// de la biblioteca (o pegá una), definí el estilo y elegí motor:
//   🎵 Suno — 2 versiones por pedido, polling en vivo (API paga)
//   🎹 Google Lyria — canción o clip de 30s, con tu API key de
//      Google AI Studio (la misma cuenta Google del Firebase)
// Si un motor se queda sin créditos, cambiás al otro y seguís.
// ═══════════════════════════════════════════════════════════

const CLAVE_CANCIONES = 'canciones'
const CLAVE_LETRA_A_MUSICALIZAR = 'letraMusicalizar'
const SEGUNDOS_ENTRE_POLL = 6

function formatoDuracion(seg?: number): string {
  if (!seg || seg <= 0) return ''
  const m = Math.floor(seg / 60)
  const s = Math.round(seg % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Reproductor que resuelve el audio venga de CDN (Suno) o IndexedDB (Lyria). */
function Reproductor({ cancion }: { cancion: Cancion }) {
  const [src, setSrc] = useState<string | null>(cancion.urlAudio ?? null)
  useEffect(() => {
    let vivo = true
    if (!src && cancion.audioLocal) {
      leerAudio(cancion.id).then((url) => {
        if (vivo) setSrc(url)
      })
    }
    return () => {
      vivo = false
    }
  }, [cancion.id, cancion.audioLocal, src])
  if (!src) {
    return (
      <p className="mt-2.5 flex items-center gap-1.5 text-xs text-neutral-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> cargando el audio…
      </p>
    )
  }
  return <audio controls preload="none" src={src} className="mt-2.5 h-10 w-full" />
}

export function MusicaView({ irA }: { irA: (p: PestannaId) => void }) {
  const { mostrar } = useToast()
  const ajustes = leerAjustes()
  const letras = leer<Letra[]>('letras', [])

  // Formulario
  const [motor, setMotor] = useState<MotorMusica>(() => (ajustes.tokenSuno ? 'suno' : ajustes.tokenLyria ? 'lyria' : 'suno'))
  const [letraId, setLetraId] = useState('')
  const [texto, setTexto] = useState('')
  const [titulo, setTitulo] = useState('')
  const [estilo, setEstilo] = useState('')
  const [instrumental, setInstrumental] = useState(false)
  const [cargando, setCargando] = useState(false)

  // Biblioteca de canciones
  const [canciones, setCanciones] = useState<Cancion[]>(() => leer<Cancion[]>(CLAVE_CANCIONES, []))
  const alVivo = useRef(true)

  // Persistencia de la biblioteca
  useEffect(() => {
    guardar(CLAVE_CANCIONES, canciones)
  }, [canciones])

  // Llegada desde CrearView → «Musicalizar con Suno»: trae la
  // letra preseleccionada una sola vez y limpia la clave.
  useEffect(() => {
    const idPendiente = leer<string>(CLAVE_LETRA_A_MUSICALIZAR, '')
    if (!idPendiente) return
    borrarClave(CLAVE_LETRA_A_MUSICALIZAR)
    const letra = letras.find((l) => l.id === idPendiente)
    if (letra) {
      setLetraId(letra.id)
      setTexto(letra.texto)
      setTitulo(letra.titulo)
      setEstilo([letra.genero, letra.mood].filter(Boolean).join(', ').toLowerCase())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polling: mientras haya pistas 'generando' (Suno), consultar cada N segundos.
  // Las canciones de Lyria llegan completas de una — no necesitan polling.
  useEffect(() => {
    alVivo.current = true
    function tick() {
      if (!alVivo.current) return
      const pendientes = leer<Cancion[]>(CLAVE_CANCIONES, []).filter(
        (c) => c.estado === 'generando' && c.motor !== 'lyria',
      )
      if (!pendientes.length || !ajustes.tokenSuno) return
      const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
      pendientes.forEach(async (c) => {
        try {
          const pista = await consultarPista(motor, c.taskId, c.titulo)
          if (!alVivo.current) return
          setCanciones((cs) =>
            cs.map((x) =>
              x.id === c.id
                ? {
                    ...x,
                    estado: pista.estado,
                    urlAudio: pista.urlAudio ?? x.urlAudio,
                    urlPortada: pista.urlPortada ?? x.urlPortada,
                    duracionSeg: pista.duracionSeg ?? x.duracionSeg,
                    titulo: pista.titulo || x.titulo,
                    error: pista.error,
                  }
                : x,
            ),
          )
          if (pista.estado === 'lista') {
            vibrar()
            mostrar(`¡«${c.titulo}» lista! 🎧`, 'ok')
          }
        } catch {
          /* sigue generando — el próximo tick reintenta */
        }
      })
    }
    const intervalo = window.setInterval(tick, SEGUNDOS_ENTRE_POLL * 1000)
    tick()
    return () => {
      alVivo.current = false
      window.clearInterval(intervalo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ajustes.tokenSuno])

  function elegirLetra(id: string) {
    setLetraId(id)
    const letra = letras.find((l) => l.id === id)
    if (letra) {
      setTexto(letra.texto)
      setTitulo(letra.titulo)
      setEstilo([letra.genero, letra.mood].filter(Boolean).join(', ').toLowerCase())
    } else {
      setTexto('')
      setTitulo('')
      setEstilo('')
    }
  }

  async function generar() {
    if (cargando) return
    if (motor === 'lyria') {
      await generarConLyria()
      return
    }
    await generarConSuno()
  }

  async function generarConSuno() {
    if (!ajustes.tokenSuno) {
      irA('ajustes')
      mostrar('Configurá tu clave de Suno en Ajustes', 'info', 3200)
      return
    }
    const textoLimpio = texto.trim()
    if (!instrumental && textoLimpio.length < 20) {
      mostrar('Elegí una letra de tu biblioteca o pegála (mínimo unas líneas)', 'info', 3500)
      return
    }
    const tituloLimpio = titulo.trim() || 'Mi canción'
    const estiloLimpio = estilo.trim() || 'pop latino'
    vibrar()
    setCargando(true)
    try {
      const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
      const pistas = await generarMusica(motor, {
        letra: textoLimpio,
        estilo: estiloLimpio,
        titulo: tituloLimpio,
        instrumental,
        modelo: ajustes.modeloSuno,
      })
      const nuevas: Cancion[] = pistas
        .filter((p) => p.taskId)
        .map((p, i) => ({
          id: `${Date.now()}-${i}`,
          taskId: p.taskId,
          titulo: p.titulo || tituloLimpio,
          estilo: estiloLimpio,
          letraId: letraId || undefined,
          instrumental,
          modelo: ajustes.modeloSuno,
          motor: 'suno' as const,
          estado: 'generando' as const,
          fecha: Date.now(),
        }))
      if (!nuevas.length) throw new Error('La API no devolvió pistas')
      setCanciones((cs) => [...nuevas, ...cs])
      mostrar(`${nuevas.length} ${nuevas.length === 1 ? 'versión' : 'versiones'} en el horno 🔥 — llegan en 1 a 3 min`, 'ok', 4000)
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló Suno', 'error', 4500)
    } finally {
      setCargando(false)
    }
  }

  /** Google Lyria: la llamada espera hasta que el MP3 llega completo
   * (sincrónica — hasta ~3 min para canción entera). */
  async function generarConLyria() {
    if (!ajustes.tokenLyria) {
      irA('ajustes')
      mostrar('Configurá tu API key de Google (Lyria) en Ajustes', 'info', 3200)
      return
    }
    const textoLimpio = texto.trim()
    if (!instrumental && textoLimpio.length < 20) {
      mostrar('Elegí una letra de tu biblioteca o pegála (mínimo unas líneas)', 'info', 3500)
      return
    }
    const tituloLimpio = titulo.trim() || 'Mi canción'
    const estiloLimpio = estilo.trim() || 'pop latino'
    vibrar()
    setCargando(true)
    try {
      const motorL: MotorLyria = { token: ajustes.tokenLyria }
      const resultado = await generarMusicaLyria(motorL, {
        prompt: armarPromptLyria({
          estilo: estiloLimpio,
          titulo: tituloLimpio,
          letra: textoLimpio,
          instrumental,
        }),
        modelo: ajustes.modeloLyria,
      })
      const id = `${Date.now()}`
      await guardarAudio(id, resultado.audioBase64, resultado.mime)
      const nueva: Cancion = {
        id,
        taskId: '',
        titulo: tituloLimpio,
        estilo: estiloLimpio,
        letraId: letraId || undefined,
        instrumental,
        modelo: ajustes.modeloLyria,
        motor: 'lyria',
        audioLocal: true,
        estado: 'lista',
        fecha: Date.now(),
      }
      setCanciones((cs) => [nueva, ...cs])
      vibrar()
      mostrar(`¡«${tituloLimpio}» lista! 🎹`, 'ok')
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló Lyria', 'error', 5000)
    } finally {
      setCargando(false)
    }
  }

  function borrar(id: string) {
    vibrar('media')
    const cancion = canciones.find((c) => c.id === id)
    if (cancion?.audioLocal) void borrarAudio(id)
    setCanciones((cs) => cs.filter((c) => c.id !== id))
    mostrar('Canción eliminada', 'info')
  }

  async function compartirCancion(c: Cancion) {
    const motorTxt = c.motor === 'lyria' ? 'Lyria de Google' : 'Suno'
    const ok = await compartir({
      titulo: c.titulo,
      texto: `🎵 «${c.titulo}» — hecha con MusicTrack (letra: Claude · música: ${motorTxt})`,
      url: c.motor === 'lyria' ? undefined : c.urlAudio,
    })
    if (!ok) mostrar('Compartir no disponible en esta plataforma', 'info')
  }

  const claseInput =
    'h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors focus:border-acento dark:border-neutral-700'
  const generando = canciones.filter((c) => c.estado === 'generando').length
  const tokenDelMotor = motor === 'suno' ? ajustes.tokenSuno : ajustes.tokenLyria
  const modeloActual = motor === 'suno' ? `Suno ${(ajustes.modeloSuno ?? 'V4_5').replace('_', '.')}` : (MODELOS_LYRIA.find((m) => m.id === ajustes.modeloLyria)?.etiqueta ?? ajustes.modeloLyria)
  const etiquetaModelo = MODELOS_LYRIA.find((m) => m.id === ajustes.modeloLyria)?.etiqueta.split(' · ')[0] ?? 'Lyria'

  return (
    <div className="space-y-4">
      {/* Formulario */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
          <Disc3 className="h-4 w-4" /> Nueva canción
        </h2>

        {/* Selector de motor (triple motor): Suno 🎵 o Google Lyria 🎹 */}
        <div
          role="tablist"
          aria-label="Motor de música"
          className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <button
            type="button"
            role="tab"
            aria-selected={motor === 'suno'}
            onClick={() => setMotor('suno')}
            className={`flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
              motor === 'suno'
                ? 'bg-white text-acento shadow-sm dark:bg-neutral-800'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            🎵 Suno
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={motor === 'lyria'}
            onClick={() => setMotor('lyria')}
            className={`flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
              motor === 'lyria'
                ? 'bg-white text-acento shadow-sm dark:bg-neutral-800'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            <Piano className="h-4 w-4" /> Google Lyria
          </button>
        </div>

        {!tokenDelMotor ? (
          motor === 'suno' ? (
            <EmptyState
              icono={<Music2 className="h-7 w-7" />}
              titulo="Falta tu clave de Suno"
              descripcion="Claude ya escribe las letras; para convertirlas en canción necesitás el segundo motor: tu clave de Suno API (se configura una vez en Ajustes, igual que el token de Claude). Mientras tanto, desde cualquier letra guardada podés usar «Probar gratis en suno.com» — 50 créditos diarios con tu cuenta Google."
              accion={<Boton onClick={() => irA('ajustes')}>Ir a Ajustes</Boton>}
            />
          ) : (
            <EmptyState
              icono={<Piano className="h-7 w-7" />}
              titulo="Falta tu API key de Google"
              descripcion="Lyria es el motor alternativo: la misma cuenta Google de tu Firebase, con API key de Google AI Studio (aistudio.google.com). Útil cuando Suno se queda sin créditos — cambiás de motor y seguís creando."
              accion={<Boton onClick={() => irA('ajustes')}>Ir a Ajustes</Boton>}
            />
          )
        ) : (
          <div className="space-y-3">
            {letras.length > 0 && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  Letra de tu biblioteca
                </span>
                <select value={letraId} onChange={(e) => elegirLetra(e.target.value)} className={claseInput}>
                  <option value="">— pegar / escribir otra letra —</option>
                  {letras.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.titulo}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!instrumental && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  Letra — editá lo que quieras
                </span>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={'[Verso 1]\nLa noche en Lima no me deja dormir…\n\n[Coro]\n…'}
                  rows={8}
                  className="min-h-[150px] w-full resize-y rounded-xl border border-neutral-300 bg-transparent p-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Título</span>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} placeholder="Mi canción" className={claseInput} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Modelo</span>
                <input value={modeloActual} readOnly className={`${claseInput} opacity-60`} />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                Estilo (géneros, instrumentos, BPM, mood — lo que el motor lee bien)
              </span>
              <input
                value={estilo}
                onChange={(e) => setEstilo(e.target.value)}
                maxLength={200}
                placeholder="reggaetón, dembow, perreo, 96 bpm"
                className={claseInput}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {ESTILOS_RAPIDOS.slice(0, 4).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEstilo(e)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    estilo === e
                      ? 'border-acento bg-acento text-white'
                      : 'border-neutral-300 bg-transparent text-neutral-500 hover:border-acento/60 dark:border-neutral-700 dark:text-neutral-400'
                  }`}
                >
                  {e.split(',')[0]}
                </button>
              ))}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={instrumental}
              onClick={() => setInstrumental((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5 text-left dark:border-neutral-800"
            >
              <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                🎛️ Solo instrumental (sin voz)
              </span>
              <span
                className={`relative h-6 w-11 rounded-full transition-colors ${instrumental ? 'bg-acento' : 'bg-neutral-300 dark:bg-neutral-700'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${instrumental ? 'left-[22px]' : 'left-0.5'}`}
                />
              </span>
            </button>

            <Boton className="w-full" icono={<Wand2 className="h-4 w-4" />} onClick={generar} cargando={cargando}>
              {cargando
                ? motor === 'lyria'
                  ? 'Lyria está componiendo… (hasta 3 min)'
                  : 'Enviando a Suno…'
                : motor === 'lyria'
                  ? `Generar con ${etiquetaModelo}`
                  : 'Generar música'}
            </Boton>
            <p className="text-center text-[11px] text-neutral-400">
              {motor === 'suno'
                ? 'Cada pedido crea 2 versiones · tarda 1 a 3 min · modelo ' + (ajustes.modeloSuno ?? 'V4_5').replace('_', '.')
                : 'Lyria devuelve la canción completa · requiere billing en Google AI Studio'}
            </p>
          </div>
        )}
      </section>

      {/* Biblioteca de canciones */}
      <section aria-label="Biblioteca de canciones">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            {canciones.length} {canciones.length === 1 ? 'canción' : 'canciones'}
            {generando > 0 && <span className="ml-2 text-acento">· {generando} en el horno</span>}
          </h3>
          {canciones.length > 0 && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-acento"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refrescar
            </button>
          )}
        </div>

        {canciones.length === 0 ? (
          <EmptyState
            icono={<Disc3 className="h-7 w-7" />}
            titulo="Todavía no hay canciones"
            descripcion="Elegí una letra de tu biblioteca, definí el estilo y elegí motor: Suno (2 versiones por pedido) o Google Lyria (canción completa de una). Claude la escribió, el motor que elijas la canta."
          />
        ) : (
          <ul className="space-y-2.5">
            {canciones.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex items-start gap-3">
                  {c.urlPortada ? (
                    <img src={c.urlPortada} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-acento/10 text-acento">
                      <Disc3 className={`h-6 w-6 ${c.estado === 'generando' ? 'animate-spin' : ''}`} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-semibold text-neutral-900 dark:text-white">{c.titulo}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          c.estado === 'lista'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : c.estado === 'error'
                              ? 'bg-red-500/15 text-red-500'
                              : 'bg-acento/15 text-acento'
                        }`}
                      >
                        {c.estado === 'lista' ? '✓ Lista' : c.estado === 'error' ? 'Error' : 'Generando'}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {c.motor === 'lyria' ? '🎹 Lyria' : '🎵 Suno'} · {c.estilo}
                      {c.duracionSeg ? ` · ${formatoDuracion(c.duracionSeg)}` : ''}
                      {c.instrumental ? ' · instrumental' : ''}
                    </p>

                    {c.estado === 'generando' && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Suno está componiendo… (1 a 3 min)
                      </p>
                    )}
                    {c.estado === 'error' && (
                      <p className="mt-2 text-xs text-red-500">{c.error ?? 'La generación falló — probá de nuevo'}</p>
                    )}
                    {c.estado === 'lista' && <Reproductor cancion={c} />}
                  </div>
                </div>

                {c.estado === 'lista' && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Boton variante="secundario" tamano="sm" icono={<Share2 className="h-3.5 w-3.5" />} onClick={() => compartirCancion(c)}>
                      Compartir
                    </Boton>
                    <Boton variante="fantasma" tamano="sm" icono={<Trash2 className="h-3.5 w-3.5" />} onClick={() => borrar(c.id)}>
                      Eliminar
                    </Boton>
                  </div>
                )}
                {c.estado !== 'lista' && (
                  <Boton variante="fantasma" tamano="sm" className="mt-2 w-full" icono={<Trash2 className="h-3.5 w-3.5" />} onClick={() => borrar(c.id)}>
                    Quitar de la lista
                  </Boton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Nota de motores */}
      {canciones.length === 0 && (tokenDelMotor || ajustes.tokenLyria) && (
        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-neutral-400">
          <Sparkles className="h-3 w-3" /> Motor de música doble: Suno 🎵 o Google Lyria 🎹 — cambiás cuando quieras
        </p>
      )}
    </div>
  )
}
