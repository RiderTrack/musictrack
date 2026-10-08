import { useState } from 'react'
import { RefreshCw, Save, Share2, Sparkles, Wand2 } from 'lucide-react'
import { leer, guardar } from '@/core/storage/almacenamiento'
import { preguntarIA } from '@/core/ai/claude'
import { Boton } from '@/components/ui/Boton'
import { EmptyState } from '@/components/ui/EmptyState'
import { CuerpoLetra } from '@/components/ui/CuerpoLetra'
import { useToast } from '@/components/ui/Toast'
import { compartir, vibrar } from '@/core/natives/plataforma'
import {
  AJUSTES_POR_DEFECTO,
  ESTRUCTURAS,
  GENEROS_MUSICALES,
  IDIOMAS,
  MOODS,
  type Ajustes,
  type Letra,
  type PestannaId,
} from '@/types'

// ═══════════════════════════════════════════════════════════
// ✍️ CREAR — generador de letras con IA (FASE 1 de MusicTrack).
// Patrón BYO-token de la familia Track: tema + género + idioma +
// mood + estructura → Claude escribe la letra con secciones
// etiquetadas. Desde acá se guarda en la biblioteca (Letras).
// ═══════════════════════════════════════════════════════════

const CLAVE_LETRAS = 'letras'

const SISTEMA_LETRISTA = [
  'Sos un letrista profesional latinoamericano con 20 años de experiencia escribiendo canciones.',
  'Escribís letras con rimas naturales, métrica cantable y lenguaje coloquial auténtico.',
  'Respondé SIEMPRE en este formato exacto, sin markdown, sin explicaciones y sin comillas:',
  'TITULO: <título creativo de la canción>',
  'Después, las secciones de la letra etiquetadas entre corchetes, una por línea',
  '(por ejemplo [Verso 1], [Pre-coro], [Coro], [Puente], [Outro] — las que correspondan).',
].join(' ')

