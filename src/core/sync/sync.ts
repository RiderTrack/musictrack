import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { getBlob, ref, uploadBytes } from 'firebase/storage'
import { APP } from '@/data/app'
import { instantanea, restaurarInstantanea } from '@/core/storage/almacenamiento'
import { guardarAudioBlob, leerAudio, listarAudios } from '@/core/storage/audio'
import { leerCanciones } from '@/core/storage/canciones'
import { obtenerFirestore, obtenerStorage } from '@/services/firebase'

// ═══════════════════════════════════════════════════════════
// ☁️ SYNC EN LA NUBE v2 (v0.15.0) — respaldo COMPLETO:
//
// • CLAVES (letras, canciones, listas, ajustes, claves de IA…):
//   van a Firestore en TROZOS de ~700KB — el límite de un
//   documento es 1MB y una biblioteca con portadas lo pasaba
//   sin aviso. Estructura:
//     {prefijo}_sync/{uid}            → meta (v2, trozos, audios)
//     {prefijo}_sync/{uid}/trozos/{i} → pedazo de JSON
//   El respaldo viejo (todo en un doc) se sigue leyendo.
// • MP3: TODAS las canciones (Suno y Lyria) ya se copian a
//   IndexedDB al quedar listas (respaldo.ts) — ahora también
//   suben a Firebase Storage: {prefijo}/{uid}/{idCanción}.
//   Solo sube los que faltan (la meta guarda la lista).
// • restaurarNube: merge SIN BORRAR (lo local manda) + baja
//   los MP3 que falten en el dispositivo.
// • Storage NO activado en la consola → los MP3 se saltean con
//   una advertencia clara; las claves igual se respaldan.
// ═══════════════════════════════════════════════════════════

/** Dejamos aire de sobra: un doc de Firestore topa en 1MB. */
const TROZO_MAX = 700_000

/** Mensaje cuando Storage no está activado en el proyecto. */
export const AVISO_STORAGE =
  'Los MP3 no subieron: activá Storage en Firebase Console (Build → Storage → Comenzar) y respaldá de nuevo. Tus letras y datos SÍ quedaron guardados.'

export interface ProgresoSync {
  etapa: 'claves' | 'audios'
  hecho: number
  total: number
}

export type NotificarProgreso = (p: ProgresoSync) => void

export interface ResultadoRespaldo {
  claves: number
  audiosSubidos: number
  avisoStorage: boolean
}

export interface ResultadoRestauracion {
  claves: number
  audiosBajados: number
  avisoStorage: boolean
}

interface MetaNube {
  v: 2
  trozos: number
  claves: number
  audiosNube: string[]
  actualizadoEn?: unknown
}

function rutaMeta(uid: string) {
  return doc(obtenerFirestore(), `${APP.prefijoClaves}_sync`, uid)
}

function rutaTrozo(uid: string, i: number) {
  return doc(obtenerFirestore(), `${APP.prefijoClaves}_sync`, uid, 'trozos', String(i))
}

function rutaAudio(uid: string, id: string) {
  return ref(obtenerStorage(), `${APP.prefijoClaves}/${uid}/${id}`)
}

function base64ABytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** ¿El error es "Storage no activado / sin permiso"? → mensaje amable. */
function esErrorStorage(e: unknown): boolean {
  const texto = e instanceof Error ? `${e.name} ${e.message}` : String(e)
  return /storage\/|bucket|unauthorized|not found|403|404/i.test(texto)
}

