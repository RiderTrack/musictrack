import { useState } from 'react'
import { Bell, Camera, Cpu, Database, Download, Smartphone, Sparkles, User } from 'lucide-react'
import { APP } from '@/data/app'
import { KPI } from '@/components/ui/KPI'
import { Boton } from '@/components/ui/Boton'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/core/auth/useAuth'
import { firebaseConfigurado } from '@/services/firebase'
import { contarClaves, descargarRespaldo, leer } from '@/core/storage/almacenamiento'
import { notificar } from '@/core/notificaciones/notificaciones'
import { compartir, plataformaActual, tomarFoto, vibrar } from '@/core/natives/plataforma'
import { preguntarIA } from '@/core/ai/claude'
import { AJUSTES_POR_DEFECTO, type Ajustes, type PestannaId } from '@/types'

// ═══════════════════════════════════════════════════════════
// 📊 DASHBOARD — vista de bienvenida del esqueleto: estado del
// sistema (KPIs) + acciones rápidas que demuestran cada módulo
// del core (IA, notificaciones, cámara, respaldo).
// Reemplazala por el dashboard real de TU app.
// ═══════════════════════════════════════════════════════════

export function DashboardView({ irA }: { irA: (p: PestannaId) => void }) {
  const { sesion } = useAuth()
  const { mostrar } = useToast()
  const ajustes = leer<Ajustes>('ajustes', AJUSTES_POR_DEFECTO)

  const [datoIA, setDatoIA] = useState<string | null>(null)
  const [cargandoDato, setCargandoDato] = useState(false)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  async function probarIA() {
    vibrar()
    if (!ajustes.tokenIA) {
      irA('ajustes')
      mostrar('Primero configurá tu token de Claude en Ajustes', 'info', 3200)
      return
    }
    setCargandoDato(true)
    try {
      const respuesta = await preguntarIA({
        token: ajustes.tokenIA,
        modelo: ajustes.modeloIA,
        mensajes: [
          {
            rol: 'usuario',
            texto: 'Dame UN dato curioso corto (máximo 2 frases) sobre tecnología o productividad. Solo el dato, sin introducción.',
          },
        ],
        maxTokens: 200,
      })
      setDatoIA(respuesta)
    } catch (e) {
      mostrar(e instanceof Error ? e.message : 'Falló la IA', 'error', 4000)
    } finally {
      setCargandoDato(false)
    }
  }

  async function probarNotificacion() {
    vibrar()
    await notificar(`${APP.nombre} dice`, '¡Notificaciones funcionando! 🎉', 4)
    mostrar('Notificación programada en 4 segundos', 'ok')
  }

  async function probarFoto() {
    const foto = await tomarFoto()
    if (foto) setFotoPreview(foto)
    else mostrar('No se tomó foto', 'info')
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
          <Boton icono={<Sparkles className="h-4 w-4" />} onClick={probarIA} cargando={cargandoDato}>
            Probar IA
          </Boton>
          <Boton variante="secundario" icono={<Bell className="h-4 w-4" />} onClick={probarNotificacion}>
            Notificación
          </Boton>
          <Boton variante="secundario" icono={<Camera className="h-4 w-4" />} onClick={probarFoto}>
            Cámara
          </Boton>
          <Boton variante="secundario" icono={<Download className="h-4 w-4" />} onClick={respaldo}>
            Respaldo
          </Boton>
        </div>
      </section>

      {/* Dato IA */}
      {datoIA && (
        <section className="rounded-2xl border border-acento/40 bg-acento/10 p-4">
          <div className="flex items-center gap-2 text-acento">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Dato de la IA</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">{datoIA}</p>
        </section>
      )}

      {/* Preview de foto */}
      <Modal abierto={fotoPreview !== null} onCerrar={() => setFotoPreview(null)} titulo="Foto de prueba">
        {fotoPreview && (
          <div className="space-y-3">
            <img src={fotoPreview} alt="Foto tomada con la cámara" className="w-full rounded-xl" />
            <Boton
              variante="secundario"
              className="w-full"
              onClick={async () => {
                const ok = await compartir({ titulo: APP.nombre, texto: `Foto tomada con ${APP.nombre}` })
                if (!ok) mostrar('Compartir no disponible en esta plataforma', 'info')
              }}
            >
              Compartir
            </Boton>
          </div>
        )}
      </Modal>
    </div>
  )
}
