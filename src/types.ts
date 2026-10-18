// ═══════════════════════════════════════════════════════════
// 🧱 TrackStack — tipos compartidos de toda la app
// ═══════════════════════════════════════════════════════════

export type Tema = 'oscuro' | 'claro' | 'auto'

export type PestannaId = 'inicio' | 'letras' | 'crear' | 'musica' | 'biblioteca' | 'ajustes'

export interface Ajustes {
  tokenIA: string
  modeloIA: string
  tokenSuno: string
  urlSuno: string
  modeloSuno: string
  tokenLyria: string
  modeloLyria: string
  /** Carpeta (dentro de Descargas) donde caen los MP3 (v0.7.1). */
  carpetaDescargas: string
  onboardingVisto: boolean
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  tokenIA: '',
  modeloIA: 'claude-sonnet-4-5-20250929',
  tokenSuno: '',
  urlSuno: 'https://api.sunoapi.org',
  modeloSuno: 'V6',
  tokenLyria: '',
  modeloLyria: 'lyria-3.5',
  carpetaDescargas: 'Música de Rudy',
  onboardingVisto: false,
}

/** Modelos de Claude que escriben las letras (v0.7.0): el usuario
 * los cambia desde Crear o Ajustes según cuánto quiera gastar.
 * Haiku = rápido y barato · Sonnet = equilibrado · Opus = premium. */
export const MODELOS_CLAUDE = [
  {
    id: 'claude-haiku-4-5-20251001',
    etiqueta: 'Haiku 4.5',
    detalle: 'rápido y económico — letras en segundos',
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    etiqueta: 'Sonnet 4.5',
    detalle: 'recomendado — mejor calidad-tiempo-precio',
  },
  {
    id: 'claude-opus-4-5-20251101',
    etiqueta: 'Opus 4.5',
    detalle: 'máxima calidad — más lento y caro',
  },
] as const

/** ¿El modelo elegido es uno de la lista o uno escrito a mano? */
export function modeloClaudeConocido(id: string): boolean {
  return MODELOS_CLAUDE.some((m) => m.id === id)
}

export interface Sesion {
  uid: string
  nombre: string
  foto?: string
  esLocal: boolean
}

// ═══════════════════════════════════════════════════════════
// 🎵 MÚSICA — géneros, idiomas, emociones y estructura que
// alimentan el generador de letras (CrearView, FASE 1).
// ═══════════════════════════════════════════════════════════

export const GENEROS_MUSICALES = [
  'Pop latino',
  'Balada romántica',
  'Reggaetón',
  'Trap latino',
  'Cumbia',
  'Salsa',
  'Vallenato',
  'Bachata',
  'Merengue',
  'Corrido / Regional mexicano',
  'Rock en español',
  'Rock',
  'Nu metal',
  'Metal / Punk',
  'Power metal',
  'Metal sinfónico',
  'Metal medieval',
  'Folk metal',
  'Pop rock',
  'Indie / Alternativo',
  'Hip-hop / Rap',
  'R&B',
  'Folclore andino',
  'Sertanejo',
  'Bossa nova',
  'Tango',
  'Flamenco',
  'K-pop',
  'J-Rock (anime)',
  'Balada anime',
  'Electronic / EDM',
] as const

export const IDIOMAS = ['Español', 'English', 'Português'] as const

export const MOODS = [
  'Alegre',
  'Romántica',
  'Melancólica',
  'Motivacional',
  'Despecho',
  'Fiesta',
  'Nostálgica',
  'Tranquila',
  'Épica',
  'Oscura',
  'Dramática',
] as const

/** ¿Quién canta la canción? (v0.7.0) — se usa al crear la
 * letra (Claude la escribe pensando en esa voz) y al musicalizar
 * (se agrega al estilo de Suno). */
export const VOZ_CANTANTE = ['Cualquiera', 'Masculina', 'Femenina', 'Dúo'] as const

export const ESTRUCTURAS = [
  { id: 'sencilla', etiqueta: 'Sencilla', detalle: 'corta: 1 verso + coro (12 a 16 líneas)' },
  { id: 'estandar', etiqueta: 'Estándar', detalle: '2 versos + pre-coro + coro + puente (20 a 28 líneas)' },
  { id: 'extendida', etiqueta: 'Extendida', detalle: '3 versos + puente + outro (30 a 40 líneas)' },
  { id: 'epica', etiqueta: 'Épica', detalle: 'canción larga: 4-5 versos + coros dobles + puentes + outro (45 a 60 líneas, para power metal y relatos largos)' },
] as const

