import { LocalNotifications } from '@capacitor/local-notifications'

// ═══════════════════════════════════════════════════════════
// 🔔 NOTIFICACIONES LOCALES — recordatorios sin servidor.
// En Android 13+ hace falta permiso explícito (POST_NOTIFICATIONS);
// pedirPermisoNotificaciones() lo resuelve y se llama al arrancar.
// ═══════════════════════════════════════════════════════════

export async function pedirPermisoNotificaciones(): Promise<boolean> {
  try {
    const { display } = await LocalNotifications.requestPermissions()
    return display === 'granted'
  } catch {
    return false
  }
}

/** Programa una notificación local en N segundos (para probar o para recordatorios). */
export async function notificar(titulo: string, cuerpo: string, enSegundos = 5): Promise<void> {
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          title: titulo,
          body: cuerpo,
          id: Date.now(),
          schedule: { at: new Date(Date.now() + enSegundos * 1000) },
        },
      ],
    })
  } catch (e) {
    console.warn('[notificaciones] no se pudo programar', e)
  }
}

export async function cancelarTodas(): Promise<void> {
  try {
    const pendientes = await LocalNotifications.getPending()
    if (pendientes.notifications.length) {
      await LocalNotifications.cancel({
        notifications: pendientes.notifications.map((n) => ({ id: n.id })),
      })
    }
  } catch {
    /* plataforma sin soporte */
  }
}
