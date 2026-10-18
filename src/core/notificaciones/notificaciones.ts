import { LocalNotifications } from '@capacitor/local-notifications'
import { esNativo } from '@/core/natives/plataforma'

// ═══════════════════════════════════════════════════════════
// 🔔 NOTIFICACIONES LOCALES — "tu canción está lista" aunque
// estés en otra pestaña o hayas cerrado la app (las programadas
// las dispara el sistema operativo, sin depender de la app viva).
// En Android 13+ hace falta permiso explícito (POST_NOTIFICATIONS);
// pedirPermisoNotificaciones() lo resuelve y se llama al arrancar.
// En web todo degrada en silencio.
// ═══════════════════════════════════════════════════════════

export async function pedirPermisoNotificaciones(): Promise<boolean> {
  if (!esNativo()) return false
  try {
    const actual = await LocalNotifications.checkPermissions()
    if (actual.display === 'granted') return true
    const { display } = await LocalNotifications.requestPermissions()
    return display === 'granted'
  } catch {
    return false
  }
}

/** Notificación local (canción lista / fallida). Con enSegundos se
 * agenda para más tarde (la prueba de Ajustes la usa); por defecto
 * dispara al toque. Solo nativo. */
export async function notificar(titulo: string, cuerpo: string, enSegundos = 0): Promise<void> {
  if (!esNativo()) return
  try {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 2_000_000_000),
          title: titulo,
          body: cuerpo,
          ...(enSegundos > 0 ? { schedule: { at: new Date(Date.now() + enSegundos * 1000) } } : {}),
        },
      ],
    })
  } catch {
    /* sin permiso o sin soporte */
  }
}

/** Recordatorio programado: lo agenda el sistema operativo, así que
 * dispara aunque la app esté cerrada. Cubre el caso "mandé la canción
 * a Suno y salí de la app". El id es estable (sale del taskId) para
 * poder cancelarlo cuando la canción llega antes. */
export async function programarRecordatorio(idTexto: string, tituloCancion: string, min = 3): Promise<void> {
  if (!esNativo()) return
  try {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [
        {
          id: idDesdeTexto(idTexto),
          title: '🎙️ ¿Ya llegó tu canción?',
          body: `«${tituloCancion}» ya debería estar lista — abrí MusicTrack y pasá por Música`,
          schedule: { at: new Date(Date.now() + min * 60_000) },
        },
      ],
    })
  } catch {
    /* sin permiso o sin soporte */
  }
}

export async function cancelarRecordatorio(idTexto: string): Promise<void> {
  if (!esNativo()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: idDesdeTexto(idTexto) }] })
  } catch {
    /* id inexistente — no pasa nada */
  }
}

/** id numérico estable a partir de un texto (taskId). */
function idDesdeTexto(t: string): number {
  let h = 7
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return h % 2_000_000_000
}
