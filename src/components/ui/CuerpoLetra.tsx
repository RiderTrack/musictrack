// ═══════════════════════════════════════════════════════════
// 🎼 CUERPO DE LETRA — renderiza el texto de una canción con
// sus secciones etiquetadas: las líneas [Entre corchetes] se
// muestran como etiquetas violetas y el resto como verso normal.
// Lo usan CrearView (resultado IA) y LetrasView (detalle).
// ═══════════════════════════════════════════════════════════

interface Props {
  texto: string
}

export function CuerpoLetra({ texto }: Props) {
  const lineas = texto.split('\n')
  return (
    <div className="space-y-0.5">
      {lineas.map((linea, i) => {
        const limpia = linea.trim()
        if (!limpia) return <div key={i} className="h-2.5" aria-hidden="true" />
        if (/^\[.+\]$/.test(limpia)) {
          return (
            <p key={i} className="pt-2.5 text-[11px] font-bold uppercase tracking-wider text-acento">
              {limpia}
            </p>
          )
        }
        return (
          <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">
            {linea}
          </p>
        )
      })}
    </div>
  )
}
