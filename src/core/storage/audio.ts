// ═══════════════════════════════════════════════════════════
// 💿 AUDIO LOCAL — IndexedDB para los MP3 de la app.
// Lyria entrega el audio embebido en base64; los de Suno viven
// en una URL del CDN que puede caducar — v0.10.0 los RESPALDA
// acá también (respaldo.ts los copia al quedar listos).
// localStorage no da abasto (~5MB); IndexedDB traga megas.
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
  avisarCambio()
}

/** v0.15.0 — avisa al auto-respaldo que hay audio nuevo/borrado. */
function avisarCambio(): void {
  try {
    window.dispatchEvent(new CustomEvent('mt:guardado', { detail: 'audio' }))
  } catch {
    /* sin window (tests) — no pasa nada */
  }
}

/** v0.10.0 — guarda un BLOB (el MP3 de Suno bajado del CDN para
 * el respaldo local) en el mismo formato que usa Lyria, así el
 * reproductor lo lee igual sin saber de dónde vino. */
export async function guardarAudioBlob(id: string, blob: Blob): Promise<void> {
  const base64 = await new Promise<string>((resolver, rechazar) => {
    const fr = new FileReader()
    fr.onload = () => {
      const r = String(fr.result)
      resolver(r.slice(r.indexOf(',') + 1))
    }
    fr.onerror = () => rechazar(fr.error ?? new Error('no pude leer el blob'))
    fr.readAsDataURL(blob)
  })
  await guardarAudio(id, base64, blob.type || 'audio/mp3')
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
    avisarCambio()
  } catch {
    /* si ya no existía, no pasa nada */
  }
}

/** v0.15.0 — TODAS las pistas guardadas (para el respaldo en la nube). */
export async function listarAudios(): Promise<{ id: string; mime: string; base64: string }[]> {
  const db = await abrir()
  return new Promise((resolver) => {
    const salida: { id: string; mime: string; base64: string }[] = []
    try {
      const tx = db.transaction(TIENDA, 'readonly')
      const pedido = tx.objectStore(TIENDA).openCursor()
      pedido.onsuccess = () => {
        const cursor = pedido.result
        if (!cursor) return
        const pista = cursor.value as PistaAudio | undefined
        if (pista?.base64) salida.push({ id: String(cursor.key), mime: pista.mime || 'audio/mp3', base64: pista.base64 })
        cursor.continue()
      }
      tx.oncomplete = () => {
        db.close()
        resolver(salida)
      }
      tx.onerror = () => {
        db.close()
        resolver(salida)
      }
    } catch {
      db.close()
      resolver(salida)
    }
  })
}
