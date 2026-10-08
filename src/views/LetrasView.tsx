import { useEffect, useState } from 'react'
import { ListMusic, Share2, Trash2, Wand2 } from 'lucide-react'
import { leer, guardar } from '@/core/storage/almacenamiento'
import { Boton } from '@/components/ui/Boton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { CuerpoLetra } from '@/components/ui/CuerpoLetra'
import { useToast } from '@/components/ui/Toast'
import { compartir, vibrar } from '@/core/natives/plataforma'
import type { Letra, PestannaId } from '@/types'

// ═══════════════════════════════════════════════════════════
// 🎼 LETRAS — biblioteca de la app (FASE 1).
// Lista las letras creadas con IA (o pegadas a mano, FASE 2),
// con detalle en modal, compartir y eliminar. Persistencia con
// el patrón del core: estado React ↔ almacenamiento prefijado.
// ═══════════════════════════════════════════════════════════

const CLAVE = 'letras'

export function LetrasView({ irA }: { irA: (p: PestannaId) => void }) {
  const { mostrar } = useToast()
  const [letras, setLetras] = useState<Letra[]>(() => leer<Letra[]>(CLAVE, []))
  const [abierta, setAbierta] = useState<Letra | null>(null)

  useEffect(() => {
    guardar(CLAVE, letras)
  }, [letras])

  function borrar(id: string) {
    vibrar('media')
    setLetras((ls) => ls.filter((l) => l.id !== id))
    setAbierta(null)
    mostrar('Letra eliminada', 'info')
  }

  async function compartirLetra(l: Letra) {
    const ok = await compartir({ titulo: l.titulo, texto: `${l.titulo}\n\n${l.texto}` })
    if (!ok) mostrar('Compartir no disponible en esta plataforma', 'info')
  }

  return (
    <div className="space-y-4">
      {letras.length === 0 ? (
        <EmptyState
          icono={<ListMusic className="h-7 w-7" />}
          titulo="Todavía no hay letras"
          descripcion="Creá la primera con IA: elegí un tema y un género, y dejá que Claude escriba la letra por vos."
          accion={
            <Boton icono={<Wand2 className="h-4 w-4" />} onClick={() => irA('crear')}>
              Crear con IA
            </Boton>
          }
        />
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            {letras.length} {letras.length === 1 ? 'letra' : 'letras'} guardadas
          </p>
          <ul className="space-y-2.5" aria-label="Biblioteca de letras">
            {letras.map((l) => (
              <li key={l.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setAbierta(l)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setAbierta(l)
                  }}
                  className="cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 transition-colors hover:border-acento/50 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold text-neutral-900 dark:text-white">{l.titulo}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        l.origen === 'ia' ? 'bg-acento/15 text-acento' : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      {l.origen === 'ia' ? 'IA' : 'Propia'}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-sm text-neutral-500 dark:text-neutral-400">{l.texto}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-neutral-400">
                    <span className="font-bold text-acento">{l.genero}</span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(l.fecha).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Detalle */}
      <Modal abierto={abierta !== null} onCerrar={() => setAbierta(null)} titulo={abierta?.titulo ?? ''}>
        {abierta && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wide">
              <span className="rounded-full bg-acento/15 px-2 py-0.5 text-acento">{abierta.genero}</span>
              <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {abierta.idioma}
              </span>
              <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {abierta.mood}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 ${
                  abierta.origen === 'ia' ? 'bg-acento/15 text-acento' : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                }`}
              >
                {abierta.origen === 'ia' ? 'Creada con IA' : 'Composición propia'}
              </span>
            </div>
            <CuerpoLetra texto={abierta.texto} />
            <p className="text-[10px] uppercase tracking-wide text-neutral-400">
              Tema: {abierta.tema || '—'} · {new Date(abierta.fecha).toLocaleString('es-PE')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Boton variante="secundario" icono={<Share2 className="h-4 w-4" />} onClick={() => compartirLetra(abierta)}>
                Compartir
              </Boton>
              <Boton variante="peligro" icono={<Trash2 className="h-4 w-4" />} onClick={() => borrar(abierta.id)}>
                Eliminar
              </Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
