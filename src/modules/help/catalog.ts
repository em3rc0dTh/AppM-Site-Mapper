/**
 * Stable, allowlisted registry. Source bodies live in docs/user-guide/*.md.
 * Never derive a file path from URL input.
 */
export type HelpCategory = 'start' | 'infrastructure' | 'equipment' | 'energy' | 'observability' | 'practice';
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
  { id: 'start', es: 'Primeros pasos', en: 'Getting started' },
  { id: 'infrastructure', es: 'Infraestructura y planos', en: 'Infrastructure and blueprints' },
  { id: 'equipment', es: 'Racks y equipos', en: 'Racks and equipment' },
  { id: 'energy', es: 'Conexiones eléctricas', en: 'Power connections' },
  { id: 'observability', es: 'Telemetría y diagnóstico', en: 'Telemetry and diagnostics' },
  { id: 'practice', es: 'Aprendizaje y referencia', en: 'Training and reference' },
];

export const helpCatalog: readonly HelpEntry[] = [
  {
    slug: 'manual-maestro', file: 'manual-maestro.md', category: 'start',
    title: 'Manual maestro: operación de principio a fin',
    summary: 'Acceso, inventario, Blueprint, equipos, terminales, PowerPath y telemetría, en un solo recorrido.',
    enTitle: 'Complete operator manual',
    enSummary: 'From login to inventory, Blueprint, equipment, power and telemetry.',
    keywords: ['manual', 'overview', 'inicio', 'operador'], minutes: 24,
  },
  {
    slug: 'primer-acceso-y-usuarios', file: 'primer-acceso-y-usuarios.md', category: 'start',
    title: 'Iniciar sesión y administrar usuarios',
    summary: 'Primer acceso, contraseña temporal, roles y gestión de usuarios autorizados.',
    enTitle: 'Sign in and manage users',
    enSummary: 'First login, temporary passwords, roles and authorized user management.',
    keywords: ['login', 'cuenta', 'password', 'admin', 'superadmin', 'usuario'], minutes: 8,
  },
  {
    slug: 'conceptos', file: 'conceptos.md', category: 'start',
    title: 'Conceptos y glosario de Site Mapper',
    summary: 'Comprender Network, Room, Bay, Rack, Device, Equipment, PowerPath y LIVE.',
    enTitle: 'Site Mapper concepts and glossary',
    enSummary: 'Understand Network, Room, Bay, Rack, Device, Equipment, PowerPath and LIVE.',
    keywords: ['glosario', 'terminos', 'jerarquia', 'glossary'], minutes: 7,
  },
  {
    slug: 'entidades', file: 'entidades.md', category: 'infrastructure',
    title: 'Crear y navegar infraestructura',
    summary: 'Network → Site → Structure → Level → Room, límites y navegación.',
    enTitle: 'Create and navigate infrastructure',
    enSummary: 'Network → Site → Structure → Level → Room, boundaries and navigation.',
    keywords: ['network', 'site', 'structure', 'level', 'room', 'explore'], minutes: 10,
  },
  {
    slug: 'espacios-y-racks', file: 'espacios-y-racks.md', category: 'infrastructure',
    title: 'Blueprint: dibujar una sala y colocar un Rack',
    summary: 'EDIT ROOM, límites, Bay, Position, Place Rack y SAVE LAYOUT, sin perder el borrador.',
    enTitle: 'Blueprint: draw a room and place a rack',
    enSummary: 'EDIT ROOM, boundaries, Bay, Position, Place Rack and SAVE LAYOUT.',
    keywords: ['blueprint', 'rack', 'bay', 'position', 'layout', 'cas', 'plano'], minutes: 10,
  },
  {
    slug: 'equipos-y-posiciones', file: 'equipos-y-posiciones.md', category: 'equipment',
    title: 'Device, Equipment y posiciones de breaker',
    summary: 'Composición física, Panels de 24 slots, posiciones y montaje de componentes.',
    enTitle: 'Device, Equipment and breaker positions',
    enSummary: 'Physical composition, 24-slot panels, positions and component installation.',
    keywords: ['device', 'equipment', 'breaker', 'panel', 'warehouse', 'slots'], minutes: 12,
  },
  {
    slug: 'conexiones', file: 'conexiones.md', category: 'energy',
    title: 'Crear y verificar conexiones POWER',
    summary: 'Terminales OUTPUT/INPUT, conexión física registrada, Feed A/B y rutas ocupadas.',
    enTitle: 'Create and verify POWER connections',
    enSummary: 'OUTPUT/INPUT terminals, recorded connection, Feed A/B and busy ports.',
    keywords: ['powerpath', 'power', 'feed', 'port', 'terminal', 'connection'], minutes: 12,
  },
  {
    slug: 'telemetria', file: 'telemetria.md', category: 'observability',
    title: 'Asociar puntos MQTT y consultar LIVE',
    summary: 'Comisionamiento de Panel, cuatro métricas por breaker, lectura reciente e histórico.',
    enTitle: 'Map MQTT points and inspect LIVE data',
    enSummary: 'Panel commissioning, four metrics per breaker, fresh data and history.',
    keywords: ['mqtt', 'bindings', 'point', 'live', 'publisher', 'telemetry'], minutes: 12,
  },
  {
    slug: 'recorrido-completo-login-mqtt-snmp-modbus',
    file: 'recorrido-completo-login-mqtt-snmp-modbus.md', category: 'observability',
    title: 'Recorrido operativo: MQTT, SNMP, Timescale y Modbus',
    summary: 'Inspeccionar fuentes independientes, señales simuladas, históricos y salida Modbus.',
    enTitle: 'Operator walkthrough: MQTT, SNMP, Timescale and Modbus',
    enSummary: 'Inspect independent sources, simulated signals, history and Modbus output.',
    keywords: ['snmp', 'mqtt', 'timescale', 'modbus', 'bdfb', 'lab'], minutes: 18,
  },
  {
    slug: 'verificacion', file: 'verificacion.md', category: 'observability',
    title: 'Comprobar estados y resolver problemas',
    summary: 'Distinguir inventario, PowerPath, bindings, LIVE, STALE, NO DATA y errores.',
    enTitle: 'Verify status and troubleshoot',
    enSummary: 'Distinguish inventory, PowerPath, bindings, LIVE, STALE, NO DATA and errors.',
    keywords: ['error', 'stale', 'unmapped', 'history', 'no data', 'diagnostico'], minutes: 9,
  },
  {
    slug: 'modelo-de-datos', file: 'modelo-de-datos.md', category: 'practice',
    title: 'Modelo de datos explicado para operadores',
    summary: 'Qué representa y persiste cada entidad; límites entre objetos, conexiones y señales.',
    enTitle: 'Data model explained for operators',
    enSummary: 'What each entity represents and stores; objects, connections and measurements.',
    keywords: ['modelo', 'mongodb', 'datos', 'persistencia'], minutes: 10,
  },
  {
    slug: 'practica-guiada', file: 'practica-guiada.md', category: 'practice',
    title: 'Práctica guiada y criterios de aprobación',
    summary: 'Ejercicio de observación seguro y práctica de creación solo en entornos de entrenamiento.',
    enTitle: 'Guided practice and completion criteria',
    enSummary: 'Safe read-only exercise and authorized training-environment edits.',
    keywords: ['tutorial', 'ejercicio', 'training', 'practice'], minutes: 35,
  },
  {
    slug: 'capturas-y-capacitacion', file: 'capturas-y-capacitacion.md', category: 'practice',
    title: 'Capacitación y catálogo de capturas',
    summary: 'Secuencia para documentar y enseñar el producto con imágenes reales.',
    enTitle: 'Training and screenshot checklist',
    enSummary: 'How to teach and document the product with real screenshots.',
    keywords: ['capturas', 'screenshot', 'evidencia', 'entrenamiento'], minutes: 7,
  },
  {
    slug: 'evidencia-visual', file: 'evidencia-visual.md', category: 'practice',
    title: 'Estado de evidencia visual',
    summary: 'Qué capturas reales existen, cuáles son parciales y cuáles están pendientes.',
    enTitle: 'Visual evidence status',
    enSummary: 'What screenshots exist, are partial, or remain pending.',
    keywords: ['evidencia', 'captura', 'verificado', 'pendiente'], minutes: 6,
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

/** Route families are only context recommendations, never sources of authorization. */
export function recommendHelp(pathname: string): readonly string[] {
  if (pathname.startsWith('/blueprint/')) return ['espacios-y-racks', 'practica-guiada'];
  if (pathname.startsWith('/rack/')) return ['espacios-y-racks', 'equipos-y-posiciones'];
  if (pathname.startsWith('/device/')) return ['equipos-y-posiciones', 'conexiones', 'telemetria'];
  if (pathname.startsWith('/power/connect')) return ['conexiones', 'verificacion'];
  if (pathname.startsWith('/power')) return ['conexiones', 'verificacion'];
  if (pathname.startsWith('/telemetry')) return ['telemetria', 'recorrido-completo-login-mqtt-snmp-modbus', 'verificacion'];
  if (pathname.startsWith('/settings')) return ['primer-acceso-y-usuarios', 'conceptos'];
  if (pathname.startsWith('/topology/') || pathname === '/network') return ['entidades', 'espacios-y-racks'];
  if (pathname.startsWith('/warehouse')) return ['equipos-y-posiciones', 'modelo-de-datos'];
  return ['manual-maestro', 'conceptos', 'practica-guiada'];
}
