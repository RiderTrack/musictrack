import { leer, guardar, leerAjustes } from '@/core/storage/almacenamiento'
import { CLAVE_CANCIONES, EVENTO_CANCIONES, agregarCanciones, actualizarCancion } from '@/core/storage/canciones'
import { respaldarCancion } from '@/core/storage/respaldo'
import {
  consultarPistas,
  consultarLetraConTiempos,
  extenderMusica,
  planContinuacion,
  type MotorSuno,
  type PistaSuno,
} from '@/core/ai/suno'
import { notificar, cancelarRecordatorio } from '@/core/notificaciones/notificaciones'
import type { Cancion } from '@/types'

// ═══════════════════════════════════════════════════════════
// 👁️ SEGUIMIENTO SUNO A NIVEL APP (v0.5.0) — el polling ya no
// vive en una pestaña: corre mientras la app esté abierta, estés
// donde estés. Cuando una tarea avanza:
//   • actualiza la biblioteca en storage
//   • separa las versiones (A, B) en tarjetas propias
//   • dispara EVENTO_CANCIONES (BibliotecaView escucha → refresca
//     tarjetas + toasts + semáforo)
//   • manda la notificación local (aunque estés en otra pestaña)
// ═══════════════════════════════════════════════════════════

const MS_ENTRE_POLL = 6000

// v0.6.4 — tareas viejas: pasada la hora y media, una tarea en la
// cola del intermediario está casi segura muerta; consultarla cada
// 6 s no la revive y quema llamadas (a las 8 h serían ~4.800).
// Ciclo lento: 1 chequeo por minuto hasta que termine (o el usuario
// toque «Verificar una última vez», que consulta al toque).
const MS_ENTRE_POLL_VIEJAS = 60000
const MS_TAREA_VIEJA = 90 * 60000
const ultimoChequeo = new Map<string, number>()

// re-exportado para compatibilidad (antes se declaraba acá)
export { EVENTO_CANCIONES }

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
    // v0.8.0: el audioId del item de sunoData — hace falta para
    // extender la pista (/generate/extend) y llega recién cuando la
    // tarea se consulta (el POST inicial solo devuelve taskId).
    audioId: p.audioId ?? x.audioId,
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
      // ⏳ v0.19.0 — FASE 16: solo la versión A encadena la
      // continuación automática (encadenar las dos duplicaría
      // créditos: cada continuación es una generación).
      autoContinuar: i === 0 ? raiz.autoContinuar : undefined,
    }
    return fusionarPista(base, p)
  })
  const fuera = cs.filter((c) => c.grupoId !== grupoId && !delGrupo.some((g) => g.id === c.id))
  return [...fuera.slice(0, idx), ...hijos, ...fuera.slice(idx)]
}

