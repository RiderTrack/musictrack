import { Bell, Cpu, Database, Download, ListMusic, Music4, Smartphone, User, Wand2 } from 'lucide-react'
import { APP } from '@/data/app'
import { KPI } from '@/components/ui/KPI'
import { Boton } from '@/components/ui/Boton'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/core/auth/useAuth'
import { firebaseConfigurado } from '@/services/firebase'
import { contarClaves, descargarRespaldo, leer } from '@/core/storage/almacenamiento'
import { notificar } from '@/core/notificaciones/notificaciones'
import { plataformaActual, vibrar } from '@/core/natives/plataforma'
import { AJUSTES_POR_DEFECTO, type Ajustes, type Letra, type PestannaId } from '@/types'

// ═══════════════════════════════════════════════════════════
// 📊 DASHBOARD MusicTrack — saludo + estado (KPIs: IA, letras,
// plataforma, datos, sesión) + acciones rápidas de la app.
// ═══════════════════════════════════════════════════════════

export function DashboardView({ irA }: { irA: (p: PestannaId) => void }) {
  const { sesion } = useAuth()
  const { mostrar } = useToast()
  const ajustes = leer<Ajustes>('ajustes', AJUSTES_POR_DEFECTO)
  const letras = leer<Letra[]>('letras', [])

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

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

      {/* Estado del sistema */}
      <section className="grid grid-cols-2 gap-3" aria-label="Estado del sistema">
        <KPI
          icono={<Cpu className="h-4 w-4" />}
          etiqueta="IA Claude"
          valor={ajustes.tokenIA ? 'Lista' : 'Sin token'}
          detalle={ajustes.tokenIA ? ajustes.modeloIA : 'Configurala en Ajustes'}
        />
        <KPI
          icono={<Music4 className="h-4 w-4" />}
          etiqueta="Letras"
          valor={`${letras.length}`}
          detalle={letras.length > 0 ? `última: ${letras[0].titulo}`.slice(0, 26) : 'ninguna todavía'}
        />
        <KPI
          icono={<Smartphone className="h-4 w-4" />}
          etiqueta="Plataforma"
          valor={plataformaActual() === 'web' ? 'Web' : plataformaActual() === 'android' ? 'Android' : 'iOS'}
          detalle={firebaseConfigurado ? 'Firebase activo' : 'Modo local'}
        />
        <KPI
          icono={<Database className="h-4 w-4" />}
          etiqueta="Datos locales"
          valor={`${contarClaves()} claves`}
          detalle={`prefijo: ${APP.prefijoClaves}_`}
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
          <Boton variante="secundario" icono={<Bell className="h-4 w-4" />} onClick={probarNotificacion}>
            Notificación
          </Boton>
          <Boton variante="secundario" icono={<ListMusic className="h-4 w-4" />} onClick={() => irA('letras')}>
            Mis letras
          </Boton>
          <Boton variante="secundario" icono={<Download className="h-4 w-4" />} onClick={respaldo}>
            Respaldo
          </Boton>
        </div>
      </section>

    </div>
  )
}
