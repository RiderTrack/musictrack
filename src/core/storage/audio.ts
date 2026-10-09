// ═══════════════════════════════════════════════════════════
// 💿 AUDIO LOCAL — IndexedDB para los MP3 que genera Lyria.
// A diferencia de Suno (que devuelve URLs CDN), Lyria entrega
// el audio embebido en base64: guardarlo en localStorage
// reventaría la cuota (~5MB). IndexedDB traga megas sin pestañear.
// ═══════════════════════════════════════════════════════════

const NOMBRE_DB = 'musictrack_audio'
const TIENDA = 'pistas'
const VERSION = 1

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(NOMBRE_DB, VERSION)
    pedido.onupgradeneeded = () => {
      const db = pedido.result
      if (!db.objectStoreNames.contains(TIENDA)) db.createObjectStore(TIENDA)
    }
    pedido.onsuccess = () => resolver(pedido.result)
    pedido.onerror = () => rechazar(pedido.error ?? new Error('IndexedDB no disponible'))
  })
}

interface PistaAudio {
  mime: string
  base64: string
  fecha: number
}

function operar<T>(modo: IDBTransactionMode, fn: (tienda: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolver, rechazar) => {
        const tx = db.transaction(TIENDA, modo)
        const pedido = fn(tx.objectStore(TIENDA))
        pedido.onsuccess = () => resolver(pedido.result)
        pedido.onerror = () => rechazar(pedido.error ?? new Error('operación falló'))
        tx.oncomplete = () => db.close()
      }),
  )
}

/** Guarda el MP3 (base64 sin prefijo) bajo el id de la canción. */
export async function guardarAudio(id: string, base64: string, mime = 'audio/mp3'): Promise<void> {
  await operar('readwrite', (tienda) => tienda.put({ mime, base64, fecha: Date.now() } satisfies PistaAudio, id))
}

/** Devuelve la pista como dataURL lista para <audio src>, o null si no existe. */
export async function leerAudio(id: string): Promise<string | null> {
  try {
    const pista = await operar<PistaAudio | undefined>('readonly', (tienda) => tienda.get(id) as IDBRequest<PistaAudio | undefined>)
    if (!pista?.base64) return null
    return `data:${pista.mime || 'audio/mp3'};base64,${pista.base64}`
  } catch {
    return null
  }
}

/** Borra la pista (al eliminar la canción de la biblioteca). */
export async function borrarAudio(id: string): Promise<void> {
  try {
    await operar('readwrite', (tienda) => tienda.delete(id) as unknown as IDBRequest<undefined>)
  } catch {
    /* si ya no existía, no pasa nada */
  }
}
