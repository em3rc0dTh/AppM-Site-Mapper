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
  {
    slug: 'editar-limites',
    file: 'editar-limites.md',
    category: 'infrastructure',
    title: 'Modificar los límites de un sitio o edificio',
    summary: 'Mueve los puntos del contorno, revisa el plano y guarda con seguridad.',
    enTitle: 'Edit a site or building boundary',
    enSummary: 'Move boundary points, review the shape and save your changes.',
    keywords: ['editar', 'boundary', 'vertice', 'polygon', 'limites', 'poligono'],
    minutes: 5,
  },
  {
    slug: 'retirar-elementos',
    file: 'retirar-elementos.md',
    category: 'practice',
    title: 'Retirar o archivar un elemento',
    summary: 'Conoce qué puedes retirar, qué lo impide y cómo evitar borrar información por error.',
    enTitle: 'Remove or archive an item',
    enSummary: 'Learn what can be removed, what may block it and how to avoid mistakes.',
    keywords: ['retirar', 'archivo', 'archive', 'remove', 'delete', 'restaurar', 'restore'],
    minutes: 6,
  },
  {
    slug: 'plantillas-warehouse',
    file: 'plantillas-warehouse.md',
    category: 'equipment',
    title: 'Utilizar equipos del catálogo Warehouse',
    summary: 'Busca una plantilla, úsala y comprueba dónde quedó instalada.',
    enTitle: 'Use equipment from Warehouse',
    enSummary: 'Choose a template, use it and check where the equipment was installed.',
    keywords: ['warehouse', 'template', 'plantilla', 'one-off', 'catalogo'],
    minutes: 5,
  },
  {
    slug: 'panel-y-breakers',
    file: 'panel-y-breakers.md',
    category: 'equipment',
    title: 'Crear un panel y colocar interruptores',
    summary: 'Prepara las posiciones del panel e instala cada breaker en su lugar.',
    enTitle: 'Create a panel and add breakers',
    enSummary: 'Set up panel positions and install breakers in the right slots.',
    keywords: ['breaker', 'panel', 'circuito', 'slot', 'position', 'posicion'],
    minutes: 7,
  },
  {
    slug: 'terminales-y-entradas',
    file: 'terminales-y-entradas.md',
    category: 'energy',
    title: 'Preparar entradas y salidas de energía',
    summary: 'Identifica entradas, salidas y conexiones antes de guardar.',
    enTitle: 'Prepare power inputs and outputs',
    enSummary: 'Identify power inputs, outputs and connections before saving.',
    keywords: ['access port', 'terminal', 'power', 'feed', 'dc', 'input', 'shunt'],
    minutes: 7,
  },
  {
    slug: 'vincular-mqtt',
    file: 'vincular-mqtt.md',
    category: 'observability',
    title: 'Conectar las lecturas de un breaker',
    summary: 'Relaciona un breaker con sus lecturas MQTT y comprueba si los datos están llegando.',
    enTitle: 'Connect readings to a breaker',
    enSummary: 'Link a breaker to its MQTT readings and check whether data is arriving.',
    keywords: ['mqtt', 'commission', 'commissioning', '4/4', 'raw point', 'binding', 'breaker'],
    minutes: 7,
  },
  {
    slug: 'configurar-snmp',
    file: 'configurar-snmp.md',
    category: 'observability',
    title: 'Conectar las lecturas de una entrada DC',
    summary: 'Relaciona una entrada DC con sus lecturas SNMP y comprueba qué está recibiendo.',
    enTitle: 'Connect readings to a DC input',
    enSummary: 'Link a DC input to its SNMP readings and check what it is receiving.',
    keywords: ['snmp', 'oid', 'config2', 'config4', 'shunt', 'feed', 'current', 'voltage'],
    minutes: 9,
  },
  {
    slug: 'historial-y-graficos',
    file: 'historial-y-graficos.md',
    category: 'observability',
    title: 'Revisar el historial y los gráficos',
    summary: 'Compara lecturas anteriores sin confundirlas con datos en vivo.',
    enTitle: 'Explore reading history and charts',
    enSummary: 'Compare past measurements without confusing them with live data.',
    keywords: ['timescale', 'history', 'chart', 'graphs', '24h', '7d', 'historial'],
    minutes: 6,
  },
  {
    slug: 'datos-industriales',
    file: 'datos-industriales.md',
    category: 'observability',
    title: 'Entender de dónde vienen los datos',
    summary: 'Diferencia MQTT, SNMP y Modbus de forma sencilla.',
    enTitle: 'Understand where the data comes from',
    enSummary: 'Learn the difference between MQTT, SNMP and Modbus.',
    keywords: ['mqtt', 'snmp', 'modbus', 'source', 'signal', 'data', 'fuente'],
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
  if (pathname.startsWith('/rack/'))
    return ['equipos-y-posiciones', 'plantillas-warehouse', 'espacios-y-racks'];
  if (pathname.startsWith('/device/'))
    return ['panel-y-breakers', 'vincular-mqtt', 'configurar-snmp', 'telemetria'];
  if (pathname.startsWith('/power')) return ['terminales-y-entradas', 'conexiones'];
  if (pathname.startsWith('/telemetry'))
    return ['telemetria', 'historial-y-graficos', 'verificacion'];
  if (pathname.startsWith('/settings'))
    return ['primer-acceso-y-usuarios', 'capturas-y-capacitacion'];
  if (pathname.startsWith('/topology/') || pathname === '/network')
    return ['conceptos', 'entidades'];
  if (pathname.startsWith('/warehouse')) return ['plantillas-warehouse', 'panel-y-breakers'];
  return ['manual-maestro', 'practica-guiada', 'capturas-y-capacitacion'];
}

