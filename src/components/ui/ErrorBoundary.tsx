import { Component, type ErrorInfo, type ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════
// 🛡️ ERROR BOUNDARY (v0.4.1 — nunca más pantalla blanca):
// si cualquier vista tira un error de render, React desmonta
// TODO el árbol y queda la pantalla en blanco (le pasó al
// usuario con el fix de Lyria). Este componente atrapa el
// error y muestra una pantalla de recuperación con acciones,
// en vez de dejarlo con la app muerta.
//
// Nota: los error boundaries de React solo existen como
// class components — no hay hook equivalente.
// ═══════════════════════════════════════════════════════════

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MusicTrack] error de render atrapado:', error, info.componentStack)
  }

  private restablecerAjustes() {
    // Último recurso: borra SOLO los ajustes (las claves/tokens),
    // sin tocar letras ni canciones — si el estado guardado es el
    // corrupto, esto devuelve la app a la vida.
    localStorage.removeItem('musictrack_ajustes')
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    const mensaje = this.state.error.message || 'error desconocido'
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center dark:bg-neutral-950 dark:text-neutral-100">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-acento/15 text-2xl">🎧</span>
        <div>
          <h1 className="text-lg font-bold">La app se rompió — pero está viva</h1>
          <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
            Tus letras y canciones están a salvo. Probá recargar; si vuelve a pasar, restablecé
            la configuración (tendrás que volver a pegar tus claves).
          </p>
        </div>
        <p className="max-w-sm break-words rounded-xl bg-neutral-100 px-3 py-2 text-left text-[11px] text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
          <span className="font-bold">Detalle técnico: </span>
          {mensaje.slice(0, 220)}
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-11 rounded-xl bg-acento text-sm font-bold text-white transition-transform active:scale-95"
          >
            Recargar la app
          </button>
          <button
            type="button"
            onClick={() => this.restablecerAjustes()}
            className="h-11 rounded-xl text-sm font-semibold text-neutral-500 transition-colors hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            Seguí pasando — restablecer solo la configuración
          </button>
        </div>
      </div>
    )
  }
}
