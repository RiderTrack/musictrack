import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { APP } from '@/data/app'
import { instantanea, restaurarInstantanea } from '@/core/storage/almacenamiento'
import { obtenerFirestore } from '@/services/firebase'

// ═══════════════════════════════════════════════════════════
// ☁️ SYNC EN LA NUBE — patrón WalletTrack/RiderTrack:
// un documento `${prefijo}_sync/{uid}` en Firestore con TODAS
// las claves locales de la app.
// • respaldarNube: sube la instantánea completa.
// • restaurarNube: baja y hace MERGE SIN BORRAR — solo agrega
//   lo que falte localmente; lo local siempre manda.
// Requiere sesión iniciada + Firebase configurado.
// ═══════════════════════════════════════════════════════════

function rutaDocumento(uid: string) {
  return doc(obtenerFirestore(), `${APP.prefijoClaves}_sync`, uid)
}

/** Sube todas las claves locales a la nube. Devuelve cuántas subieron. */
export async function respaldarNube(uid: string): Promise<number> {
  const datos = instantanea()
  await setDoc(rutaDocumento(uid), { datos, actualizadoEn: serverTimestamp() }, { merge: false })
  return Object.keys(datos).length
}

/** Baja la instantánea de la nube y la mezcla (sin borrar nada). Devuelve cuántas claves trajo. */
export async function restaurarNube(uid: string): Promise<number> {
  const snap = await getDoc(rutaDocumento(uid))
  if (!snap.exists()) return 0
  const data = snap.data() as { datos?: Record<string, string> }
  if (!data.datos) return 0
  return restaurarInstantanea(data.datos, 'mezclar')
}