/** Una letra de la biblioteca — creada con IA o escrita a mano (FASE 2). */
export interface Letra {
  id: string
  titulo: string
  tema: string
  genero: string
  idioma: string
  mood: string
  estructura: string
  texto: string
  origen: 'ia' | 'propia'
  /** Voz pensada para cantarla (v0.7.0): 'Masculina', 'Femenina',
   * 'Dúo' — viaja con la letra hasta el estilo de Suno. */
  voz?: string
  /** v0.9.1 — artistas que INSPIRAN la letra (ej: «Stratovarius,
   * Luca Turilli»): Claude captura su esencia al escribir (él sí
   * puede leer los nombres) y al musicalizar su retrato sonoro
   * se suma al estilo de Suno (que NO acepta nombres — viaja la
   * esencia, no el nombre). */
  artistas?: string
  fecha: number
}

// ═══════════════════════════════════════════════════════════
// 🎧 MOTOR DOBLE (FASE 3) — Suno convierte las letras en
// canciones: el usuario elige una letra de la biblioteca (o
// pega una), define el estilo y Suno genera 2 versiones con
// voz e instrumentos. Cada versión es una Cancion.
// ═══════════════════════════════════════════════════════════

export const MODELOS_SUNO = [
  { id: 'V6', etiqueta: 'V6 · el más nuevo — voces naturales, recomendado' },
  { id: 'V6_MINI', etiqueta: 'V6 Mini · liviano y RÁPIDO — menos espera' },
  { id: 'V6_WILD', etiqueta: 'V6 Wild · más creativo y arriesgado' },
  { id: 'V5', etiqueta: 'V5 · discontinuado (anda, pero ya no lo mejoran)' },
  { id: 'V4_5', etiqueta: 'V4.5 · discontinuado' },
  { id: 'V4', etiqueta: 'V4 · discontinuado' },
  { id: 'V3_5', etiqueta: 'V3.5 · discontinuado' },
] as const

/** IDs de Suno discontinuados por sunoapi.org (siguen funcionando
 * por compatibilidad, pero ya no reciben mejoras). */
export const MODELOS_SUNO_VIEJOS = ['V5', 'V4_5', 'V4_5PLUS', 'V4_5ALL', 'V4', 'V3_5'] as const

/** Versión bonita a mostrar: V6_MINI → «V6 Mini», V4_5 → «V4.5». */
export function modeloSunoBonito(id: string): string {
  const mapa: Record<string, string> = {
    V6: 'V6',
    V6_MINI: 'V6 Mini',
    V6_WILD: 'V6 Wild',
    V5: 'V5',
    V5_5: 'V5.5',
    V4_5: 'V4.5',
    V4_5PLUS: 'V4.5 Plus',
    V4_5ALL: 'V4.5 All',
    V4: 'V4',
    V3_5: 'V3.5',
  }
  return mapa[id] ?? id.replace(/_/g, ' ')
}

export const MODELOS_LYRIA = [
  { id: 'lyria-3.5', etiqueta: 'Lyria 3.5 · canción completa (~2 min, $0.08)' },
  { id: 'lyria-3-clip-preview', etiqueta: 'Lyria 3 Clip · clip de 30 segundos ($0.04)' },
] as const

export type MotorMusica = 'suno' | 'lyria'

export const ESTILOS_RAPIDOS = [
  'reggaetón, dembow, perreo, 96 bpm',
  'trap latino, oscuro, 808 profundo',
  'balada romántica, piano, cuerdas',
  'cumbia peruana, guitarra, timbales',
  'salsa dura, trompetas, tumbao',
  'pop latino, pegadizo, verano',
  'rock en español, guitarras distorsionadas',
  'R&B latino, suave, groovy',
  'rock punk, energético, guitarras crudas',
  'corrido tumbado, requinto, trompetas',
  'synthwave, ochentero, sintetizadores',
  'lo-fi hip hop, relajado, vinilo',
  // 🇯🇵 v0.9.1 — las dos caras del anime: batalla y balada
  'j-rock anime, guitarras rápidas, enérgico, épico, 170 bpm',
  'balada anime, piano, emocional, cuerdas, voz femenina',
] as const

/** Etiquetas de UN género para COMBINAR estilos (v0.6.0): tocás
 * varias y se van sumando al campo estilo ("rock, punk, energético").
 * Agrupadas para encontrarlas rápido en el formulario de Música.
 * v0.7.0: rock & metal ampliado (Nu metal, Metalcore, Thrash…),
 * más ritmos latinos y electrónica moderna. */
