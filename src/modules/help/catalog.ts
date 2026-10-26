/** Public-facing help catalog. Technical runbooks stay outside the Help Center. */
export type HelpCategory =
  'start' | 'infrastructure' | 'equipment' | 'energy' | 'observability' | 'practice';
export type HelpLocale = 'es' | 'en';

export type HelpEntry = Readonly<{
  slug: string;
  file: string;
  category: HelpCategory;
  title: string;
  summary: string;
  enTitle: string;
  enSummary: string;
  keywords: string[];
  minutes: number;
}>;

export const helpCategories: ReadonlyArray<{ id: HelpCategory; es: string; en: string }> = [
  { id: 'start', es: 'Comienza aquí', en: 'Start here' },
  { id: 'infrastructure', es: 'Espacios y planos', en: 'Spaces and plans' },
  { id: 'equipment', es: 'Equipos', en: 'Equipment' },
  { id: 'energy', es: 'Energía y conexiones', en: 'Power and connections' },
  { id: 'observability', es: 'Lecturas y estados', en: 'Readings and status' },
  { id: 'practice', es: 'Aprende más', en: 'Learn more' },
];

export const helpCatalog: readonly HelpEntry[] = [
  {
    slug: 'manual-maestro',
    file: 'manual-maestro.md',
    category: 'start',
    title: 'Conoce Site Mapper',
    summary: 'Descubre por dónde empezar y dónde encontrar cada función.',
    enTitle: 'Get to know Site Mapper',
    enSummary: 'Find your way around and discover the main features.',
    keywords: ['inicio', 'ayuda', 'manual', 'welcome'],
    minutes: 4,
  },
  {
    slug: 'primer-acceso-y-usuarios',
    file: 'primer-acceso-y-usuarios.md',
    category: 'start',
    title: 'Entrar al sistema y usar tu cuenta',
    summary: 'Inicia sesión, cambia tu contraseña y conoce las opciones de tu cuenta.',
    enTitle: 'Sign in and use your account',
    enSummary: 'Sign in, change your password and find your account options.',
    keywords: ['login', 'sesion', 'contraseña', 'password', 'usuarios', 'users'],
    minutes: 5,
  },
  {
    slug: 'conceptos',
    file: 'conceptos.md',
    category: 'start',
    title: 'Entiende cómo se organiza la infraestructura',
    summary: 'Conoce los sitios, salas, racks y equipos con un ejemplo visual.',
    enTitle: 'Understand how your infrastructure is organized',
    enSummary: 'Explore sites, rooms, racks and equipment with a visual example.',
    keywords: ['network', 'site', 'room', 'rack', 'estructura', 'glosario'],
    minutes: 5,
  },
  {
    slug: 'entidades',
    file: 'entidades.md',
    category: 'infrastructure',
    title: 'Crear un sitio, edificio o sala',
    summary: 'Agrega espacios en el lugar correcto y dibuja sus límites.',
    enTitle: 'Create a site, building or room',
    enSummary: 'Add spaces in the right place and draw their boundaries.',
    keywords: ['site', 'structure', 'level', 'room', 'crear', 'create'],
    minutes: 6,
  },
  {
    slug: 'espacios-y-racks',
    file: 'espacios-y-racks.md',
    category: 'infrastructure',
    title: 'Dibujar una sala y colocar un rack',
    summary: 'Usa el plano de la sala para agregar posiciones y ubicar racks.',
    enTitle: 'Draw a room and place a rack',
    enSummary: 'Use the room plan to add positions and place racks.',
    keywords: ['blueprint', 'rack', 'bay', 'position', 'plano'],
    minutes: 6,
  },
  {
    slug: 'equipos-y-posiciones',
    file: 'equipos-y-posiciones.md',
    category: 'equipment',
    title: 'Ver y organizar los equipos de un rack',
    summary: 'Encuentra equipos, paneles, interruptores y posiciones disponibles.',
    enTitle: 'Find and organize equipment in a rack',
    enSummary: 'Find equipment, panels, breakers and available positions.',
    keywords: ['device', 'equipment', 'breaker', 'panel', 'warehouse', 'slots'],
    minutes: 6,
  },
  {
    slug: 'conexiones',
    file: 'conexiones.md',
    category: 'energy',
    title: 'Revisar una conexión de energía',
    summary: 'Descubre de dónde viene la alimentación y a qué equipo llega.',
    enTitle: 'Check a power connection',
    enSummary: 'See where a power connection starts and where it leads.',
    keywords: ['powerpath', 'power', 'feed', 'port', 'terminal', 'energia'],
    minutes: 6,
  },
  {
    slug: 'telemetria',
    file: 'telemetria.md',
    category: 'observability',
    title: 'Consultar datos en tiempo real',
    summary: 'Revisa voltaje, corriente, potencia y consumo de los equipos.',
    enTitle: 'View live equipment readings',
    enSummary: 'Check voltage, current, power and energy readings.',
    keywords: ['mqtt', 'live', 'telemetry', 'voltaje', 'corriente', 'historial'],
    minutes: 5,
  },
  {
    slug: 'recorrido-completo-login-mqtt-snmp-modbus',
    file: 'recorrido-completo-login-mqtt-snmp-modbus.md',
    category: 'observability',
    title: 'Consultar circuitos y entradas de energía',
    summary: 'Aprende a ver cada circuito y las entradas principales de un equipo.',
    enTitle: 'View circuits and power inputs',
    enSummary: 'See individual circuits and the main power inputs of a device.',
    keywords: ['snmp', 'mqtt', 'timescale', 'modbus', 'bdfb', 'entradas'],
    minutes: 6,
  },
  {
    slug: 'verificacion',
    file: 'verificacion.md',
    category: 'observability',
    title: 'Si un equipo no muestra datos',
    summary: 'Comprende los mensajes más habituales y qué hacer en cada caso.',
    enTitle: 'When equipment readings are missing',
    enSummary: 'Understand common status messages and what to do next.',
    keywords: ['error', 'stale', 'unmapped', 'offline', 'no data', 'problemas'],
    minutes: 5,
  },
  {
    slug: 'modelo-de-datos',
    file: 'modelo-de-datos.md',
    category: 'practice',
    title: 'Qué información guarda Site Mapper',
    summary: 'Distingue ubicación, equipos, conexiones y mediciones.',
    enTitle: 'What information Site Mapper keeps',
    enSummary: 'Learn the difference between locations, equipment, connections and readings.',
    keywords: ['modelo', 'informacion', 'datos', 'ubicacion', 'identity'],
    minutes: 4,
  },
  {
    slug: 'practica-guiada',
    file: 'practica-guiada.md',
    category: 'practice',
    title: 'Tu primer recorrido por Site Mapper',
    summary: 'Practica cómo encontrar una sala, un rack y sus equipos.',
    enTitle: 'Your first Site Mapper walkthrough',
    enSummary: 'Practice finding a room, a rack and its equipment.',
    keywords: ['tutorial', 'recorrido', 'ejercicio', 'practice'],
    minutes: 8,
  },
  {
    slug: 'capturas-y-capacitacion',
    file: 'capturas-y-capacitacion.md',
    category: 'practice',
    title: 'Preguntas frecuentes',
    summary: 'Respuestas sencillas a dudas que surgen al utilizar el sistema.',
    enTitle: 'Frequently asked questions',
    enSummary: 'Quick answers to common questions about the system.',
    keywords: ['faq', 'preguntas', 'help', 'ayuda', 'dudas'],
    minutes: 4,
  },
  {
    slug: 'evidencia-visual',
    file: 'evidencia-visual.md',
    category: 'practice',
    title: 'Cómo leer planos, etiquetas y estados',
    summary: 'Interpreta los símbolos y avisos que aparecen en las pantallas.',
    enTitle: 'Understand plans, labels and status messages',
    enSummary: 'Learn to read the symbols and labels shown on screen.',
    keywords: ['plano', 'estados', 'etiquetas', 'status', 'diagram'],
    minutes: 5,
  },
] as const;

