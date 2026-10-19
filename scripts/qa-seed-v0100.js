// Seed QA v0.10.0 — 4 canciones (1 favorita, 1 respaldada, 1 generando)
// + lista "Gym". El audio es un WAV de 1s generado al vuelo para
// que el reproductor global suene DE VERDAD en el smoke test.
(() => {
  const sr = 8000
  const n = sr
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); v.setUint32(4, 36 + n, true); ws(8, 'WAVE'); ws(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true)
  ws(36, 'data'); v.setUint32(40, n, true)
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128)
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
  const wav = 'data:audio/wav;base64,' + b64

  const ahora = Date.now()
  const canciones = [
    { id: 'c1', taskId: 't1', titulo: 'Dragón de Andes', estilo: 'power metal, épica, 180 bpm', instrumental: false, modelo: 'V6', motor: 'suno', estado: 'lista', urlAudio: wav, duracionSeg: 211, fecha: ahora - 1000, favorita: true },
    { id: 'c2', taskId: 't1', titulo: 'Dragón de Andes (versión B)', estilo: 'power metal, épica, 180 bpm', instrumental: false, modelo: 'V6', motor: 'suno', estado: 'lista', urlAudio: wav, duracionSeg: 198, fecha: ahora - 2000, respaldada: true },
    { id: 'c3', taskId: 't2', titulo: 'Salsa del barrio', estilo: 'salsa, trompetas', instrumental: false, modelo: 'V6', motor: 'suno', estado: 'lista', urlAudio: wav, duracionSeg: 245, fecha: ahora - 3000 },
    { id: 'c4', taskId: 't3', titulo: 'Espada del destino', estilo: 'j-rock, anime', instrumental: false, modelo: 'V6', motor: 'suno', estado: 'generando', estadoCrudo: 'PENDING', fecha: ahora - 60000 },
  ]
  localStorage.setItem('musictrack_canciones', JSON.stringify(canciones))
  localStorage.setItem('musictrack_listas', JSON.stringify([{ id: 'l1', nombre: 'Gym', ids: ['c3'], fecha: ahora }]))
  return 'sembrado: ' + canciones.length + ' canciones + lista Gym'
})()