export const GRUPOS_TAGS_ESTILO: { titulo: string; tags: string[] }[] = [
  {
    titulo: 'Urbano & latino',
    tags: [
      'Reggaetón',
      'Trap',
      'Hip-hop',
      'Rap',
      'R&B',
      'Cumbia',
      'Salsa',
      'Merengue',
      'Bachata',
      'Vallenato',
      'Corrido',
      'Banda',
      'Ranchera',
      'Sertanejo',
      'Tango',
      'Huayno',
      'Folclore andino',
      'Son cubano',
      'Mariachi',
      'Dancehall',
      'Afrobeats',
    ],
  },
  {
    titulo: 'Rock & metal',
    tags: [
      'Rock',
      'Punk',
      'Pop rock',
      'Rock en español',
      'Hard rock',
      'Grunge',
      'Indie',
      'Alternativo',
      'Emo',
      'Ska',
      'Post-punk',
      'Rock progresivo',
      'Rock psicodélico',
      'Stoner rock',
      'Metal',
      'Nu metal',
      'Metalcore',
      'Thrash metal',
      'Death metal',
      'Power metal',
      'Doom metal',
      'Industrial',
    ],
  },
  {
    // v0.9.1 — pedido del usuario: «esa música japonesa de los
    // animes, tipo Naruto, tipo Goku» — el j-rock rápido de
    // batalla y las baladas emocionales de los endings.
    titulo: '🇯🇵 Anime & J-music',
    tags: [
      'J-Rock',
      'J-Pop',
      'Anime opening',
      'Anime rock',
      'Balada anime',
      'Anison',
      'Visual kei',
      'J-metal',
    ],
  },
  {
    // v0.8.1 — pedido del usuario: «esa música rápida bonita
    // medieval sinfónica». Todo lo épico, medieval y sinfónico
    // junto para armar ese estilo de un solo vistazo.
    titulo: 'Épico · medieval & sinfónico',
    tags: [
      'Symphonic power metal',
      'Symphonic metal',
      'Speed metal',
      'Neoclassical metal',
      'Medieval metal',
      'Medieval rock',
      'Folk metal',
      'Viking metal',
      'Celtic metal',
      'Pirate metal',
      'Gothic metal',
      'Melodic death metal',
      'Música medieval',
      'Celta',
      'Banda sonora épica',
    ],
  },
  {
    titulo: 'Pop, jazz & clásicos',
    tags: [
      'Pop',
      'Pop latino',
      'Balada',
      'Bolero',
      'Disco',
      'Funk',
      'Soul',
      'Jazz',
      'Blues',
      'Swing',
      'Gospel',
      'Bossa nova',
      'Flamenco',
      'Acústico',
      'Piano',
      'Sinfónico',
    ],
  },
  {
    titulo: 'Electrónica & otros',
    tags: [
      'Electrónica',
      'EDM',
      'House',
      'Techno',
      'Trance',
      'Drum and bass',
      'Synthwave',
      'Lo-fi',
      'Phonk',
      'Ambient',
      'Chill',
      'Reggae',
      'K-pop',
      'Country',
      'Folk',
      '8-bit',
      'Navideño',
    ],
  },
]

/** 🎚️ Carácter de la canción (v0.7.0): se suman al estilo como
 * adjetivos que Suno entiende ("energética, épica"). Se pueden
 * tocar varias a la vez. */
export const ENERGIAS_ESTILO = [
  'Enérgica',
  'Tranquila',
  'Épica',
  'Agresiva',
  'Alegre',
  'Melancólica',
  'Romántica',
  'Oscura',
  'Nostálgica',
  'Dramática',
  'Sexy',
  'Motivacional',
  // v0.9.0 — más carácter (pedido: «agregar más características»)
  'Triunfante',
  'Celestial',
  'Festiva',
  'Vibrante',
] as const

/** 🎤 Instrumentos protagonistas (v0.7.0): se suman al estilo
 * ("piano, cuerdas, trompetas"). Se pueden tocar varios.
 * v0.8.1 — coros (personas cantando detrás del solista) e
 * instrumentos medievales/épicos.
 * v0.9.0 — AGRUPADOS en carpetas plegables (como los géneros:
 * una flechita los despliega) y ampliados a ~50: cuerdas, vientos,
 * percusión épica, coros y folklore andino/medieval. */