export function CrearView({ irA }: { irA: (p: PestannaId) => void }) {
  const { mostrar } = useToast()
  const ajustes = leer<Ajustes>('ajustes', AJUSTES_POR_DEFECTO)

  const [tema, setTema] = useState('')
  const [genero, setGenero] = useState<string>(GENEROS_MUSICALES[0])
  const [idioma, setIdioma] = useState<string>(IDIOMAS[0])
  const [mood, setMood] = useState<string>(MOODS[1])
  const [estructura, setEstructura] = useState<string>('estandar')
  const [letra, setLetra] = useState<Letra | null>(null)
  const [cargando, setCargando] = useState(false)
  const [guardada, setGuardada] = useState(false)

  function interpretar(textoIA: string): Letra {
    const coincidencia = textoIA.match(/^TITULO\s*:\s*(.+)$/im)
    const cuerpo = textoIA.replace(/^TITULO\s*:\s*.+$/im, '').trim()
    let titulo = coincidencia?.[1]?.trim() ?? ''
    if (!titulo) {
      const primera = cuerpo
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l && !/^\[.+\]$/.test(l))
      titulo = primera ? primera.slice(0, 42) : 'Sin título'
    }
    return {
      id: `${Date.now()}`,
      titulo,
      tema: tema.trim(),
      genero,
      idioma,
      mood,
      estructura,
      texto: cuerpo,
      origen: 'ia',
      fecha: Date.now(),
    }
  }

  async function generar() {
    const temaLimpio = tema.trim()
    if (!temaLimpio || cargando) return
    if (!ajustes.tokenIA) {
      irA('ajustes')
      mostrar('Configurá tu token de Claude en Ajustes', 'info', 3200)
      return
    }
    vibrar()
    setCargando(true)
    try {
      const est = ESTRUCTURAS.find((e) => e.id === estructura)
      const respuesta = await preguntarIA({
        token: ajustes.tokenIA,
        modelo: ajustes.modeloIA,
        sistema: SISTEMA_LETRISTA,
        maxTokens: 2000,
        mensajes: [
          {
            rol: 'usuario',
            texto: [
              'Escribí la letra completa de una canción.',
              '',
              `Tema: ${temaLimpio}`,
              `Género musical: ${genero}`,
              `Idioma de la letra: ${idioma}`,
              `Emoción general: ${mood}`,
              `Estructura: ${est?.detalle ?? 'estructura estándar'}`,
              '',
              'Requisitos: rimas que suenen naturales al cantar, imágenes concretas (nada de',
              `clichés vagos), un coro pegadizo y repetible, y la métrica típica del género ${genero}.`,
            ].join('\n'),
          },
        ],
      })
      setLetra(interpretar(respuesta))
      setGuardada(false)
      mostrar('¡Letra lista! 🎵', 'ok')
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló la IA', 'error', 4000)
    } finally {
      setCargando(false)
    }
  }

  function guardarLetra() {
    if (!letra || guardada) return
    const letras = leer<Letra[]>(CLAVE_LETRAS, [])
    guardar(CLAVE_LETRAS, [letra, ...letras])
    setGuardada(true)
    vibrar()
    mostrar('Guardada en tu biblioteca 🎵', 'ok')
  }

  async function compartirLetra() {
    if (!letra) return
    const ok = await compartir({ titulo: letra.titulo, texto: `${letra.titulo}\n\n${letra.texto}` })
    if (!ok) mostrar('Compartir no disponible en esta plataforma', 'info')
  }

  if (!ajustes.tokenIA) {
    return (
      <EmptyState
        icono={<Sparkles className="h-7 w-7" />}
        titulo="Falta tu token de Claude"
        descripcion="El patrón de la familia Track: cada usuario trae su propia clave (BYO token). Ponela en Ajustes y volvé a crear tu primera letra."
        accion={<Boton onClick={() => irA('ajustes')}>Ir a Ajustes</Boton>}
      />
    )
  }

  const claseInput =
    'h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors focus:border-acento dark:border-neutral-700'

  return (
    <div className="space-y-4">
      {/* Formulario */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-400">Nueva letra</h2>
        <div className="space-y-3">
          <textarea
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="¿De qué va la canción? Ej: una noche de despecho en Lima, bajo la lluvia…"
            rows={2}
            className="w-full resize-none rounded-xl border border-neutral-300 bg-transparent p-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Género</span>
              <select value={genero} onChange={(e) => setGenero(e.target.value)} className={claseInput}>
                {GENEROS_MUSICALES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Idioma</span>
              <select value={idioma} onChange={(e) => setIdioma(e.target.value)} className={claseInput}>
                {IDIOMAS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Emoción</span>
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMood(m)}
                  aria-pressed={mood === m}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mood === m
                      ? 'border-acento bg-acento text-white'
                      : 'border-neutral-300 bg-transparent text-neutral-500 hover:border-acento/60 dark:border-neutral-700 dark:text-neutral-400'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-neutral-500 dark:text-neutral-400">Estructura</span>
            <div className="grid grid-cols-3 gap-2">
              {ESTRUCTURAS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEstructura(e.id)}
                  aria-pressed={estructura === e.id}
                  className={`rounded-xl border px-2 py-2 text-xs font-semibold transition-colors ${
                    estructura === e.id
                      ? 'border-acento bg-acento/10 text-acento'
                      : 'border-neutral-300 bg-transparent text-neutral-500 hover:border-acento/60 dark:border-neutral-700 dark:text-neutral-400'
                  }`}
                >
                  {e.etiqueta}
                </button>
              ))}
            </div>
          </div>

          <Boton className="w-full" icono={<Wand2 className="h-4 w-4" />} onClick={generar} cargando={cargando}>
            {cargando ? 'Componiendo…' : 'Generar letra'}
          </Boton>
        </div>
      </section>

      {/* Cargando */}
      {cargando && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="flex justify-center gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-acento" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 animate-bounce rounded-full bg-acento" style={{ animationDelay: '120ms' }} />
            <span className="h-2 w-2 animate-bounce rounded-full bg-acento" style={{ animationDelay: '240ms' }} />
          </span>
          <p className="mt-3 text-center text-sm text-neutral-400">
            {genero} · {mood.toLowerCase()} — buscando las palabras…
          </p>
        </section>
      )}

      {/* Resultado */}
      {letra && !cargando && (
        <section className="rounded-2xl border border-acento/40 bg-acento/5 p-4" aria-label="Letra generada">
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{letra.titulo}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wide">
            <span className="rounded-full bg-acento/15 px-2 py-0.5 text-acento">{letra.genero}</span>
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              {letra.idioma}
            </span>
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              {letra.mood}
            </span>
          </div>
          <CuerpoLetra texto={letra.texto} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Boton icono={<Save className="h-4 w-4" />} onClick={guardarLetra} disabled={guardada}>
              {guardada ? 'Guardada ✓' : 'Guardar'}
            </Boton>
            <Boton variante="secundario" icono={<RefreshCw className="h-4 w-4" />} onClick={generar}>
              Regenerar
            </Boton>
          </div>
          <Boton variante="fantasma" className="mt-2 w-full" icono={<Share2 className="h-4 w-4" />} onClick={compartirLetra}>
            Compartir
          </Boton>
        </section>
      )}
    </div>
  )
}
