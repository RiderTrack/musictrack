import { useEffect, useRef, useState } from 'react'
import { Bot, Send, Sparkles } from 'lucide-react'
import { APP } from '@/data/app'
import { leer, guardar } from '@/core/storage/almacenamiento'
import { preguntarIA } from '@/core/ai/claude'
import { Boton } from '@/components/ui/Boton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { vibrar } from '@/core/natives/plataforma'
import { AJUSTES_POR_DEFECTO, type Ajustes, type MensajeChatIA, type PestannaId } from '@/types'

// ═══════════════════════════════════════════════════════════
// 🤖 MÓDULO 2 — VISTA DE EJEMPLO (chat IA).
// Demuestra el patrón BYO-token de la familia Track: la clave
// la pone cada usuario en Ajustes y queda en SU dispositivo.
// Reemplazalo por tu asistente real (botánico, financiero,
// entrenador, chat de pedidos…).
// ═══════════════════════════════════════════════════════════

const CLAVE = 'historial_ia'
const MAX_HISTORIAL = 12
const CONTEXTO = 8 // mensajes que se mandan como contexto

export function Modulo2View({ irA }: { irA: (p: PestannaId) => void }) {
  const { mostrar } = useToast()
  const ajustes = leer<Ajustes>('ajustes', AJUSTES_POR_DEFECTO)
  const [pregunta, setPregunta] = useState('')
  const [cargando, setCargando] = useState(false)
  const [historial, setHistorial] = useState<MensajeChatIA[]>(() => leer<MensajeChatIA[]>(CLAVE, []))
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    guardar(CLAVE, historial)
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [historial])

  async function enviar() {
    const texto = pregunta.trim()
    if (!texto || cargando) return
    if (!ajustes.tokenIA) {
      irA('ajustes')
      mostrar('Configurá tu token de Claude en Ajustes', 'info', 3200)
      return
    }
    vibrar()
    const mia: MensajeChatIA = { rol: 'usuario', texto, fecha: Date.now() }
    setHistorial((h) => [...h, mia])
    setPregunta('')
    setCargando(true)
    try {
      const contexto = [...historial.slice(-CONTEXTO), mia].map((m) => ({ rol: m.rol, texto: m.texto }))
      const respuesta = await preguntarIA({
        token: ajustes.tokenIA,
        modelo: ajustes.modeloIA,
        mensajes: contexto,
        sistema: `Sos el asistente de la app ${APP.nombre}. Respondé breve, claro y en español.`,
        maxTokens: 600,
      })
      setHistorial((h) => [...h, { rol: 'asistente', texto: respuesta, fecha: Date.now() }])
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló la IA', 'error', 4000)
    } finally {
      setCargando(false)
    }
  }

  if (!ajustes.tokenIA) {
    return (
      <EmptyState
        icono={<Sparkles className="h-7 w-7" />}
        titulo="Falta tu token de Claude"
        descripcion="El patrón de la familia Track: cada usuario trae su propia clave (BYO token). Ponela en Ajustes y volvé."
        accion={<Boton onClick={() => irA('ajustes')}>Ir a Ajustes</Boton>}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        ⚠️ Vista de ejemplo — reemplazala por tu asistente real (la conexión IA ya queda lista).
      </div>

      {/* Historial */}
      {historial.length === 0 ? (
        <EmptyState
          icono={<Bot className="h-7 w-7" />}
          titulo="Preguntale lo que quieras"
          descripcion={`Modelo: ${ajustes.modeloIA}. El historial queda guardado en tu dispositivo.`}
        />
      ) : (
        <ul className="space-y-2.5" aria-label="Historial de chat">
          {historial.map((m, i) => (
            <li key={i} className={m.rol === 'usuario' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.rol === 'usuario'
                    ? 'bg-acento text-black'
                    : 'border border-neutral-200 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100'
                }`}
              >
                {m.texto}
              </div>
            </li>
          ))}
          {cargando && (
            <li className="flex justify-start">
              <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-700 dark:bg-neutral-900">
                <span className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: '120ms' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: '240ms' }} />
                </span>
              </div>
            </li>
          )}
          <div ref={finRef} />
        </ul>
      )}

      {/* Entrada */}
      <div className="sticky bottom-24 flex gap-2">
        <input
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') enviar()
          }}
          placeholder="Preguntale algo a la IA…"
          disabled={cargando}
          className="h-12 min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-4 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <Boton tamano="lg" onClick={enviar} cargando={cargando} aria-label="Enviar">
          {cargando ? null : <Send className="h-4 w-4" />}
        </Boton>
      </div>
    </div>
  )
}