export const GRUPOS_INSTRUMENTOS_ESTILO: { titulo: string; tags: string[] }[] = [
  {
    titulo: 'Guitarras y bajo',
    tags: [
      'Guitarra eléctrica',
      'Guitarra acústica',
      'Guitarra española',
      'Guitarra distorsionada',
      'Solo de guitarra',
      'Riffs pesados',
      'Doble bombo',
      'Bajo',
      'Bajo profundo',
    ],
  },
  {
    titulo: 'Cuerdas y teclas',
    tags: [
      'Piano',
      'Sintetizadores',
      'Órgano',
      'Clavecín',
      'Acordeón',
      'Cuerdas',
      'Violín',
      'Chelo',
      'Arpa',
      'Contrabajo',
    ],
  },
  {
    titulo: 'Vientos',
    tags: [
      'Flauta',
      'Flauta dulce',
      'Quena',
      'Zampoña',
      'Gaita',
      'Trompetas',
      'Trombón',
      'Corno francés',
      'Tuba',
      'Saxofón',
      'Clarinete',
    ],
  },
  {
    titulo: 'Percusión y ritmo',
    tags: [
      'Batería',
      'Percusión',
      'Timbales',
      'Campanas',
      'Campanas tubulares',
      'Tambores taiko',
      'Percusión épica',
      'Tambores de guerra',
      'Pandereta',
      'Castañuelas',
      'Palmadas',
      '808',
    ],
  },
  {
    // 🧑‍🤝‍🧑 el «coro» del usuario: personas cantando detrás del solista
    titulo: 'Coros y voces',
    tags: ['Coros', 'Coro épico', 'Coro femenino', 'Coro masculino', 'Coro gregoriano', 'Coros gospel'],
  },
  {
    titulo: 'Medieval y del mundo',
    tags: [
      'Laúd',
      'Mandolina',
      'Banjo',
      'Dulcémele',
      'Charango',
      'Arpa céltica',
      'Cuerno de guerra',
      'Armónica',
      // 🇯🇵 v0.9.1 — para el sonido de anime
      'Koto',
      'Shamisen',
    ],
  },
]

/** Lista PLANA de todos los instrumentos (útil para saber qué tags
 * de estilo son instrumentos — p. ej. al activar A capela). */
export const INSTRUMENTOS_ESTILO: string[] = GRUPOS_INSTRUMENTOS_ESTILO.flatMap((g) => g.tags)

/** 🎚️ v0.9.0 — PRODUCCIÓN: cómo se graba la canción. Lo especial
 * acá es «A capela»: apaga TODOS los instrumentos y queda la voz
 * sola (el usuario lo pidió — se maneja por TAG de estilo, Suno lo
 * entiende; no hace falta escribir nada especial en la letra). */
export const PRODUCCION_ESTILO = [
  'A capela',
  'Acústico',
  'Orquestal',
  'Sinfónico',
  'Cinematográfico',
  'En vivo',
  'Lo-fi',
  'Minimalista',
] as const

/** ⏱️ Tempo (v0.7.0): EXCLUSIVO — elegir uno quita el anterior.
 * El chip muestra la idea y agrega el BPM al estilo. */
export const TEMPOS_ESTILO = [
  { etiqueta: 'Lenta · balada', tag: '70 bpm' },
  { etiqueta: 'Media · groove', tag: '100 bpm' },
  { etiqueta: 'Rápida · bailable', tag: '128 bpm' },
  { etiqueta: 'Acelerada · mosh', tag: '160 bpm' },
  // v0.9.0 — para el power/speed metal piden volar
  { etiqueta: 'Muy rápida · power', tag: '180 bpm' },
  { etiqueta: 'Extrema · blast', tag: '200 bpm' },
] as const

// ═══════════════════════════════════════════════════════════
// 🎯 v0.9.1 — INSPIRACIÓN POR ARTISTAS. El usuario escribe
// «Stratovarius, Luca Turilli» y la app captura SU ESENCIA:
//   • Claude lee los NOMBRES cuando escribe la letra (para él es
//     texto normal: capta energía, temáticas y actitud — sin
//     mencionarlos en la letra).
//   • Suno NO acepta nombres de artistas en el estilo (los
//     rechaza) — así que el nombre NUNCA viaja ahí: viaja su
//     RETRATO SONORO, traducido por este diccionario a tags
//     seguros que Suno entiende y respeta.
// ═══════════════════════════════════════════════════════════

/** Retratos sonoros de artistas conocidos (tags Suno-safe, sin
 * nombres). Claves en minúscula y sin acentos — se buscan con
 * normalizarArtista() para que «Héctor Lavoe» y «hector lavoe»
 * den lo mismo. */
