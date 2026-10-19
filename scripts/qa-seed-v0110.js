(() => {
  const wav = 'http://localhost:3320/qa-audio-v0110.wav'
  const letra = [
    'En la forja del alba',
    'un juramento ardió',
    '[Coro]',
    'Corazón de acero',
    'jamás se rendirá',
    'Bajo cielos de tormenta',
    'la espada cantará',
    'El dragón despierta',
    'y el trueno resonará',
    'Corazón de acero',
    'la leyenda volverá',
  ].join('\n')
  const base = {
    taskId: 't-qa1',
    instrumental: false,
    modelo: 'claude-sonnet-4-5',
    estado: 'lista',
    duracionSeg: 12,
    urlAudio: wav,
  }
  const canciones = [
    { ...base, id: 'qa1', titulo: 'Corazón de Acero', version: 'A', estilo: 'power metal, épica, voz masculina', letraTexto: letra, favorita: true, audioId: 'aud-qa1', grupoId: 'g1', fecha: Date.now() - 5000 },
    { ...base, id: 'qa2', titulo: 'Corazón de Acero', version: 'B', estilo: 'power metal, épica, voz masculina', letraTexto: letra, audioId: 'aud-qa2', grupoId: 'g1', fecha: Date.now() - 6000 },
    { ...base, id: 'qa3', taskId: 't-qa3', titulo: 'Noche de Neón', estilo: 'j-rock, anime opening, rápido', instrumental: true, audioId: 'aud-qa3', fecha: Date.now() - 7000 },
    { ...base, id: 'qa4', taskId: 't-qa4', titulo: 'Salmorejo Digital', estilo: 'salsa, caliente, con brass', letraTexto: 'Bailando en la cocina\nel salmorejo digital\n[Coro]\nSabor de byte caliente\nritmo caribeño ya', audioId: 'aud-qa4', fecha: Date.now() - 8000 },
  ]
  localStorage.setItem('musictrack_canciones', JSON.stringify(canciones))
  localStorage.setItem(
    'musictrack_listas',
    JSON.stringify([{ id: 'l-gym', nombre: 'Gym', ids: ['qa4'], fecha: Date.now() }]),
  )
  localStorage.removeItem('musictrack_reproductor-aleatorio')
  localStorage.removeItem('musictrack_reproductor-repetir')
  return 'sembradas ' + canciones.length
})()