async function tick(): Promise<void> {
  const ajustes = leerAjustes()
  if (!ajustes.tokenSuno) return
  const todas = leer<Cancion[]>(CLAVE_CANCIONES, [])
  const pendientes = todas.filter(
    (c) => c.estado === 'generando' && c.motor !== 'lyria' && c.taskId,
  )
  if (!pendientes.length) {
    // ⏳ v0.19.0 — FASE 16: «dormidas» — pistas que quedaron
    // listas con continuación pendiente mientras la app estaba
    // cerrada (el flag se apaga al despacharse, así que acá solo
    // entran las que faltan). Se retoman al abrir la app.
    const dormidas = todas.filter(
      (c) =>
        c.estado === 'lista' &&
        c.autoContinuar &&
        c.letraTexto &&
        !c.instrumental &&
        c.taskId &&
        c.motor !== 'lyria',
    )
    if (dormidas.length) {
      const motor: MotorSuno = { url: ajustes.urlSuno, token: ajustes.tokenSuno }
      for (const d of dormidas) void autoContinuarCancion(motor, d)
    }
    return
  }
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
          `«${n.titulo}»${n.version ? ` — versión ${n.version}` : ''} ya podés escucharla en tu Biblioteca 📚`,
        )
        // 💾 v0.10.0 — RESPALDO AUTOMÁTICO: apenas queda lista, el
        // MP3 se copia del CDN de Suno al dispositivo (IndexedDB).
        // Así, aunque el enlace caduque, la canción no se pierde.
        void respaldarCancion(n)
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

      // ⏳ v0.19.0 — FASE 16: pistas que RECÍÉN quedaron listas con
      // «Canción completa» → encadenar la continuación SOLA (sin
      // tocar el modal ⏩). La función misma marca la tarjeta ANTES
      // de despachar, así ningún ciclo la manda dos veces.
      for (const n of grupoDespues.filter(
        (n) =>
          n.estado === 'lista' &&
          n.autoContinuar &&
          !grupoAntes.some((a) => a.id === n.id && a.estado === 'lista'),
      )) {
        void autoContinuarCancion(motor, n)
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

/** ⏳ v0.19.0 — FASE 16 (pedido de Rudy: "la letra se me corta al
 * final y no quiero estar usando el Extender"): cuando una pista
 * pedida con «Canción completa» queda lista, el seguimiento lee la
 * letra sincronizada, detecta EXACTAMENTE hasta dónde se cantó y
 * manda solo la parte que falta — la misma mecánica del modal ⏩
 * Extender, sin tocar un botón. La tarjeta nueva también trae el
 * flag: si la continuación vuelve a quedarse corta, se encadena
 * otra vez, hasta que la letra quede entera.
 *
 * Defensas: el flag se apaga ANTES del primer await (nadie la
 * manda dos veces), la letra sincronizada se reintenta una vez a
 * los 12 s (a veces tarda en aparecer) y si algo falla, la
 * notificación deja el modal manual como válvula de escape. */
async function autoContinuarCancion(motor: MotorSuno, c: Cancion): Promise<void> {
  if (!c.autoContinuar || c.instrumental || !c.letraTexto) return
  // marca ANTES de cualquier await: otro ciclo no la repite
  actualizarCancion(c.id, { autoContinuar: undefined })
  try {
    if (!c.taskId || !c.audioId) throw new Error('sin taskId/audioId')
    let tiempos = await consultarLetraConTiempos(motor, c.taskId, c.audioId)
    if (!tiempos) {
      // la letra sincronizada a veces aparece unos segundos
      // después del audio — un reintento y listo
      await new Promise((r) => setTimeout(r, 12000))
      tiempos = await consultarLetraConTiempos(motor, c.taskId, c.audioId)
    }
    if (!tiempos) throw new Error('sin letra sincronizada')
    const plan = planContinuacion(c.letraTexto, c.duracionSeg ?? 0, tiempos.palabrasCantadas, tiempos.finUltimoCanto)
    if (!plan) return // se cantó entera: nada que encadenar
    const pistas = await extenderMusica(motor, {
      audioId: c.audioId,
      taskId: c.taskId,
      continueAt: plan.continueAt,
      letra: plan.restante,
      estilo: c.estilo,
      titulo: `${c.titulo} — continuación`,
      instrumental: false,
      // ⚠️ el modelo tiene que ser el MISMO de la original
      modelo: c.modelo,
    })
    const nuevas: Cancion[] = pistas
      .filter((p) => p.taskId)
      .map((p, i) => ({
        id: `${Date.now()}-auto${i}`,
        taskId: p.taskId,
        audioId: p.audioId,
        titulo: `${c.titulo} — continuación`,
        estilo: c.estilo,
        letraTexto: plan.restante,
        instrumental: false,
        modelo: c.modelo,
        motor: 'suno' as const,
        continuacionDe: c.id,
        continueAtSeg: plan.continueAt,
        // si ESTA parte también se queda corta, se encadena de nuevo
        autoContinuar: true,
        estado: 'generando' as const,
        fecha: Date.now(),
      }))
    if (!nuevas.length) throw new Error('La API no devolvió pistas')
    agregarCanciones(nuevas)
    void notificar(
      '⏳ Mandé el final de tu canción',
      `«${c.titulo}»${c.version ? ` (versión ${c.version})` : ''} se cortó en ${Math.floor((tiempos.finUltimoCanto ?? plan.continueAt) / 60)}:${String(Math.floor((tiempos.finUltimoCanto ?? plan.continueAt) % 60)).padStart(2, '0')} — la parte que faltó ya está en el horno 🔥`,
    )
  } catch {
    // válvula de escape honesta: el modal manual sigue andando
    void notificar(
      '😕 No pude mandar el final sola',
      `«${c.titulo}» — detectá el corte con ⏩ Extender en la Biblioteca y completala a mano`,
    )
  }
}

/** Arranca el ciclo de seguimiento (una sola vez por app). Lo llama App.tsx. */
export function iniciarSeguimientoSuno(): void {
  if (intervalo !== null) return
  intervalo = window.setInterval(() => void tick(), MS_ENTRE_POLL)
  void tick()
}
