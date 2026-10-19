// ═══════════════════════════════════════════════════════════
// 🖼️ IMÁGENES (v0.12.0) — la portada PERSONALIZADA de cada
// canción: el usuario elige una foto de su galería y la app la
// recorta a cuadrado, la achica (máx. 512 px — sobra para la
// tarjeta y el reproductor) y la guarda como JPEG liviano junto
// al registro de la canción (localStorage).
//
// ¿Por qué achicar? Una foto de cámara ronda los 3-8 MB: no
// entra en localStorage. A 512 px / calidad 0.85 queda en ~40-80
// KB — nítida en pantalla y amable con el almacenamiento.
// ═══════════════════════════════════════════════════════════

/** Recorta al CENTRO en cuadrado y reduce una imagen (dataUrl de
 * cualquier tamaño) → JPEG dataUrl de lado `ladoMax`, calidad
 * `calidad`. Devuelve null si el navegador no pudo decodificarla. */
export async function recortarYReducir(dataUrl: string, ladoMax = 512, calidad = 0.85): Promise<string | null> {
  try {
    const imagen = await new Promise<HTMLImageElement | null>((resolver) => {
      const img = new Image()
      img.onload = () => resolver(img)
      img.onerror = () => resolver(null)
      img.src = dataUrl
    })
    if (!imagen) return null
    // cuadrado centrado con el lado más corto de la ORIGINAL
    const lado = Math.min(imagen.naturalWidth, imagen.naturalHeight)
    const ox = (imagen.naturalWidth - lado) / 2
    const oy = (imagen.naturalHeight - lado) / 2
    const lienzo = document.createElement('canvas')
    lienzo.width = ladoMax
    lienzo.height = ladoMax
    const ctx = lienzo.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(imagen, ox, oy, lado, lado, 0, 0, ladoMax, ladoMax)
    return lienzo.toDataURL('image/jpeg', calidad)
  } catch {
    return null
  }
}