export const DICCIONARIO_ARTISTAS: Record<string, string> = {
  // ⚔️ power / sinfónico / épico / medieval
  stratovarius: 'neoclassical power metal, melodías rápidas, teclados protagonistas, solos virtuosos',
  'luca turilli': 'neoclassical power metal, orquesta, arpegios veloces, guitarras sinfónicas',
  rhapsody: 'symphonic power metal, coros épicos, orquesta, fantasía heroica',
  'rhapsody of fire': 'symphonic power metal, coros épicos, orquesta, fantasía heroica',
  dragonforce: 'extreme power metal, guitarras ultrarrápidas, doble bombo constante',
  helloween: 'power metal clásico, voces agudas, galope, coros cantables',
  'blind guardian': 'power metal épico, coros masivos, voces en multicapas',
  nightwish: 'symphonic metal, voz femenina operática, orquesta completa',
  'within temptation': 'symphonic metal, voz femenina etérea, cuerdas, atmosférico',
  epica: 'symphonic metal, mezzo-soprano, coros, progresivo',
  sabaton: 'power metal bélico, coros de guerra, batería marchante',
  'amon amarth': 'viking melodic death metal, guturales, riffs pesados épicos',
  alestorm: 'pirate metal, folk, acordeón, coros festivos',
  eluveitie: 'folk metal celta, gaita, violín, guturales',
  korpiklaani: 'folk metal festivo, violín, acordeón, canto grupal',
  'in flames': 'melodic death metal, riffs melódicos, gutural medio',
  'in extremo': 'medieval metal, gaitas, laúd, ritmo de taberna',
  'subway to sally': 'medieval metal, violín, guitarras pesadas',
  'corvus corax': 'música medieval tribal, tambores, gaitas, fiesta antigua',
  // 🤘 metal / rock clásico y alternativo
  metallica: 'thrash metal, riffs pesados, solos clásicos',
  megadeth: 'thrash metal técnico, riffs complejos',
  'iron maiden': 'heavy metal clásico, bajo galopante, guitarras gemelas',
  'judas priest': 'heavy metal, voces agudas estridentes',
  'black sabbath': 'doom metal, riffs lentos y pesados, oscuro',
  pantera: 'groove metal, riffs groovy, agresivo',
  rammstein: 'industrial metal, riffs pesados repetitivos, teclados oscuros',
  slipknot: 'nu metal extremo, percusión caótica, agresivo',
  'system of a down': 'alternative metal, cambios bruscos, voces tensas',
  soad: 'alternative metal, cambios bruscos, voces tensas',
  'linkin park': 'nu metal, rap y voz melódica, electrónica de los 2000',
  korn: 'nu metal, guitarras graves, oscuro',
  deftones: 'alternative metal, atmósferas soñadas, suave y pesado',
  nirvana: 'grunge, riffs simples pegadizos, voz rasposa',
  'foo fighters': 'rock alternativo, guitarras grandes, coros himno',
  'green day': 'pop punk, tres acordes rápidos, coros cantables',
  'blink-182': 'pop punk, rápido y melódico, humor',
  'sum 41': 'pop punk, rápido, toques metaleros',
  'the offspring': 'punk rock, riff saltarín, noventas',
  'red hot chili peppers': 'funk rock, bajo slap, groove',
  radiohead: 'rock experimental, atmosférico, melancólico',
  coldplay: 'pop rock pianístico, atmósferas grandes',
  'imagine dragons': 'arena rock, percusión gigante, coros de estadio',
  paramore: 'pop punk, voz femenina potente',
  'the killers': 'rock new wave, sintetizadores ochenteros',
  'arctic monkeys': 'indie rock, guitarra groovy, lírica urbana',
  'twenty one pilots': 'alternativo, rap, ukulele y electrónica',
  'my chemical romance': 'emo rock épico, teatral, dramático',
  'tame impala': 'psicodelia moderna, sintetizadores, groove hipnótico',
  // 🎤 urbano / latino / tropical
  'bad bunny': 'reggaetón moderno, perreo, bajo profundo',
  'daddy yankee': 'reggaetón clásico, perreo de la vieja escuela',
  'j balvin': 'reggaetón pop, brillante, bailable',
  'karol g': 'reggaetón femenino, dulce y duro a la vez',
  ozuna: 'trap romántico, melodioso',
  maluma: 'pop urbano, seductor',
  'don omar': 'reggaetón clásico, himnos de fiesta',
  'anuel aa': 'trap latino, oscuro, realismo urbano',
  'marc anthony': 'salsa romántica, voz potente, swing',
  'celia cruz': 'salsa dura, fuego caribeño, guaracha',
  'hector lavoe': 'salsa dura, soneros, trompetas',
  'ruben blades': 'salsa de autor, storytelling del barrio',
  'grupo niche': 'salsa colombiana, brillosa, swing tropical',
  'jerry rivera': 'salsa romántica juvenil, suave',
  'frankie ruiz': 'salsa romántica, energía de fiesta',
  'willie colon': 'salsa dura, trombones, sabor de barrio',
  aventura: 'bachata moderna, romántica, cuatro y güira',
  'romeo santos': 'bachata pop, voz de tenor, festivalera',
  'prince royce': 'bachata suave, juvenil',
  'luis miguel': 'balada romántica, voz de terciopelo, orquesta',
  'juan gabriel': 'balada mexicana, dramática, voz desgarrada',
  'jose jose': 'balada trágica, voz elegante, orquestal',
  'marco antonio solis': 'balada grupera, sentimental',
  'vicente fernandez': 'ranchera, voz de pecho, mariachi completo',
  'pedro infante': 'ranchera clásica, charro de oro',
  'peso pluma': 'corrido tumbado, requinto suave, sierreño',
  'los tigres del norte': 'corrido clásico, polka norteña',
  'soda stereo': 'rock en español, guitarra atmosférica, ochentas',
  'heroes del silencio': 'rock en español épico, muro de guitarras',
  mana: 'pop rock latino, coros gigantes',
  caifanes: 'rock latino oscuro, gótico tropical',
  'enanitos verdes': 'rock en español melodioso',
  santana: 'latin rock, solos de guitarra latinos, percusión',
  rosalia: 'flamenco urbano, palmas, producción moderna',
  'camaron de la isla': 'flamenco puro, compás, voz quebrada',
  'paco de lucia': 'flamenco instrumental, guitarra maestra',
  'buena vista social club': 'son cubano, guitarra dulce, trompeta vieja escuela',
  shakira: 'pop latino con rock, fusión andina, voz única',
  juanes: 'rock latino, guitarra folclórica',
  'carlos vives': 'vallenato pop, alegre, acordeón',
  'diomedes diaz': 'vallenato clásico, acordeón de pueblo',
  'silvestre dangond': 'vallenato nuevo, fiesta',
  'los mirlos': 'cumbia amazónica, guitarras psicodélicas',
  'sonora dinamita': 'cumbia tropical clásica, fiesta',
  'juan luis guerra': 'bachata y merengue poéticos, elegantes',
  'elvis crespo': 'merengue rápido, güira y tambora, fiesta',
  'olga tañon': 'merengue femenino, potente',
  'los kjarkas': 'saya y huayno, charango y quena',
  'inti illimani': 'andino instrumental, quena, charango, vientos',
  'victor jara': 'canción latinoamericana de autor, guitarra y sentimiento',
  // 🇯🇵 anime & j-music (lo que pidió el usuario)
  radwimps: 'j-rock cinematográfico, emocional, dinámico',
  'asian kung-fu generation': 'j-rock de anime, riffs enérgicos, garage',
  flow: 'j-rock de anime, rap y melodía, espíritu de batalla',
  lisa: 'j-rock de anime, voz femenina poderosa, opening épico',
  'kana-boon': 'j-rock de anime, riff saltarín, energía juvenil',
  uverworld: 'j-rock de anime, electrónica y banda, épico',
  'porno graffitti': 'j-rock de anime, groove melódico',
  'orange range': 'j-pop rock de anime, fiesta, mezcla de géneros',
  'ikimono-gakari': 'j-pop balada, voz femenina fresca, emocional',
  aimer: 'balada japonesa oscura, voz rasposa y dulce, piano',
  yoasobi: 'j-pop literario, piano veloz, storytelling',
  eve: 'j-pop rock de anime, caótico y pegadizo',
  'kenshi yonezu': 'j-pop artístico, voz nasal única',
  'man with a mission': 'j-rock de festival, coros de estadio',
  'one ok rock': 'j-rock internacional, coros emotivos de estadio',
  // 🇰🇷 k-pop · 🔊 electrónica · 🎧 r&b / rap / brasil
  bts: 'k-pop, producción impecable, dinámicas cambiantes',
  blackpink: 'k-pop femenino, trap y pop, actitud',
  twice: 'k-pop alegre, colorido, pegadizo',
  'stray kids': 'k-pop intenso, hip hop, producción audaz',
  newjeans: 'k-pop suave, r&b juvenil, minimalista',
  avicii: 'edm melódico, festival, drops emotivos',
  'david guetta': 'dance pop de festival',
  'calvin harris': 'edm pop, groove bailable',
  'daft punk': 'electro house, vocoder, funk',
  skrillex: 'dubstep agresivo, bass wobble',
  deadmau5: 'progressive house, progresión larga',
  eminem: 'rap técnico, flow rápido, storytelling',
  'kendrick lamar': 'rap consciente, jazz hop, flow versátil',
  residente: 'rap latino, wordplay complejo, rima densa',
  canserbero: 'rap latino concienzudo, oscuro, lírica filosófica',
  'the weeknd': 'r&b oscuro sintético, noches de ciudad',
  'frank ocean': 'r&b alternativo, atmosférico, íntimo',
  sza: 'r&b aireado, voz suave, groove lento',
  usher: 'r&b de club, dance, voz ágil',
  'gusttavo lima': 'sertanejo universitário, fiesta',
  'marilia mendonca': 'sertanejo femenino, dolor de bar, fiesta llorada',
  'luan santana': 'sertanejo pop, romántico bailable',
  'joao gilberto': 'bossa nova íntima, voz suave, guitarra sutil',
  'tom jobim': 'bossa nova clásica, jazz brasileño',
  'elis regina': 'voz brasileña luminosa, swing',
  'carlos gardel': 'tango clásico, orquesta típica',
  'astor piazzolla': 'tango nuevo, bandoneón virtuoso',
}

