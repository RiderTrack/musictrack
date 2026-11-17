import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Loader2,
  Package,
  Rocket,
  Sparkles,
  Upload,
} from 'lucide-react'
import type { Cancion } from '@/types'
import { portadaDe } from '@/types'
import { leer, guardar, leerAjustes } from '@/core/storage/almacenamiento'
import { actualizarCancion } from '@/core/storage/canciones'
import { leerAudio } from '@/core/storage/audio'
import { necesitaRespaldo, respaldarCancion } from '@/core/storage/respaldo'
import { generarPortadaIA } from '@/core/imagenes/portadaIA'
import { recortarYReducir } from '@/core/imagenes/imagen'
import { guardarArchivoEnDescargas, nombreMp3, nombreZipLanzamiento } from '@/core/natives/descargas'
import { abrirURL, copiarTexto, tomarFoto, vibrar } from '@/core/natives/plataforma'
import { letraDeCancion } from '@/components/player/comunes'
import { Boton } from '@/components/ui/Boton'
import { Modal } from '@/components/ui/Modal'
import {
  armarZip,
  GENEROS,
  generoSugerido,
  IDIOMAS,
  kbpsDe,
  NOMBRE_DATOS_ZIP,
  NOMBRE_PORTADA_ZIP,
  portadaLanzamiento,
  textoMetadatos,
  validarLanzamiento,
  type DatosLanzamiento,
} from '@/core/publicacion/lanzamiento'

// ═══════════════════════════════════════════════════════════
// 🚀 v0.24.0 — FASE 20 (pedido de Rudy): PUBLICAR EN SPOTIFY.
// Spotify no deja subir canciones directo: se entra por un
// distribuidor (DistroKid, ONCE, RouteNote…). Este asistente
// arma en 4 pasos TODO lo que el distribuidor le va a pedir:
//   1. LOS DATOS del lanzamiento (título, artista, género…)
//   2. LA PORTADA cuadrada de 3000×3000 (el estándar)
//   3. EL PAQUETE .zip — MP3 + portada + datos, listo
//   4. LA GUÍA — a dónde subirlo, qué cuesta y las reglas de
//      la IA, contadas honestas (verificado nov-2026)
// Todo local, sin gastar créditos.
// ═══════════════════════════════════════════════════════════

const ESTILO_INPUT =
  'h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors focus:border-acento dark:border-neutral-700'

const PASOS = ['La canción', 'La portada', 'El paquete', 'A dónde subirlo']

/** Distribuidores verificados nov-2026 (los links abren afuera). */
const DISTRIBUIDORES: Array<{
  nombre: string
  url: string
  precio: string
  detalle: string
  recomendado?: boolean
}> = [
  {
    nombre: 'ONCE',
    url: 'https://once.app',
    precio: '2 créditos por lanzamiento · 0% de regalías',
    detalle:
      'Hecho para canciones de Suno: subís el MP3 y la portada 3000×3000, y él arma todo — declara la IA por vos y asigna ISRC/UPC. Paga una vez por lanzamiento y queda vivo para siempre.',
    recomendado: true,
  },
  {
    nombre: 'DistroKid',
    url: 'https://distrokid.com',
    precio: 'desde US$24.99/año · subidas ilimitadas',
    detalle:
      'El más usado de todos: pagás una vez al año y subís cuantas canciones quieras, quedándote con el 100% de las regalías. Su centro de ayuda dice que acepta música hecha con IA.',
  },
  {
    nombre: 'RouteNote',
    url: 'https://routenote.com',
    precio: 'GRATIS · se quedan el 15% de lo que genere',
    detalle: 'Para empezar sin gastar un sol: sube gratis a Spotify y demás tiendas, y ellos se quedan un pedazo de lo que la canción genere. También tienen plan pago.',
  },
  {
    nombre: 'TuneCore',
    url: 'https://tunecore.com',
    precio: 'desde ~US$24.99/año',
    detalle: 'El veterano: buena opción si querés también repartir a tiendas más chicas. Sus planes bajan las canciones si no renovás.',
  },
]