/**
 * Workflow maps are references to the reviewed product map (docs/product).
 * A mapping does NOT imply the operation passed UX acceptance.
 */
export const helpWorkflowCoverage: Readonly<Record<string, readonly string[]>> = {
  'manual-maestro': ['WF-NAV-01', 'WF-NAV-02', 'WF-NAV-08'],
  'primer-acceso-y-usuarios': ['WF-ACC-01', 'WF-ACC-02', 'WF-ACC-08'],
  conceptos: ['WF-NAV-02', 'WF-TOP-09'],
  entidades: ['WF-TOP-02', 'WF-TOP-03', 'WF-TOP-04', 'WF-TOP-05'],
  'espacios-y-racks': ['WF-MAP-09', 'WF-MAP-10', 'WF-MAP-11', 'WF-MAP-12', 'WF-MAP-15'],
  'equipos-y-posiciones': ['WF-EQ-01', 'WF-EQ-02', 'WF-EQ-07'],
  conexiones: ['WF-PWR-01', 'WF-PWR-02', 'WF-PWR-03', 'WF-PWR-04'],
  telemetria: ['WF-HIST-01', 'WF-HIST-02', 'WF-HIST-07'],
  'recorrido-completo-login-mqtt-snmp-modbus': ['WF-SNMP-15', 'WF-HIST-01'],
  verificacion: ['WF-HIST-07', 'WF-HIST-08'],
  'modelo-de-datos': ['WF-TOP-09', 'WF-HIST-11'],
  'practica-guiada': ['WF-NAV-01', 'WF-NAV-02', 'WF-EQ-02'],
  'capturas-y-capacitacion': ['WF-NAV-03', 'WF-HIST-07'],
  'evidencia-visual': ['WF-MAP-09', 'WF-HIST-07'],
  'editar-limites': ['WF-MAP-03', 'WF-MAP-04', 'WF-MAP-05', 'WF-MAP-07'],
  'retirar-elementos': ['WF-MAP-14', 'WF-EQ-11', 'WF-TOP-12'],
  'plantillas-warehouse': ['WF-WH-01', 'WF-WH-06', 'WF-WH-07'],
  'panel-y-breakers': ['WF-EQ-04', 'WF-EQ-05', 'WF-EQ-06', 'WF-EQ-07'],
  'terminales-y-entradas': ['WF-PORT-01', 'WF-PORT-02', 'WF-PORT-05', 'WF-PORT-06'],
  'vincular-mqtt': ['WF-MQTT-04', 'WF-MQTT-05', 'WF-MQTT-06', 'WF-MQTT-07'],
  'configurar-snmp': ['WF-SNMP-01', 'WF-SNMP-03', 'WF-SNMP-08', 'WF-SNMP-09'],
  'historial-y-graficos': ['WF-HIST-04', 'WF-HIST-05', 'WF-SNMP-16'],
  'datos-industriales': ['WF-MQTT-10', 'WF-SNMP-13', 'WF-MOD-03'],
};

