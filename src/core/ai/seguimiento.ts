import { leer, guardar, leerAjustes } from '@/core/storage/almacenamiento'
import { consultarPistas, type MotorSuno, type PistaSuno } from '@/core/ai/suno'
import { notificar, cancelarRecordatorio } from '@/core/notificaciones/notificaciones'
import type { Cancion } from '@/types'

// ═══════════════════════════════════════════════════════════
// 👁️ SEGUIMIENTO SUNO A NIVEL APP (v0.5.0) — el polling ya no
// vive en la pestaña Música: corre mientras la app esté abierta,
// estés donde estés. Cuando una tarea avanza:
//   • actualiza la biblioteca en storage
//   • separa las versiones (A, B) en tarjetas propias
//   • dispara EVENTO_CANCIONES (MusicaView escucha → refresca
//     tarjetas + toasts + semáforo)
//   • manda la notificación local (aunque estés en otra pestaña)
// ═══════════════════════════════════════════════════════════

const CLAVE_CANCIONES = 'canciones'
const MS_ENTRE_POLL = 6000

// v0.6.4 — tareas viejas: pasada la hora y media, una tarea en la
// cola del intermediario está casi segura muerta; consultarla cada
// 6 s no la revive y quema llamadas (a las 8 h serían ~4.800).
// Ciclo lento: 1 chequeo por minuto hasta que termine (o el usuario
// toque «Verificar una última vez», que consulta al toque).
const MS_ENTRE_POLL_VIEJAS = 60000
const MS_TAREA_VIEJA = 90 * 60000
const ultimoChequeo = new Map<string, number>()

/** Evento window con la biblioteca actualizada como detail. */
export const EVENTO_CANCIONES = 'musictrack:canciones-actualizadas'

let intervalo: number | null = null

/** Mezcla una pista consultada en la canción existente. */
function fusionarPista(x: Cancion, p: PistaSuno): Cancion {
  return {
    ...x,
    estado: p.estado,
    estadoCrudo: p.estadoCrudo,
    urlAudio: p.urlAudio ?? x.urlAudio,
    urlPortada: p.urlPortada ?? x.urlPortada,
    duracionSeg: p.duracionSeg ?? x.duracionSeg,
    titulo: p.titulo || x.titulo,
    error: p.error,
  }
}

/** Aplica el resultado de una consulta a todas las tarjetas del grupo
 * (mismo taskId). Si la tarea devolvió varias versiones (Suno genera
 * 2 por pedido), las separa en tarjetas propias «Versión A/B» que
 * reemplazan a la original. Función pura: no toca storage. */
export function aplicarGrupo(cs: Cancion[], taskId: string, pistas: PistaSuno[]): Cancion[] {
  const delGrupo = cs.filter((c) => c.taskId === taskId && c.motor !== 'lyria')
  if (!delGrupo.length || !pistas.length) return cs
  const raiz = delGrupo.find((c) => !c.grupoId) ?? delGrupo[0]
  const grupoId = raiz.grupoId ?? raiz.id

  // Una sola pista (en cola, sin versiones aún, o error): se mezcla
  // en todas las tarjetas del grupo.
  if (pistas.length === 1) {
    const p = pistas[0]
    return cs.map((c) => (delGrupo.some((g) => g.id === c.id) ? fusionarPista(c, p) : c))
  }

  // Varias versiones: una tarjeta por versión, reemplazando a la raíz.
  const existentes = cs.filter((c) => c.grupoId === grupoId)
  const idx = cs.findIndex((c) => c.id === raiz.id)
  const hijos = pistas.map((p, i) => {
    const vid = `${grupoId}-v${i}`
    const previo = existentes.find((h) => h.varianteId === vid)
    const base: Cancion = previo ?? {
      ...raiz,
      id: vid,
      grupoId,
      varianteId: vid,
      version: String.fromCharCode(65 + i), // A, B…
      estado: 'generando',
      urlAudio: undefined,
      urlPortada: undefined,
      duracionSeg: undefined,
      error: undefined,
    }
    return fusionarPista(base, p)
  })
  const fuera = cs.filter((c) => c.grupoId !== grupoId && !delGrupo.some((g) => g.id === c.id))
  return [...fuera.slice(0, idx), ...hijos, ...fuera.slice(idx)]
}

async function tick(): Promise<void> {
  const ajustes = leerAjustes()
  if (!ajustes.tokenSuno) return
  const pendientes = leer<Cancion[]>(CLAVE_CANCIONES, []).filter(
    (c) => c.estado === 'generando' && c.motor !== 'lyria' && c.taskId,
  )
  if (!pendientes.length) return
  const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }

  // Un solo pedido por taskId, aunque haya varias tarjetas (versiones).
  for (const tid of [...new Set(pendientes.map((c) => c.taskId))]) {
    const raiz = pendientes.find((c) => c.taskId === tid)
    if (!raiz) continue
    if (
      Date.now() - raiz.fecha > MS_TAREA_VIEJA &&
      Date.now() - (ultimoChequeo.get(tid) ?? 0) < MS_ENTRE_POLL_VIEJAS
    ) {
      continue // tarea vieja: espera el ciclo lento
    }
    ultimoChequeo.set(tid, Date.now())
    try {
      const pistas = await consultarPistas(motor, tid, raiz.titulo)
      const actuales = leer<Cancion[]>(CLAVE_CANCIONES, [])
      const grupoAntes = actuales.filter((c) => c.taskId === tid)
      const despues = aplicarGrupo(actuales, tid, pistas)
      guardar(CLAVE_CANCIONES, despues)

      // ¿Terminó alguna versión nueva? → notificación local
      const grupoDespues = despues.filter((c) => c.taskId === tid)
      for (const n of grupoDespues.filter(
        (n) => n.estado === 'lista' && !grupoAntes.some((a) => a.id === n.id && a.estado === 'lista'),
      )) {
        void notificar(
          '🎵 ¡Tu canción está lista!',
          `«${n.titulo}»${n.version ? ` — versión ${n.version}` : ''} ya podés escucharla en Música`,
        )
      }
      for (const n of grupoDespues.filter(
        (n) => n.estado === 'error' && !grupoAntes.some((a) => a.id === n.id && a.estado === 'error'),
      )) {
        void notificar('😕 La generación falló', `«${n.titulo}» — Suno devuelve los créditos de esa generación`)
      }
      // Grupo completo (nada generando) → cancelar el recordatorio
      // y limpiar el registro del ciclo lento.
      if (!grupoDespues.some((c) => c.estado === 'generando')) {
        void cancelarRecordatorio(tid)
        ultimoChequeo.delete(tid)
      }

      window.dispatchEvent(new CustomEvent<Cancion[]>(EVENTO_CANCIONES, { detail: despues }))
    } catch (e) {
      // v0.6.5: este catch vacío se tragaba TODOS los errores (red
      // caída, clave vencida, formato cambiado) y el fallo quedaba
      // invisible. Ahora queda en consola — visible con chrome://inspect
      // o la consola del navegador — para poder diagnosticar. El
      // semáforo de Música escala solo a «no responde» si persiste.
      console.warn('[seguimiento] el chequeo de Suno falló (reintento en el próximo ciclo)', e)
    }
  }
}

/** Arranca el ciclo de seguimiento (una sola vez por app). Lo llama App.tsx. */
export function iniciarSeguimientoSuno(): void {
  if (intervalo !== null) return
  intervalo = window.setInterval(() => void tick(), MS_ENTRE_POLL)
  void tick()
}