/** Sugerencias de artistas por género (los chips de Crear):
 * nombres que Claude conoce bien y el diccionario sabe retratar.
 * El usuario puede escribir cualquier OTRO artista a mano. */
export const ARTISTAS_REFERENCIA: Record<string, string[]> = {
  'Pop latino': ['Shakira', 'Juanes', 'Carlos Vives', 'Luis Miguel', 'Rosalía', 'Karol G', 'Maluma'],
  'Balada romántica': ['Luis Miguel', 'Juan Gabriel', 'José José', 'Marco Antonio Solís', 'Romeo Santos', 'Aimer'],
  Reggaetón: ['Bad Bunny', 'Daddy Yankee', 'J Balvin', 'Karol G', 'Don Omar', 'Ozuna'],
  'Trap latino': ['Ozuna', 'Anuel AA', 'Bad Bunny'],
  Cumbia: ['Los Mirlos', 'Sonora Dinamita'],
  Salsa: ['Marc Anthony', 'Celia Cruz', 'Héctor Lavoe', 'Rubén Blades', 'Grupo Niche', 'Willie Colón', 'Frankie Ruiz', 'Jerry Rivera'],
  Vallenato: ['Carlos Vives', 'Diomedes Díaz', 'Silvestre Dangond'],
  Bachata: ['Aventura', 'Romeo Santos', 'Prince Royce'],
  Merengue: ['Elvis Crespo', 'Olga Tañón', 'Juan Luis Guerra'],
  'Corrido / Regional mexicano': ['Vicente Fernández', 'Pedro Infante', 'Peso Pluma', 'Los Tigres del Norte'],
  'Rock en español': ['Soda Stereo', 'Héroes del Silencio', 'Maná', 'Caifanes', 'Enanitos Verdes', 'Santana'],
  Rock: ['Foo Fighters', 'Nirvana', 'Red Hot Chili Peppers', 'Arctic Monkeys', 'The Killers', 'Coldplay', 'Imagine Dragons'],
  'Nu metal': ['Linkin Park', 'Korn', 'Deftones', 'System of a Down', 'Slipknot', 'Rammstein'],
  'Metal / Punk': ['Metallica', 'Iron Maiden', 'Black Sabbath', 'Megadeth', 'Green Day', 'The Offspring'],
  'Power metal': ['Stratovarius', 'Luca Turilli', 'Rhapsody', 'DragonForce', 'Helloween', 'Blind Guardian', 'Sabaton'],
  'Metal sinfónico': ['Nightwish', 'Within Temptation', 'Epica', 'Rhapsody'],
  'Metal medieval': ['In Extremo', 'Subway to Sally', 'Corvus Corax', 'Rhapsody'],
  'Folk metal': ['Eluveitie', 'Korpiklaani', 'Alestorm', 'Amon Amarth'],
  'Pop rock': ['Coldplay', 'Paramore', 'Imagine Dragons', 'The Killers', 'Maná'],
  'Indie / Alternativo': ['Arctic Monkeys', 'Radiohead', 'Twenty One Pilots', 'Tame Impala', 'My Chemical Romance'],
  'Hip-hop / Rap': ['Eminem', 'Kendrick Lamar', 'Residente', 'Canserbero'],
  'R&B': ['The Weeknd', 'Frank Ocean', 'SZA', 'Usher'],
  'Folclore andino': ['Los Kjarkas', 'Inti-Illimani', 'Víctor Jara'],
  Sertanejo: ['Gusttavo Lima', 'Marília Mendonça', 'Luan Santana'],
  'Bossa nova': ['João Gilberto', 'Tom Jobim', 'Elis Regina'],
  Tango: ['Carlos Gardel', 'Astor Piazzolla'],
  Flamenco: ['Rosalía', 'Camarón de la Isla', 'Paco de Lucía'],
  'K-pop': ['BTS', 'BLACKPINK', 'TWICE', 'Stray Kids', 'NewJeans'],
  'J-Rock (anime)': ['Radwimps', 'Asian Kung-Fu Generation', 'FLOW', 'LiSA', 'KANA-BOON', 'Uverworld', 'Porno Graffitti', 'MAN WITH A MISSION', 'ONE OK ROCK'],
  'Balada anime': ['Aimer', 'YOASOBI', 'Ikimono-gakari', 'Eve', 'Kenshi Yonezu', 'Radwimps'],
  'Electronic / EDM': ['Avicii', 'David Guetta', 'Calvin Harris', 'Daft Punk', 'Skrillex', 'deadmau5'],
}