/** Sube todas las claves locales (en trozos) y los MP3 que falten. */
export async function respaldarNube(uid: string, notificar?: NotificarProgreso): Promise<ResultadoRespaldo> {
  // ── 1) MP3 primero: la meta necesita la lista completa ──
  const metaPrevia = await leerMeta(uid)
  const yaEnNube = new Set(metaPrevia?.audiosNube ?? [])
  const locales = await listarAudios()
  const faltan = locales.filter((a) => !yaEnNube.has(a.id))

  let audiosSubidos = 0
  let avisoStorage = false
  if (faltan.length > 0) {
    try {
      for (let i = 0; i < faltan.length; i++) {
        notificar?.({ etapa: 'audios', hecho: i, total: faltan.length })
        await uploadBytes(rutaAudio(uid, faltan[i].id), base64ABytes(faltan[i].base64), {
          contentType: faltan[i].mime || 'audio/mp3',
        })
        yaEnNube.add(faltan[i].id)
        audiosSubidos++
      }
    } catch (e) {
      if (esErrorStorage(e)) avisoStorage = true
      else throw e
    }
  }

  // ── 2) Claves → JSON → trozos ──
  notificar?.({ etapa: 'claves', hecho: 0, total: 1 })
  const datos = instantanea()
  const json = JSON.stringify(datos)
  const cantidad = Math.max(1, Math.ceil(json.length / TROZO_MAX))

  const lote = writeBatch(obtenerFirestore())
  for (let i = 0; i < cantidad; i++) {
    lote.set(rutaTrozo(uid, i), { p: json.slice(i * TROZO_MAX, (i + 1) * TROZO_MAX) })
  }
  const meta: MetaNube = {
    v: 2,
    trozos: cantidad,
    claves: Object.keys(datos).length,
    audiosNube: [...yaEnNube],
    actualizadoEn: serverTimestamp(),
  }
  lote.set(rutaMeta(uid), meta)
  await lote.commit()

  // ── 3) Limpiar trozos viejos que ya no corresponden ──
  const sobrantes = (metaPrevia?.trozos ?? 0) - cantidad
  for (let i = cantidad; i < cantidad + Math.max(0, sobrantes); i++) {
    await deleteDoc(rutaTrozo(uid, i)).catch(() => undefined)
  }
  notificar?.({ etapa: 'claves', hecho: 1, total: 1 })

  return { claves: Object.keys(datos).length, audiosSubidos, avisoStorage }
}

/** Baja la instantánea (merge sin borrar) + los MP3 que falten. */
export async function restaurarNube(uid: string, notificar?: NotificarProgreso): Promise<ResultadoRestauracion> {
  const meta = await leerMeta(uid)

  // ── Formato viejo (pre-v0.15): todo en un solo documento ──
  if (!meta) {
    const snap = await getDoc(rutaMeta(uid))
    if (!snap.exists()) return { claves: 0, audiosBajados: 0, avisoStorage: false }
    const viejo = snap.data() as { datos?: Record<string, string> }
    if (!viejo.datos) return { claves: 0, audiosBajados: 0, avisoStorage: false }
    return { claves: restaurarInstantanea(viejo.datos, 'mezclar'), audiosBajados: 0, avisoStorage: false }
  }

  // ── Claves: juntar los trozos en orden ──
  notificar?.({ etapa: 'claves', hecho: 0, total: meta.trozos })
  let json = ''
  for (let i = 0; i < meta.trozos; i++) {
    const snap = await getDoc(rutaTrozo(uid, i))
    json += (snap.data() as { p?: string } | undefined)?.p ?? ''
    notificar?.({ etapa: 'claves', hecho: i + 1, total: meta.trozos })
  }
  let claves = 0
  try {
    claves = restaurarInstantanea(JSON.parse(json) as Record<string, unknown>, 'mezclar')
  } catch {
    /* JSON corrupto en la nube — no revienta la restauración */
  }

  // ── MP3: solo los de canciones que existan y no tengan audio local ──
  const idsCanciones = new Set(leerCanciones().map((c) => c.id))
  const pendientes: string[] = []
  for (const id of meta.audiosNube) {
    if (!idsCanciones.has(id)) continue
    if (!(await leerAudio(id))) pendientes.push(id)
  }
  let audiosBajados = 0
  let avisoStorage = false
  if (pendientes.length > 0) {
    try {
      for (let i = 0; i < pendientes.length; i++) {
        notificar?.({ etapa: 'audios', hecho: i, total: pendientes.length })
        const blob = await getBlob(rutaAudio(uid, pendientes[i]))
        await guardarAudioBlob(pendientes[i], blob)
        audiosBajados++
      }
    } catch (e) {
      if (esErrorStorage(e)) avisoStorage = true
      else throw e
    }
  }

  return { claves, audiosBajados, avisoStorage }
}

async function leerMeta(uid: string): Promise<MetaNube | null> {
  const snap = await getDoc(rutaMeta(uid))
  if (!snap.exists()) return null
  const data = snap.data() as Partial<MetaNube>
  if (data.v !== 2 || typeof data.trozos !== 'number') return null
  return { v: 2, trozos: data.trozos, claves: data.claves ?? 0, audiosNube: data.audiosNube ?? [] }
}
