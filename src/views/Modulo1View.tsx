import { useEffect, useState } from 'react'
import { NotebookPen, Plus, Trash2 } from 'lucide-react'
import { leer, guardar } from '@/core/storage/almacenamiento'
import { Boton } from '@/components/ui/Boton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { vibrar } from '@/core/natives/plataforma'
import type { Nota } from '@/types'

// ═══════════════════════════════════════════════════════════
// 🗒️ MÓDULO 1 — VISTA DE EJEMPLO (CRUD local).
// Demuestra el patrón de persistencia: estado React ↔
// almacenamiento con prefijo. Reemplazá esto por tu módulo
// real (plantas, cuentas, pedidos, entrenamientos…).
// ═══════════════════════════════════════════════════════════

const CLAVE = 'notas'

export function Modulo1View() {
  const { mostrar } = useToast()
  const [notas, setNotas] = useState<Nota[]>(() => leer<Nota[]>(CLAVE, []))
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    guardar(CLAVE, notas)
  }, [notas])

  function agregarNota() {
    if (!titulo.trim() && !texto.trim()) {
      mostrar('Escribí algo primero', 'info')
      return
    }
    vibrar()
    const nueva: Nota = {
      id: `${Date.now()}`,
      titulo: titulo.trim() || 'Sin título',
      texto: texto.trim(),
      fecha: Date.now(),
    }
    setNotas((ns) => [nueva, ...ns])
    setTitulo('')
    setTexto('')
    mostrar('Nota guardada', 'ok')
  }

  function borrarNota(id: string) {
    vibrar('media')
    setNotas((ns) => ns.filter((n) => n.id !== id))
    mostrar('Nota eliminada', 'info')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        ⚠️ Vista de ejemplo — reemplazala por tu módulo real (la persistencia ya queda lista).
      </div>

      {/* Formulario */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-400">Nueva nota</h2>
        <div className="space-y-2.5">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título"
            className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
          />
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribí acá…"
            rows={3}
            className="w-full resize-none rounded-xl border border-neutral-300 bg-transparent p-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-acento dark:border-neutral-700"
          />
          <Boton className="w-full" icono={<Plus className="h-4 w-4" />} onClick={agregarNota}>
            Guardar nota
          </Boton>
        </div>
      </section>

      {/* Lista */}
      {notas.length === 0 ? (
        <EmptyState
          icono={<NotebookPen className="h-7 w-7" />}
          titulo="Todavía no hay notas"
          descripcion="Guardá la primera y vas a ver cómo sobrevive al cerrar la app: eso es el almacenamiento del core."
        />
      ) : (
        <ul className="space-y-2.5" aria-label="Lista de notas">
          {notas.map((nota) => (
            <li
              key={nota.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900 dark:text-white">{nota.titulo}</p>
                {nota.texto && (
                  <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm text-neutral-500 dark:text-neutral-400">
                    {nota.texto}
                  </p>
                )}
                <p className="mt-1.5 text-[10px] uppercase tracking-wide text-neutral-400">
                  {new Date(nota.fecha).toLocaleString('es-PE')}
                </p>
              </div>
              <button
                onClick={() => borrarNota(nota.id)}
                aria-label={`Eliminar ${nota.titulo}`}
                className="shrink-0 rounded-lg p-2 text-neutral-400 hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
