import { useState } from 'react'
import { Heart, Library, ListMusic, Play, Shuffle, Sparkles } from 'lucide-react'
import { useReproductor } from '@/core/audio/reproductor'
import { leer } from '@/core/storage/almacenamiento'
import { vibrar } from '@/core/natives/plataforma'
import { Boton } from '@/components/ui/Boton'
import { PanelNowPlaying } from '@/components/player/PanelNowPlaying'
import { PortadaNow } from '@/components/player/PortadaNow'
import { BarraProgreso, FilaControles, FilaTitulo } from '@/components/player/ControlesReproductor'
import { ModalListas } from '@/components/player/ModalListas'
import { formatoTiempo } from '@/components/player/comunes'
import type { Cancion, PestannaId } from '@/types'

// ═══════════════════════════════════════════════════════════
// 🎧 PESTAÑA «SUENA» (v0.13.0) — el reproductor con CASA
// PROPIA, como pidió Rudy: «que no viva en la biblioteca».
// Es el mismo now-playing de la pantalla completa, pero abierto
// desde la barra de navegación — y con arranques rápidos cuando
// todavía no suena nada:
//   • ▶ Tus favoritas · 🔀 mezclar toda la biblioteca
//   • las últimas creadas a un toque
// La música sigue viva al cambiar de pestaña (el audio vive en
// el provider global, como desde v0.10.0).
// ═══════════════════════════════════════════════════════════

export function ReproductorView({ irA }: { irA: (p: PestannaId) => void }) {
  const r = useReproductor()
  const [modalLista, setModalLista] = useState(false)
  const c = r.actual

  if (!c) return <ReproductorTranquilo irA={irA} />

  return (
    <section
      aria-label="Suena ahora"
      className="flex flex-col overflow-hidden rounded-3xl bg-neutral-950 pb-1 text-white shadow-xl shadow-black/20 dark:shadow-none"
      style={{ height: 'calc(100dvh - 246px)', minHeight: 430 }}
    >
      {/* brillo decorativo, como en la pantalla completa */}
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-acento/20 blur-3xl" />

      {/* encabezado: de dónde viene la cola */}
      <div className="relative flex items-center justify-between gap-2 px-5 pb-0 pt-4">
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Sonando de</p>
          <p className="truncate text-xs font-semibold text-neutral-300">{r.etiquetaCola || 'Tu biblioteca'}</p>
        </div>
      </div>

      {/* portada (con 🎨 portada IA) */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-8 py-3">
        <PortadaNow cancion={c} tamano="mediana" />
      </div>

      {/* título + timer + corazón + lista */}
      <FilaTitulo cancion={c} alAbrirListas={() => setModalLista(true)} />

      {/* progreso + controles (compartidos con la pantalla completa) */}
      <BarraProgreso />
      <FilaControles />

      {/* letra karaoke / cola */}
      <PanelNowPlaying cancion={c} />

      <ModalListas cancion={c} abierto={modalLista} onCerrar={() => setModalLista(false)} />
    </section>
  )
}

/** Sin nada cargado: arrancos rápidos para que suene algo YA. */
function ReproductorTranquilo({ irA }: { irA: (p: PestannaId) => void }) {
  const r = useReproductor()
  const canciones = leer<Cancion[]>('canciones', []).filter((x) => x.estado === 'lista' && (x.urlAudio || x.audioLocal || x.respaldada))
  const favoritas = canciones.filter((x) => x.favorita)
  const ultimas = [...canciones].sort((a, b) => b.fecha - a.fecha).slice(0, 5)

  function sonarFavoritas() {
    if (!favoritas.length) return
    vibrar()
    r.reproducir(favoritas, favoritas[0].id, '❤️ Favoritas')
  }

  function mezclarBiblioteca() {
    if (!canciones.length) return
    vibrar()
    const mezcladas = [...canciones].sort(() => Math.random() - 0.5)
    r.reproducir(mezcladas, mezcladas[0].id, '🎲 Mezcla de tu biblioteca')
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-acento/15">
          <ListMusic className="h-8 w-8 text-acento" />
        </div>
        <h2 className="pt-3 text-lg font-bold text-neutral-900 dark:text-white">Acá suena tu música 🎧</h2>
        <p className="mx-auto max-w-sm pt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Tocá una canción y esta pestaña se vuelve el reproductor completo: portada, letra siguiendo la
          voz palabra por palabra, cola, timer de sueño y portadas con IA.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
          {favoritas.length > 0 && (
            <Boton onClick={sonarFavoritas} variante="primario">
              <Heart className="h-4 w-4 fill-current" /> Tus favoritas ({favoritas.length})
            </Boton>
          )}
          {canciones.length > 0 && (
            <Boton onClick={mezclarBiblioteca} variante="secundario">
              <Shuffle className="h-4 w-4" /> Mezclar la biblioteca
            </Boton>
          )}
          <Boton onClick={() => irA('biblioteca')} variante="fantasma">
            <Library className="h-4 w-4" /> Ir a la Biblioteca
          </Boton>
        </div>

        {canciones.length === 0 && (
          <p className="pt-4 text-xs text-neutral-400">
            Todavía no hay canciones generadas — creá la primera en la pestaña Crear ✨
          </p>
        )}
      </section>

      {ultimas.length > 0 && (
        <section>
          <h3 className="pb-2 text-sm font-bold text-neutral-900 dark:text-white">Últimas creadas</h3>
          <ul className="space-y-1.5">
            {ultimas.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => {
                    vibrar()
                    r.reproducir(ultimas, x.id, '🕒 Últimas creadas')
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-acento/40 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-acento/15 text-acento">
                    <Play className="h-4 w-4 translate-x-0.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">
                      {x.titulo}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-500">
                      {x.version ? `versión ${x.version} · ` : ''}
                      {x.instrumental ? 'Instrumental' : x.estilo || 'MusicTrack'}
                    </span>
                  </span>
                  {x.duracionSeg ? (
                    <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">
                      {formatoTiempo(x.duracionSeg)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