function bytesLegibles(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

export function ModalPublicar({
  cancion,
  onCerrar,
  aviso,
}: {
  cancion: Cancion | null
  onCerrar: () => void
  aviso: (mensaje: string, tipo?: 'ok' | 'error' | 'info', duracionMs?: number) => void
}) {
  const [paso, setPaso] = useState(1)
  const [datos, setDatos] = useState<DatosLanzamiento>({
    titulo: '',
    artista: '',
    compositor: '',
    generoId: '',
    idioma: 'es',
    fecha: '',
    explicito: false,
  })
  /** la mejor fuente de portada disponible AHORA (512 de la app,
   * foto grande recién elegida, o la del CDN de Suno) */
  const [fuentePortada, setFuentePortada] = useState<string | undefined>()
  const [portadaBlob, setPortadaBlob] = useState<Blob | null>(null)
  const [portadaDesde, setPortadaDesde] = useState(0)
  const [preparando, setPreparando] = useState(false)
  const [haciendoIA, setHaciendoIA] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [consiguiendo, setConsiguiendo] = useState(false)
  const [armando, setArmando] = useState(false)
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null)

  const c = cancion
  const ajustes = leerAjustes()
  const faltan = validarLanzamiento(datos).faltan
  const listoElPaquete = !!audioBlob && !!portadaBlob && faltan.length === 0

  // ── al abrir: precargar todo lo que ya tiene la canción ──
  useEffect(() => {
    if (!c) return
    setPaso(1)
    setGuardadoEn(null)
    setPortadaBlob(null)
    setPortadaDesde(0)
    setAudioBlob(null)
    setFuentePortada(portadaDe(c))
    setDatos((d) => ({
      ...d,
      titulo: c.titulo,
      generoId: generoSugerido(c.estilo),
      idioma: c.instrumental ? 'instrumental' : 'es',
      artista: leer<string>('artista-lanzamiento', ''),
      compositor: leer<string>('compositor-lanzamiento', ''),
    }))
    // el audio SOLO si ya vive en el dispositivo (sin gastar datos)
    void (async () => {
      if (c.audioLocal || c.respaldada) {
        try {
          const src = await leerAudio(c.id)
          if (src) setAudioBlob(await (await fetch(src)).blob())
        } catch {
          /* queda el botón del paso 3 */
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id])

  function set<D extends keyof DatosLanzamiento>(campo: D, valor: DatosLanzamiento[D]) {
    setDatos((d) => ({ ...d, [campo]: valor }))
  }

  /** El artista y el compositor se recuerdan: el próximo
   * lanzamiento ya llega cargado. */
  useEffect(() => {
    if (datos.artista.trim()) guardar('artista-lanzamiento', datos.artista.trim())
    if (datos.compositor.trim()) guardar('compositor-lanzamiento', datos.compositor.trim())
  }, [datos.artista, datos.compositor])

  // ── paso 2: preparar la portada de 3000×3000 ─────────────
  async function prepararPortada() {
    if (!fuentePortada || preparando) return
    vibrar('ligera')
    setPreparando(true)
    try {
      const r = await portadaLanzamiento(fuentePortada)
      setPortadaBlob(r.blob)
      setPortadaDesde(r.desdeAncho)
      vibrar()
      aviso('Portada de 3000×3000 lista 🖼️', 'ok')
    } catch (e) {
      aviso(e instanceof Error ? e.message : 'no pude preparar la portada', 'error', 5000)
    } finally {
      setPreparando(false)
    }
  }

  /** Portada nueva con IA (gratis, pollinations): se guarda como
   * portada de la canción en toda la app, igual que en la
   * Biblioteca — y queda como fuente para el 3000×3000. */
  async function portadaNuevaIA() {
    if (!c || haciendoIA) return
    vibrar('ligera')
    setHaciendoIA(true)
    try {
      const nueva = await generarPortadaIA({ titulo: c.titulo, estilo: c.estilo })
      actualizarCancion(c.id, { portadaPersonal: nueva })
      setFuentePortada(nueva)
      setPortadaBlob(null) // hay que re-preparar con la nueva
      aviso('Portada nueva lista — ahora preparala para Spotify', 'ok', 4000)
    } catch (e) {
      aviso(e instanceof Error ? e.message : 'la IA de portadas no respondió', 'error', 5000)
    } finally {
      setHaciendoIA(false)
    }
  }

  /** Foto de la galería: queda como portada de la canción (512,
   * como toda la app) PERO el lanzamiento usa la versión grande
   * de 1200px para que el 3000×3000 salga con más filo. */
  async function portadaDeGaleria() {
    if (!c) return
    vibrar('ligera')
    const foto = await tomarFoto(90)
    if (!foto) return // canceló
    const grande = await recortarYReducir(foto, 1200, 0.9)
    const chica = await recortarYReducir(foto, 512, 0.85)
    if (!grande || !chica) {
      aviso('No pude procesar esa imagen — probá con otra', 'error', 4000)
      return
    }
    actualizarCancion(c.id, { portadaPersonal: chica })
    setFuentePortada(grande)
    setPortadaBlob(null)
    aviso('Portada elegida — ahora preparala para Spotify', 'ok', 4000)
  }

  // ── paso 3: conseguir el audio si falta ──────────────────
  async function conseguirAudio() {
    if (!c || consiguiendo) return
    vibrar('ligera')
    setConsiguiendo(true)
    try {
      if (!(c.audioLocal || c.respaldada) && necesitaRespaldo(c)) await respaldarCancion(c)
      const src = (c.audioLocal || c.respaldada ? await leerAudio(c.id) : null) ?? (c.urlAudio ?? null)
      if (!src) throw new Error('no pude conseguir el audio')
      const blob = await (await fetch(src)).blob()
      if (!blob.size) throw new Error('el audio llegó vacío')
      setAudioBlob(blob)
      aviso('Audio conseguido 💾', 'ok')
    } catch {
      aviso('No pude conseguir el audio — revisá tu conexión y probá de nuevo', 'error', 5000)
    } finally {
      setConsiguiendo(false)
    }
  }

  // ── paso 3: armar y guardar el .zip ──────────────────────
  async function armarPaquete() {
    if (!c || armando || !audioBlob || !portadaBlob) return
    vibrar()
    setArmando(true)
    try {
      const texto = textoMetadatos(datos, {
        estilo: c.estilo,
        version: c.version,
        duracionSeg: c.duracionSeg,
        bitrateKbps: kbpsDe(audioBlob, c.duracionSeg),
        instrumental: c.instrumental,
        letra: letraDeCancion(c),
      })
      const zip = armarZip([
        { nombre: nombreMp3(c.titulo, c.version), bytes: new Uint8Array(await audioBlob.arrayBuffer()) },
        { nombre: NOMBRE_PORTADA_ZIP, bytes: new Uint8Array(await portadaBlob.arrayBuffer()) },
        { nombre: NOMBRE_DATOS_ZIP, bytes: new TextEncoder().encode(texto) },
      ])
      const res = await guardarArchivoEnDescargas(
        new Blob([zip], { type: 'application/zip' }),
        nombreZipLanzamiento(c.titulo),
        ajustes.carpetaDescargas,
      )
      if (res.ok) {
        setGuardadoEn(res.ruta)
        aviso(`Paquete guardado en ${res.ruta} 📦`, 'ok', 6000)
      } else {
        aviso(`No pude guardar el paquete: ${res.error}`, 'error', 5000)
      }
    } catch {
      aviso('No pude armar el paquete — probá de nuevo', 'error', 5000)
    } finally {
      setArmando(false)
    }
  }

  async function copiarDatos() {
    if (!c) return
    const texto = textoMetadatos(datos, {
      estilo: c.estilo,
      version: c.version,
      duracionSeg: c.duracionSeg,
      bitrateKbps: kbpsDe(audioBlob ?? new Blob(), c.duracionSeg),
      instrumental: c.instrumental,
      letra: letraDeCancion(c),
    })
    if (await copiarTexto(texto)) aviso('Datos copiados — pegalos en el formulario de tu distribuidor 📋', 'ok', 4500)
    else aviso('No pude copiar — los datos van dentro del .zip igual', 'info', 4500)
  }

  if (!c) return null

  const generoNombre = GENEROS.find((g) => g.id === datos.generoId)?.nombre

  return (
    <Modal abierto={!!cancion} onCerrar={onCerrar} titulo="🚀 Publicar en Spotify">
      {/* el caminito de pasos */}
      <div className="mb-4 flex items-center gap-1">
        {PASOS.map((p, i) => (
          <div key={p} className="flex flex-1 flex-col gap-1">
            <div
              className={`h-1.5 rounded-full transition-colors ${
                i + 1 <= paso ? 'bg-acento' : 'bg-neutral-200 dark:bg-neutral-800'
              }`}
            />
            <span
              className={`truncate text-[9px] font-bold uppercase tracking-wide ${
                i + 1 === paso ? 'text-acento' : 'text-neutral-400'
              }`}
            >
              {i + 1}. {p}
            </span>
          </div>
        ))}
      </div>

      {/* ═══ PASO 1 — LOS DATOS ═══ */}
      {paso === 1 && (
        <div className="space-y-3.5">
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Esto es lo primero que te pide cualquier distribuidor. Tu nombre de artista se recuerda: el próximo
            lanzamiento ya llega cargado.
          </p>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
              Título de la canción
            </span>
            <input className={ESTILO_INPUT} value={datos.titulo} maxLength={100} onChange={(e) => set('titulo', e.target.value)} placeholder="Como se va a ver en Spotify" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
              Tu nombre de artista
            </span>
            <input className={ESTILO_INPUT} value={datos.artista} maxLength={80} onChange={(e) => set('artista', e.target.value)} placeholder="Ej: Rudy — con el mismo vas a reclamar tu perfil" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
              Compositor / letrista
            </span>
            <input className={ESTILO_INPUT} value={datos.compositor} maxLength={80} onChange={(e) => set('compositor', e.target.value)} placeholder="Quién escribió la letra (suele ser tu nombre)" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-neutral-500 dark:text-neutral-400">Género</span>
              <select className={ESTILO_INPUT} value={datos.generoId} onChange={(e) => set('generoId', e.target.value)}>
                <option value="">Elegí…</option>
                {GENEROS.filter((g) => g.id !== 'instrumental' || c.instrumental).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-neutral-500 dark:text-neutral-400">Idioma</span>
              <select className={ESTILO_INPUT} value={datos.idioma} onChange={(e) => set('idioma', e.target.value)} disabled={c.instrumental}>
                {IDIOMAS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                Fecha de salida (opcional)
              </span>
              <input type="date" className={ESTILO_INPUT} value={datos.fecha} onChange={(e) => set('fecha', e.target.value)} />
            </label>
            <label className="flex h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-neutral-300 px-3 dark:border-neutral-700">
              <input type="checkbox" className="h-4 w-4 accent-acento" checked={datos.explicito} onChange={(e) => set('explicito', e.target.checked)} />
              <span className="text-sm text-neutral-600 dark:text-neutral-300">Tiene lenguaje explícito</span>
            </label>
          </div>
          {datos.fecha && (
            <p className="text-[11px] leading-relaxed text-neutral-400">
              Elegir fecha sirve para planear el lanzamiento — pero si es tu primera canción, dejala vacía y saldrá lo
              antes posible (la aprobación tarda unos días).
            </p>
          )}
          <Boton
            variante="primario"
            className="w-full"
            disabled={faltan.length > 0}
            icono={<ArrowRight className="h-4 w-4" />}
            onClick={() => setPaso(2)}
          >
            {faltan.length > 0 ? `Falta ${faltan[0]}` : 'Continuar'}
          </Boton>
        </div>
      )}

      {/* ═══ PASO 2 — LA PORTADA ═══ */}
      {paso === 2 && (
        <div className="space-y-3.5">
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Spotify acepta portadas de 640px a 10000px, pero el estándar que piden los distribuidores es cuadrada de{' '}
            <b>3000×3000 JPG</b>. Te la preparo acá mismo.
          </p>
          <div className="flex items-start gap-3">
            {fuentePortada ? (
              <img src={fuentePortada} alt="Portada" className="h-24 w-24 shrink-0 rounded-xl object-cover ring-1 ring-neutral-200 dark:ring-neutral-800" />
            ) : (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-3xl dark:bg-neutral-800">
                🖼️
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              {portadaBlob ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> Portada lista — 3000×3000 JPG ({bytesLegibles(portadaBlob.size)})
                  </p>
                  {portadaDesde > 0 && portadaDesde < 1500 && (
                    <p className="mt-1 text-[10px] leading-relaxed text-emerald-700/80 dark:text-emerald-300/70">
                      Partió de {portadaDesde}px: de cerca se ve suave. Si querés máximo filo, elegí una foto grande o
                      pedile otra a la IA y preparala de nuevo.
                    </p>
                  )}
                </div>
              ) : (
                <Boton variante="primario" className="w-full" cargando={preparando} icono={preparando ? undefined : <Sparkles className="h-4 w-4" />} onClick={() => void prepararPortada()} disabled={!fuentePortada}>
                  {preparando ? 'Preparando…' : `Preparar 3000×3000${fuentePortada ? '' : ' (faltó la portada)'}`}
                </Boton>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Boton variante="secundario" tamano="sm" cargando={haciendoIA} icono={<Sparkles className="h-3.5 w-3.5" />} onClick={() => void portadaNuevaIA()}>
                  Otra con IA
                </Boton>
                <Boton variante="secundario" tamano="sm" icono={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => void portadaDeGaleria()}>
                  De la galería
                </Boton>
              </div>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-neutral-400">
            «Otra con IA» y «De la galería» también guardan la portada en tu canción — se ve en toda la app y viaja en
            el MP3, como siempre.
          </p>
          <div className="flex gap-2">
            <Boton variante="secundario" icono={<ArrowLeft className="h-4 w-4" />} onClick={() => setPaso(1)}>
              Atrás
            </Boton>
            <Boton variante="primario" className="flex-1" disabled={!portadaBlob} icono={<ArrowRight className="h-4 w-4" />} onClick={() => setPaso(3)}>
              {portadaBlob ? 'Continuar' : 'Prepará la portada'}
            </Boton>
          </div>
        </div>
      )}

      {/* ═══ PASO 3 — EL PAQUETE ═══ */}
      {paso === 3 && (
        <div className="space-y-3.5">
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            El paquete es un <b>.zip</b> con las tres cosas que te piden: la canción, la portada y los datos. Lo armás
            acá y lo subís (o adjuntás) donde elijas en el paso siguiente.
          </p>
          <ul className="space-y-2">
            <li className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 p-2.5 dark:border-neutral-800">
              <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                {audioBlob ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border-2 border-neutral-300 dark:border-neutral-700" />
                )}
                Audio MP3{audioBlob ? ` — ${bytesLegibles(audioBlob.size)}` : ''}
              </span>
              {!audioBlob && (
                <Boton variante="secundario" tamano="sm" cargando={consiguiendo} onClick={() => void conseguirAudio()}>
                  Conseguirlo
                </Boton>
              )}
            </li>
            <li className="flex items-center gap-2 rounded-xl border border-neutral-200 p-2.5 text-xs font-semibold text-neutral-700 dark:border-neutral-800 dark:text-neutral-200">
              {portadaBlob ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border-2 border-neutral-300 dark:border-neutral-700" />
              )}
              Portada 3000×3000{portadaBlob ? ` — ${bytesLegibles(portadaBlob.size)}` : ''}
            </li>
            <li className="flex items-center gap-2 rounded-xl border border-neutral-200 p-2.5 text-xs font-semibold text-neutral-700 dark:border-neutral-800 dark:text-neutral-200">
              {faltan.length === 0 ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border-2 border-neutral-300 dark:border-neutral-700" />
              )}
              Datos — «{datos.titulo || 'sin título'}» · {datos.artista || 'sin artista'}
              {generoNombre ? ` · ${generoNombre}` : ''}
            </li>
          </ul>
          {guardadoEn ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <p className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Paquete guardado en {guardadoEn}
              </p>
              <p className="mt-1 font-normal text-emerald-700/80 dark:text-emerald-300/70">
                Adentro: el MP3, {NOMBRE_PORTADA_ZIP} y {NOMBRE_DATOS_ZIP}. Seguí al último paso para saber a dónde
                subirlo.
              </p>
            </div>
          ) : (
            <Boton variante="primario" className="w-full" cargando={armando} disabled={!listoElPaquete} icono={armando ? undefined : <Package className="h-4 w-4" />} onClick={() => void armarPaquete()}>
              {armando ? 'Armando…' : listoElPaquete ? '📦 Armar el paquete .zip' : 'Falta ' + (faltan[0] ?? (audioBlob ? 'la portada' : 'el audio'))}
            </Boton>
          )}
          <Boton variante="fantasma" tamano="sm" className="w-full" icono={<Upload className="h-3.5 w-3.5" />} onClick={() => void copiarDatos()}>
            Copiar los datos (para pegar en el formulario)
          </Boton>
          <div className="flex gap-2">
            <Boton variante="secundario" icono={<ArrowLeft className="h-4 w-4" />} onClick={() => setPaso(2)}>
              Atrás
            </Boton>
            <Boton variante="primario" className="flex-1" disabled={!guardadoEn} icono={<ArrowRight className="h-4 w-4" />} onClick={() => setPaso(4)}>
              {guardadoEn ? 'A dónde lo subo →' : 'Guardá el paquete primero'}
            </Boton>
          </div>
        </div>
      )}

      {/* ═══ PASO 4 — LA GUÍA ═══ */}
      {paso === 4 && (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Ya tenés el paquete. Ahora elegí tu distribuidor — son las rutas más usadas en 2026 (precios verificados en
            noviembre de 2026):
          </p>
          <div className="space-y-2">
            {DISTRIBUIDORES.map((d) => (
              <div
                key={d.nombre}
                className={`rounded-xl border p-3 ${
                  d.recomendado
                    ? 'border-acento/40 bg-acento/5'
                    : 'border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {d.recomendado && <Rocket className="h-4 w-4 shrink-0 text-acento" />}
                    <span className="truncate text-sm font-bold text-neutral-900 dark:text-white">{d.nombre}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void abrirURL(d.url)}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-[10px] font-bold text-neutral-500 transition-colors hover:border-acento/40 hover:text-acento dark:border-neutral-700"
                  >
                    Abrir <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <p className="mt-0.5 text-[11px] font-bold text-acento">{d.precio}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">{d.detalle}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void abrirURL('https://aristake.com/digital-distribution-comparison')}
            className="w-full text-center text-[11px] font-semibold text-neutral-400 transition-colors hover:text-acento"
          >
            Comparación grande y siempre actualizada de 19 distribuidores (en inglés) →
          </button>

          {/* la verdad honesta antes de monetizar */}
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-xs font-black text-amber-600 dark:text-amber-400">⚠️ Antes de publicar, la verdad:</p>
            <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300/90">
              <li>
                <b>Suno da derechos comerciales solo con plan Pro/Premier</b> (y desde sep-2026, ligados a las
                descargas permitidas del mes). Con plan gratis no se puede monetizar — y suscribirse después no arregla
                las canciones viejas.
              </li>
              <li>
                Tus canciones salieron por <b>sunoapi.org</b> (pasarela no oficial de Suno): antes de monetizar, revisá
                los términos de esa pasarela. El distribuidor te va a hacer confirmar que sos dueño del 100%.
              </li>
              <li>
                Spotify <b>acepta música hecha con IA</b> — pero el distribuidor te lo pregunta: respondé la verdad.
              </li>
              <li>
                No publiques letras ni melodías ajenas (canciones de otros artistas): los distribuidores vetan cuentas
                por eso.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-xs font-black text-neutral-700 dark:text-neutral-200">
              Cuando tu canción ya esté en Spotify
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              Reclamá tu perfil de artista en{' '}
              <button
                type="button"
                onClick={() => void abrirURL('https://artists.spotify.com')}
                className="font-bold text-acento hover:underline"
              >
                artists.spotify.com
              </button>{' '}
              con el MISMO nombre de artista que pusiste acá («{datos.artista || 'tu artista'}»). Ahí ves tus oyentes
              en vivo, de dónde te escuchan y pedís que verifiquen tu perfil (el check azul).
            </p>
          </div>

          <div className="flex gap-2">
            <Boton variante="secundario" icono={<ArrowLeft className="h-4 w-4" />} onClick={() => setPaso(3)}>
              Atrás
            </Boton>
            <Boton variante="primario" className="flex-1" icono={<Check className="h-4 w-4" />} onClick={onCerrar}>
              Listo — ¡suerte con el lanzamiento! 🎧
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  )
}