/** Clave de búsqueda de un artista: minúsculas y sin acentos
 * (así «Héctor Lavoe», «hector lavoe» y «HECTOR LAVOE» matchean). */
export function normalizarArtista(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** El retrato sonoro de UN artista (undefined si no lo conozco). */
export function retratoDeArtista(nombre: string): string | undefined {
  return DICCIONARIO_ARTISTAS[normalizarArtista(nombre)]
}

/** Tags de estilo que capturan la esencia de los artistas
 * escritos (separados por comas), sin repetir y con tope — entra
 * lo que el estilo de Suno (200 caracteres) acepte razonablemente. */
export function descriptoresDeArtistas(artistas: string): string[] {
  const salida: string[] = []
  for (const nombre of artistas.split(',')) {
    const retrato = retratoDeArtista(nombre)
    if (!retrato) continue
    for (const tag of retrato.split(',').map((t) => t.trim()).filter(Boolean)) {
      if (!salida.includes(tag)) salida.push(tag)
    }
  }
  return salida.slice(0, 8)
}

/** Suma la esencia de los artistas a un estilo existente: sin
 * repetir tags y sin pasarse del tope de 200 caracteres de Suno.
 * Devuelve el estilo final y qué se agregó (para avisarle al
 * usuario con un toast, no en silencio). */
export function estiloConInspiracion(estilo: string, artistas?: string): { estilo: string; agregados: string[] } {
  if (!artistas?.trim()) return { estilo, agregados: [] }
  const partes = estilo
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const agregados: string[] = []
  for (const tag of descriptoresDeArtistas(artistas)) {
    if (partes.some((p) => p.toLowerCase() === tag.toLowerCase()) || agregados.includes(tag)) continue
    if ([...partes, ...agregados, tag].join(', ').length > 200) break
    agregados.push(tag)
  }
  return { estilo: [...partes, ...agregados].join(', '), agregados }
}

/** Una canción generada con Suno o Lyria a partir de una letra. */
export interface Cancion {
  id: string
  taskId: string
  titulo: string
  estilo: string
  letraId?: string
  instrumental: boolean
  modelo: string
  /** Con cuál de los dos motores de música se generó (viejas registros: Suno). */
  motor?: MotorMusica
  /** true = el MP3 vive en IndexedDB (Lyria), no en una URL CDN (Suno). */
  audioLocal?: boolean
  /** Grupo de versiones (v0.5.0): Suno devuelve 2 canciones por pedido
   * y ahora cada una es su propia tarjeta. */
  grupoId?: string
  varianteId?: string
  /** Letra de la versión dentro del grupo ('A', 'B'…). */
  version?: string
  /** Letra enviada al motor (v0.6.1): permite la «válvula de escape»
   * a suno.com en canciones trabadas en la cola, sin depender de que
   * la letra siga existiendo en la biblioteca. */
  letraTexto?: string
  /** v0.8.0 — audioId de Suno (el `id` del item en sunoData): es lo
   * que pide /generate/extend para continuar ESTA pista. Las canciones
   * viejas no lo tienen; se recupera al vuelo consultando record-info
   * (match por urlAudio). */
  audioId?: string
  /** v0.8.0 — si esta canción es la continuación (extend) de otra,
   * guarda el id de la tarjeta original. */
  continuacionDe?: string
  /** v0.8.0 — segundo donde arranca esta continuación dentro de la
   * original (parámetro continueAt que se mandó a Suno). */
  continueAtSeg?: number
  estado: 'generando' | 'lista' | 'error'
  /** Estado tal cual lo reporta sunoapi.org (PENDING, TEXT_SUCCESS,
   * FIRST_SUCCESS…) — alimenta la barrita de etapas de la v0.4.5. */
  estadoCrudo?: string
  urlAudio?: string
  urlPortada?: string
  duracionSeg?: number
  error?: string
  fecha: number
}
