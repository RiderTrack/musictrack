import { useEffect, useState } from 'react'
import { Bell, Cpu, Disc3, Download, ListMusic, Music2, Smartphone, User, Wand2, X } from 'lucide-react'
import { APP } from '@/data/app'
import { KPI } from '@/components/ui/KPI'
import { Boton } from '@/components/ui/Boton'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/core/auth/useAuth'
import { firebaseConfigurado } from '@/services/firebase'
import { contarClaves, descargarRespaldo, leer } from '@/core/storage/almacenamiento'
import { notificar } from '@/core/notificaciones/notificaciones'
import { plataformaActual, vibrar, abrirURL } from '@/core/natives/plataforma'
import {
  buscarUltimaVersion,
  esMasNueva,
  ignorarVersion,
  versionIgnorada,
  type InfoActualizacion,
} from '@/core/actualizacion/actualizacion'
import { AJUSTES_POR_DEFECTO, type Ajustes, type Cancion, type Letra, type PestannaId } from '@/types'

// ═══════════════════════════════════════════════════════════
// 📊 DASHBOARD MusicTrack — saludo + estado (KPIs: IA, letras,
// plataforma, datos, sesión) + acciones rápidas de la app.
// ═══════════════════════════════════════════════════════════

export function DashboardView({ irA }: { irA: (p: PestannaId) => void }) {
  const { sesion } = useAuth()
  const { mostrar } = useToast()
  const ajustes = leer<Ajustes>('ajustes', AJUSTES_POR_DEFECTO)
  const letras = leer<Letra[]>('letras', [])
  const canciones = leer<Cancion[]>('canciones', [])

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  // 🔄 Actualizador (FASE 2): chequeo silencioso al abrir Inicio.
  const [actualizacion, setActualizacion] = useState<InfoActualizacion | null>(null)

  useEffect(() => {
    let vivo = true
    buscarUltimaVersion().then((info) => {
      if (vivo && info && esMasNueva(info) && versionIgnorada() !== info.tag) setActualizacion(info)
    })
    return () => {
      vivo = false
    }
  }, [])

  function posponerActualizacion() {
    if (actualizacion) ignorarVersion(actualizacion.tag)
    setActualizacion(null)
  }

  async function descargarActualizacion(url: string) {
    vibrar()
    const ok = await abrirURL(url)
    if (!ok) mostrar('No se pudo abrir el enlace de descarga', 'info')
  }

  async function probarNotificacion() {
    vibrar()
    await notificar(`${APP.nombre} dice`, '¡Notificaciones funcionando! 🎉', 4)
    mostrar('Notificación programada en 4 segundos', 'ok')
  }

  function respaldo() {
    vibrar()
    descargarRespaldo()
    mostrar('Respaldo descargado', 'ok')
  }

  return (
    <div className="space-y-5">
      {/* Saludo */}
      <section>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          {saludo}{sesion ? `, ${sesion.nombre.split(' ')[0]}` : ''} 👋
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </section>

      {/* Banner de nueva versión (FASE 2) */}
      {actualizacion && (
        <section
          className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4"
          role="status"
          aria-label="Nueva versión disponible"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Download className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Nueva versión disponible 🎉</p>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                v{actualizacion.version} — descargala e instalala encima: tus letras no se pierden.
              </p>
            </div>
            <button
              type="button"
              onClick={posponerActualizacion}
              aria-label="Posponer esta versión"
              className="rounded-lg p-1.5 text-emerald-600/70 hover:bg-emerald-500/10 dark:text-emerald-400/70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Boton
            className="mt-3 w-full"
            icono={<Download className="h-4 w-4" />}
            onClick={() => descargarActualizacion(actualizacion.urlApk)}
          >
            Descargar v{actualizacion.version}
          </Boton>
        </section>
      )}

      {/* Estado del sistema */}
      <section className="grid grid-cols-2 gap-3" aria-label="Estado del sistema">
        <KPI
          icono={<Cpu className="h-4 w-4" />}
          etiqueta="Letras — Claude"
          valor={ajustes.tokenIA ? 'Motor listo' : 'Sin token'}
          detalle={ajustes.tokenIA ? ajustes.modeloIA : 'Configurala en Ajustes'}
        />
        <KPI
          icono={<Disc3 className="h-4 w-4" />}
          etiqueta="Música — motores"
          valor={ajustes.tokenSuno && ajustes.tokenLyria ? 'Doble listo' : ajustes.tokenSuno ? 'Suno listo' : ajustes.tokenLyria ? 'Lyria listo' : 'Sin claves'}
          detalle={
            ajustes.tokenSuno && ajustes.tokenLyria
              ? `Suno ✓ · Lyria ${ajustes.modeloLyria.includes('clip') ? 'clip' : '3.5'} ✓`
              : ajustes.tokenSuno
                ? `modelo ${ajustes.modeloSuno.replace('_', '.')} — Lyria sin clave`
                : ajustes.tokenLyria
                  ? 'Suno sin clave — el plan B'
                  : 'Configuralas en Ajustes'
          }
        />
        <KPI
          icono={<ListMusic className="h-4 w-4" />}
          etiqueta="Letras"
          valor={`${letras.length}`}
          detalle={letras.length > 0 ? `última: ${letras[0].titulo}`.slice(0, 26) : 'ninguna todavía'}
        />
        <KPI
          icono={<Music2 className="h-4 w-4" />}
          etiqueta="Canciones"
          valor={`${canciones.filter((c) => c.estado === 'lista').length}`}
          detalle={
            canciones.length === 0
              ? 'el motor doble las crea'
              : canciones.some((c) => c.estado === 'generando')
                ? `${canciones.filter((c) => c.estado === 'generando').length} generándose…`
                : 'todas listas'
          }
        />
        <KPI
          icono={<Smartphone className="h-4 w-4" />}
          etiqueta="Plataforma"
          valor={plataformaActual() === 'web' ? 'Web' : plataformaActual() === 'android' ? 'Android' : 'iOS'}
          detalle={firebaseConfigurado ? 'Firebase activo' : 'Modo local'}
        />
        <KPI
          icono={<User className="h-4 w-4" />}
          etiqueta="Sesión"
          valor={sesion ? sesion.nombre : 'Local'}
          detalle={sesion ? sesion.uid.slice(0, 10) + '…' : 'sin cuenta en la nube'}
        />
      </section>

      {/* Acciones rápidas */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-400">Acciones rápidas</h3>
        <div className="grid grid-cols-2 gap-3">
          <Boton icono={<Wand2 className="h-4 w-4" />} onClick={() => irA('crear')}>
            Crear letra
          </Boton>
          <Boton variante="secundario" icono={<Disc3 className="h-4 w-4" />} onClick={() => irA('musica')}>
            Musicalizar
          </Boton>
          <Boton variante="secundario" icono={<ListMusic className="h-4 w-4" />} onClick={() => irA('letras')}>
            Mis letras
          </Boton>
          <Boton variante="secundario" icono={<Bell className="h-4 w-4" />} onClick={probarNotificacion}>
            Notificación
          </Boton>
          <Boton variante="fantasma" icono={<Download className="h-4 w-4" />} onClick={respaldo}>
            Respaldo · {contarClaves()} claves
          </Boton>
        </div>
      </section>

    </div>
  )
}