/** A reading guide is available to everyone; edit guides explain when authorization is needed. */
export const helpEditorGuides: readonly string[] = [
  'entidades',
  'editar-limites',
  'espacios-y-racks',
  'plantillas-warehouse',
  'panel-y-breakers',
  'terminales-y-entradas',
  'vincular-mqtt',
  'configurar-snmp',
  'retirar-elementos',
];

export type HelpJourney = Readonly<{
  id: string;
  title: string;
  enTitle: string;
  description: string;
  enDescription: string;
  slugs: readonly string[];
}>;

/** Recommended task sequences, never a claim that actions happen automatically. */
export const helpJourneys: readonly HelpJourney[] = [
  {
    id: 'start',
    title: 'Soy nuevo en Site Mapper',
    enTitle: 'I am new to Site Mapper',
    description: 'Aprende a orientarte antes de crear, editar o revisar datos.',
    enDescription: 'Learn your way around before creating, editing or reviewing data.',
    slugs: ['manual-maestro', 'conceptos', 'practica-guiada'],
  },
  {
    id: 'locations',
    title: 'Crear una instalación',
    enTitle: 'Create an installation',
    description: 'Crea Site, edificio, nivel y sala; después organiza su plano.',
    enDescription: 'Create the Site, building, level and room, then arrange its plan.',
    slugs: ['entidades', 'editar-limites', 'espacios-y-racks'],
  },
  {
    id: 'equipment',
    title: 'Preparar racks y equipos',
    enTitle: 'Set up racks and equipment',
    description: 'Warehouse, composición, paneles, breakers y terminales.',
    enDescription: 'Warehouse, composition, panels, breakers and terminals.',
    slugs: [
      'plantillas-warehouse',
      'equipos-y-posiciones',
      'panel-y-breakers',
      'terminales-y-entradas',
    ],
  },
  {
    id: 'power',
    title: 'Registrar y revisar energía',
    enTitle: 'Record and review power',
    description: 'Sigue una conexión y entiende sus extremos y feeds.',
    enDescription: 'Follow a connection and understand its ends and feeds.',
    slugs: ['conexiones', 'evidencia-visual'],
  },
  {
    id: 'readings',
    title: 'Ver y entender mediciones',
    enTitle: 'View and understand measurements',
    description: 'MQTT, SNMP, datos recientes, históricos y estados.',
    enDescription: 'MQTT, SNMP, live readings, history and status.',
    slugs: [
      'datos-industriales',
      'vincular-mqtt',
      'configurar-snmp',
      'telemetria',
      'historial-y-graficos',
      'verificacion',
      'recorrido-completo-login-mqtt-snmp-modbus',
    ],
  },
  {
    id: 'safe-use',
    title: 'Cambios y operaciones seguras',
    enTitle: 'Safe changes and operations',
    description: 'Acceso, retirada de elementos y dudas habituales.',
    enDescription: 'Account access, safe removal and common questions.',
    slugs: [
      'primer-acceso-y-usuarios',
      'retirar-elementos',
      'capturas-y-capacitacion',
      'modelo-de-datos',
    ],
  },
];

export const helpBeginnerPath: readonly string[] = [
  'manual-maestro',
  'conceptos',
  'entidades',
  'espacios-y-racks',
  'equipos-y-posiciones',
  'panel-y-breakers',
  'conexiones',
  'telemetria',
  'historial-y-graficos',
  'verificacion',
];

export const helpScreenshotBySlug: Readonly<Record<string, string>> = {
  entidades: '/help/screenshots/create-site.webp',
  'espacios-y-racks': '/help/screenshots/edit-room.webp',
  'equipos-y-posiciones': '/help/screenshots/rack-focus.webp',
  'panel-y-breakers': '/help/screenshots/breaker-live.webp',
  conexiones: '/help/screenshots/power-path.webp',
  telemetria: '/help/screenshots/breaker-live.webp',
};

export function getHelpJourneyForArticle(slug: string) {
  const journey = helpJourneys.find((item) => item.slugs.includes(slug));
  return journey ? { journey, index: journey.slugs.indexOf(slug) } : null;
}