export function getHelpEntry(slug: string): HelpEntry | undefined {
  return helpCatalog.find((item) => item.slug === slug);
}
export function helpTitle(item: HelpEntry, locale: HelpLocale) {
  return locale === 'en' ? item.enTitle : item.title;
}
export function helpSummary(item: HelpEntry, locale: HelpLocale) {
  return locale === 'en' ? item.enSummary : item.summary;
}

/** Recommendations only; actual permissions remain enforced by each page. */
export function recommendHelp(pathname: string): readonly string[] {
  if (pathname.startsWith('/blueprint/')) return ['espacios-y-racks', 'evidencia-visual'];
  if (pathname.startsWith('/rack/')) return ['equipos-y-posiciones', 'espacios-y-racks'];
  if (pathname.startsWith('/device/')) return ['equipos-y-posiciones', 'conexiones', 'telemetria'];
  if (pathname.startsWith('/power')) return ['conexiones', 'evidencia-visual'];
  if (pathname.startsWith('/telemetry')) return ['telemetria', 'verificacion'];
  if (pathname.startsWith('/settings'))
    return ['primer-acceso-y-usuarios', 'capturas-y-capacitacion'];
  if (pathname.startsWith('/topology/') || pathname === '/network')
    return ['conceptos', 'entidades'];
  if (pathname.startsWith('/warehouse')) return ['equipos-y-posiciones', 'conceptos'];
  return ['manual-maestro', 'practica-guiada', 'capturas-y-capacitacion'];
}
