import fs from 'node:fs';
import ts from 'typescript';

const targets = [
  {
    path: 'src/app/device/[deviceId]/page.tsx',
    namespace: ['pages', 'device'],
    tNeedle: "const t = await getTranslations('pages.device');",
  },
  {
    path: 'src/app/telemetry/page.tsx',
    namespace: ['pages', 'telemetry'],
    setup(source) {
      if (!source.includes("getTranslations } from 'next-intl/server'")) {
        source = source.replace(
          "import { redirect } from 'next/navigation';",
          "import { redirect } from 'next/navigation';\nimport { getTranslations } from 'next-intl/server';",
        );
      }
      if (!source.includes("getTranslations('pages.telemetry')")) {
        source = source.replace(
          '\n  return (\n',
          "\n  const t = await getTranslations('pages.telemetry');\n\n  return (\n",
        );
      }
      return source;
    },
    tNeedle: "const t = await getTranslations('pages.telemetry');",
  },
  {
    path: 'src/components/equipment/equipment-composition-editor.tsx',
    namespace: ['equipmentEditor'],
    tNeedle: "const t = useTranslations('equipmentEditor');",
  },
  {
    path: 'src/components/industrial/commissioning-console.tsx',
    namespace: ['industrialCommissioning'],
    setup(source) {
      if (!source.includes("from 'next-intl'")) {
        source = source.replace(
          "import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';",
          "import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';\nimport { useTranslations } from 'next-intl';",
        );
      } else if (!source.includes('useTranslations')) {
        source = source.replace(
          /import \{([^}]+)\} from 'next-intl';/,
          (_match, names) => "import {" + names.trim() + ", useTranslations } from 'next-intl';",
        );
      }
      if (!source.includes("useTranslations('industrialCommissioning')")) {
        source = source.replace(
          "  initialDeviceId?: string;\n}) {\n",
          "  initialDeviceId?: string;\n}) {\n  const t = useTranslations('industrialCommissioning');\n",
        );
      }
      return source;
    },
    tNeedle: "const t = useTranslations('industrialCommissioning');",
  },
];

const staticDomainLabels = new Set([
  'm²','&nbsp;/&nbsp;','U','600 × 600 mm','×','mm','X','· Y','A1 ·','A2 ·','B1 ·','B2 ·',
  'V','I','P','E','MQTT ·','Shunt','bash scripts/lab/bfdb-snmp-config4.sh collectors ../bfdb-telemetry-gateway',
  '–U','kW','v','SITE MAPPER','APPMANAGER','BDFB','JSON','English','Español','A + B',
  'V · V','I · A','P · W','E · kWh','⌘ K',
]);
const technicalExamples = new Set([
  'operator@company.com','RJ45, SFP+, terminal...','Ethernet, Modbus, RS-485...',
  'BDFB-01','BDFB Panel 24P','Cisco','C9300-48P',
]);

const spanishToEnglish = new Map(Object.entries({
  'Estado de comisionamiento': 'Commissioning status',
  '· máscara': '· mask',
  'Evidencia': 'Evidence',
  'Confirmación': 'Confirmation',
  '· usuario': '· user',
  'Sin mapeo físico Acrel confirmado': 'No confirmed Acrel physical mapping',
  'Configuración Acrel · Comunicaciones, canales y trazabilidad': 'Acrel configuration · Communications, channels and traceability',
  'Uno por línea o separados por coma': 'One per line or comma-separated',
  '← Telemetría': '← Telemetry',
  'Comisionamiento industrial · Acrel': 'Industrial commissioning · Acrel',
  'Configura comunicaciones y asocia canales a breakers existentes. No crea equipos, breakers ni lecturas.': 'Configure communications and associate channels with existing breakers. This does not create equipment, breakers, or readings.',
  'BDFB existente': 'Existing BDFB',
  'Seleccionar BDFB': 'Select BDFB',
  'No hay BDFB activos registrados. Primero créalos en la topología existente.': 'No active BDFBs are registered. Create them in the existing topology first.',
  '1 · Configuración de comunicaciones': '1 · Communications configuration',
  'Selecciona un Equipment existente. Un gateway conserva la IP y la identidad del publicador; un medidor declara su Slave ID en el bus de ese gateway.': 'Select existing Equipment. A gateway keeps the IP and publisher identity; a meter declares its Slave ID on that gateway bus.',
  'Preflight documental · requiere confirmación de campo': 'Documentary preflight · field confirmation required',
  'Estas advertencias no bloquean guardar el C&P y no afirman que el documento sea incorrecto.': 'These warnings do not block saving the C&P and do not claim the document is incorrect.',
  'Buscar Equipment / alias / serial / MAC / login': 'Search Equipment / alias / serial / MAC / login',
  'Buscar...': 'Search...',
  'Seleccionar equipo': 'Select equipment',
  'Función': 'Role',
  'Medidor AMC16Z': 'AMC16Z meter',
  'Se administra en Equipment': 'Managed in Equipment',
  'Estado del registro': 'Record status',
  'Declarado / documental': 'Declared / documentary',
  'Verificado en campo': 'Field verified',
  'Serial canónico': 'Canonical serial',
  'Login / usuario': 'Login / username',
  'Password del Equipment': 'Equipment password',
  'Nueva contraseña / rotación': 'New password / rotation',
  'Contraseña revelada': 'Revealed password',
  'Eliminar contraseña guardada': 'Delete stored password',
  'Última revelación:': 'Last reveal:',
  'Auditoría de credencial (': 'Credential audit (',
  'Estado de credencial documental / externa': 'Documentary / external credential status',
  'No declarada': 'Not declared',
  'Existe en documento de origen': 'Present in source document',
  'Referencia externa (vault/secret manager)': 'External reference (vault/secret manager)',
  'Referencia externa de credencial': 'External credential reference',
  'Modo downlink': 'Downlink mode',
  'Ej. Modbus-RTU Master': 'E.g. Modbus-RTU Master',
  'Esclavos declarados': 'Declared slaves',
  'Identidad MQTT del publicador (cuando esté confirmada)': 'MQTT publisher identity (when confirmed)',
  'No inventar: dejar vacío si aún no está confirmada': 'Do not invent: leave blank until confirmed',
  'Máscara': 'Mask',
  'Puerta de enlace': 'Default gateway',
  'Servicios uplink': 'Uplink services',
  'Puerto no documentado: dejar vacío': 'Undocumented port: leave blank',
  'Ej. 502': 'E.g. 502',
  'Selecciona al menos un servicio uplink.': 'Select at least one uplink service.',
  'Ej. A1': 'E.g. A1',
  'Canales activos': 'Active channels',
  'Descripción de canales': 'Channel description',
  'Ej. 24 Circuitos DC (12 Bus A + 12 Bus B)': 'E.g. 24 DC circuits (12 Bus A + 12 Bus B)',
  'Modelo / rango / salida': 'Model / range / output',
  'Terminación 120 Ω': '120 Ω termination',
  'Sí': 'Yes',
  'Estado RS485 documentado': 'Documented RS485 status',
  'Ej. ONLINE / OK (documental)': 'E.g. ONLINE / OK (documentary)',
  'Gateway en este BDFB': 'Gateway in this BDFB',
  'Seleccionar': 'Select',
  'Bits de datos': 'Data bits',
  'Paridad': 'Parity',
  'Ninguna': 'None',
  'Par': 'Even',
  'Impar': 'Odd',
  'Bits de parada': 'Stop bits',
  '3 · Procedencia del dato': '3 · Data provenance',
  'Nombre del proyecto': 'Project name',
  'Site / ubicación': 'Site / location',
  'Cliente / operador': 'Client / operator',
  'Responsable': 'Responsible person',
  'Fecha del documento': 'Document date',
  'Estado del documento': 'Document status',
  'Documento de origen': 'Source document',
  'Revisión': 'Revision',
  'Referencia / evidencia (sin credenciales)': 'Reference / evidence (no credentials)',
  'El usuario y la fecha de edición se obtienen de la sesión del servidor. El login del equipo puede registrarse. La contraseña local se guarda únicamente mediante “Password del Equipment”, cifrada fuera del perfil de comunicación. Los campos de credencial documental/externa describen lo declarado por el C&P o un vault externo.': 'The user and edit date come from the server session. The equipment login can be recorded. The local password is stored only through “Equipment password”, encrypted outside the communication profile. Documentary/external credential fields describe what the C&P or an external vault declares.',
  'Editar configuración': 'Edit configuration',
  '2 · Mapeo físico del canal': '2 · Physical channel mapping',
  'El canal y el punto MQTT no se calculan según la posición del breaker. Debes confirmar el vínculo con evidencia de campo.': 'The channel and MQTT point are not calculated from the breaker position. Confirm the link with field evidence.',
  'canales confirmados': 'confirmed channels',
  'Medidor comisionado': 'Commissioned meter',
  'Los medidores cuyo gateway aún no tiene identidad MQTT confirmada no pueden mapearse.': 'Meters whose gateway does not yet have a confirmed MQTT identity cannot be mapped.',
  'Canal': 'Channel',
  'Punto MQTT exacto': 'Exact MQTT point',
  'Ej. 0_1_1': 'E.g. 0_1_1',
  'Breaker existente': 'Existing breaker',
  'Métricas habilitadas': 'Enabled metrics',
  'Confirmo haber verificado físicamente medidor, canal, punto publicado y breaker seleccionado.': 'I confirm that I physically verified the meter, channel, published point, and selected breaker.',
  'Usará el proyecto, documento y revisión del formulario superior. Se guardará quién confirmó y cuándo.': 'This will use the project, document, and revision from the form above. The confirmer and timestamp will be recorded.',
  'Confirmar y vincular telemetría': 'Confirm and link telemetry',
  'Asociaciones confirmadas': 'Confirmed associations',
  'No hay canales Acrel confirmados en este BDFB.': 'No Acrel channels are confirmed for this BDFB.',
  '→ canal': '→ channel',
  'Confirmo retirar esta asociación sin borrar su historial.': 'I confirm removing this association without deleting its history.',
  'Retirar mapeo': 'Remove mapping',
  'Contraseña cifrada guardada/rotada.': 'Encrypted password saved/rotated.',
  'Contraseña eliminada del almacén cifrado.': 'Password removed from encrypted storage.',
  'Contraseña revelada; la acción quedó registrada.': 'Password revealed; the action was logged.',
  'Cambio registrado. No implica verificación de conectividad en campo.': 'Change recorded. This does not imply field connectivity verification.',
  'Guardar nueva revisión': 'Save new revision',
  'Registrar configuración': 'Register configuration',
  'Pendiente de verificación': 'Pending verification',
  'Ocultar contraseña': 'Hide password',
  'Mostrar contraseña': 'Show password',
  'Rotar contraseña': 'Rotate password',
  'Guardar contraseña': 'Save password',
  'Documentado': 'Documented',
  'Red pendiente': 'Network pending',
  'Identidad MQTT pendiente': 'MQTT identity pending',
  'Medidor pendiente': 'Meter pending',
  'Medidor listo': 'Meter ready',
  'Canales parciales': 'Channels partial',
  'Canales confirmados': 'Channels confirmed',
  'IP declarada repetida': 'Duplicate declared IP',
  'MAC declarada repetida': 'Duplicate declared MAC',
  'Default gateway fuera de la subred declarada': 'Default gateway outside declared subnet',
}));

const englishToSpanish = new Map([
  ...[...spanishToEnglish.entries()].map(([es, en]) => [en, es]),
  ['Part Number (P/N)', 'Número de parte (P/N)'],
  ['Aliases', 'Alias'],
  ['Telemetry role', 'Rol de telemetría'],
  ['Logical measurement source for child breakers', 'Fuente lógica de medición para breakers secundarios'],
  ['Telemetry source S/N', 'S/N de fuente de telemetría'],
  ['Telemetry point prefix', 'Prefijo de punto de telemetría'],
  ['Telemetry readiness', 'Estado de telemetría'],
  ['Measurement model', 'Modelo de medición'],
  ['Measured via', 'Medido mediante'],
  ['Panel source S/N', 'S/N de fuente del panel'],
  ['Panel point prefix', 'Prefijo de puntos del panel'],
  ['Physical position', 'Posición física'],
  ['Resolved raw point', 'Punto RAW resuelto'],
  ['Binding', 'Vinculación'],
  ['Acrel measurement path', 'Ruta de medición Acrel'],
  ['Transport source', 'Fuente de transporte'],
  ['MAC gateway', 'MAC del gateway'],
  ['Login gateway', 'Login del gateway'],
  ['Credential note', 'Nota de credencial'],
  ['Gateway network', 'Red del gateway'],
  ['RS485 / Modbus RTU', 'RS485 / Modbus RTU'],
  ['Slave', 'Esclavo'],
  ['Serial Number (S/N)', 'Número de serie (S/N)'],
  ['Manufacturer', 'Fabricante'],
  ['Model', 'Modelo'],
  ['Industrial commissioning', 'Comisionamiento industrial'],
  ['Equipment', 'Equipment'],
  ['Gateway Acrel', 'Gateway Acrel'],
  ['Aliases / NE Name / TID (Equipment)', 'Alias / NE Name / TID (Equipment)'],
  ['Part Number (P/N) (Equipment)', 'Número de parte (P/N) (Equipment)'],
  ['Gateway Number', 'Número de gateway'],
  ['MAC Ethernet', 'MAC Ethernet'],
  ['Meter Number', 'Número de medidor'],
  ['Sensor Hall', 'Sensor Hall'],
  ['Slave ID (1–247)', 'Slave ID (1–247)'],
  ['Baud rate', 'Baud rate'],
  ['Project ID', 'ID de proyecto'],
  ['CH', 'CH'],
  ['MQTT', 'MQTT'],
  ['Modbus TCP', 'Modbus TCP'],
  ['IPv4', 'IPv4'],
  ['YYYY-MM-DD', 'YYYY-MM-DD'],
]);

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}
function allowedStaticText(value, attribute = false) {
  const text = normalize(value);
  if (!text || !/[a-zA-ZÀ-ÿ]/u.test(text)) return true;
  if (staticDomainLabels.has(text)) return true;
  if (attribute && technicalExamples.has(text)) return true;
  return false;
}
function slugify(value) {
  const base = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 72);
  return 'mk1_' + (base || 'text');
}
function ensureNamespace(root, path) {
  let current = root;
  for (const key of path) {
    if (current[key] === undefined) current[key] = {};
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
      throw new Error('Namespace conflict at ' + path.join('.'));
    }
    current = current[key];
  }
  return current;
}

const enPath = 'src/messages/en.json';
const esPath = 'src/messages/es.json';
const enMessages = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const esMessages = JSON.parse(fs.readFileSync(esPath, 'utf8'));

const phraseKeys = new Map();

function register(namespacePath, original) {
  const normalized = normalize(original);
  const english = spanishToEnglish.get(normalized) ?? normalized;
  const spanish = englishToSpanish.get(english) ?? english;
  const namespaceId = namespacePath.join('.');
  const cacheId = namespaceId + '\u0000' + english;
  const cached = phraseKeys.get(cacheId);
  if (cached) return cached;

  const enNs = ensureNamespace(enMessages, namespacePath);
  const esNs = ensureNamespace(esMessages, namespacePath);
  let key = slugify(english);
  let suffix = 2;
  while (Object.prototype.hasOwnProperty.call(enNs, key) && enNs[key] !== english) {
    key = slugify(english) + '_' + suffix++;
  }
  enNs[key] = english;
  esNs[key] = spanish;
  phraseKeys.set(cacheId, key);
  return key;
}

function applyReplacements(source, replacements) {
  replacements.sort((a, b) => b.start - a.start);
  let lastStart = source.length + 1;
  for (const replacement of replacements) {
    if (replacement.end > lastStart) {
      throw new Error('Overlapping replacement in source at ' + replacement.start);
    }
    source = source.slice(0, replacement.start) + replacement.text + source.slice(replacement.end);
    lastStart = replacement.start;
  }
  return source;
}

for (const target of targets) {
  let source = fs.readFileSync(target.path, 'utf8');
  if (target.setup) source = target.setup(source);
  const tScopeStart = source.indexOf(target.tNeedle);
  if (tScopeStart < 0) throw new Error('Translation function not found in ' + target.path);

  const ast = ts.createSourceFile(target.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const replacements = [];

  function visit(node) {
    if (ts.isJsxText(node) && node.pos > tScopeStart) {
      const raw = source.slice(node.pos, node.end);
      if (!allowedStaticText(raw)) {
        const normalized = normalize(raw);
        const key = register(target.namespace, normalized);
        const leading = /^[ \t]/.test(raw) ? "{' '}" : '';
        const trailing = /[ \t]$/.test(raw) ? "{' '}" : '';
        replacements.push({
          start: node.pos,
          end: node.end,
          text: leading + '{t(' + JSON.stringify(key) + ')}' + trailing,
        });
      }
    }

    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      ['placeholder', 'title', 'alt', 'aria-label', 'aria-description'].includes(node.name.getText(ast)) &&
      node.pos > tScopeStart
    ) {
      const raw = node.initializer.text;
      if (!allowedStaticText(raw, true)) {
        const key = register(target.namespace, raw);
        replacements.push({
          start: node.initializer.getStart(ast),
          end: node.initializer.end,
          text: '{t(' + JSON.stringify(key) + ')}',
        });
      }
    }

    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !ts.isJsxAttribute(node.parent)
    ) {
      const normalized = normalize(node.text);
      if (spanishToEnglish.has(normalized)) {
        const english = spanishToEnglish.get(normalized);
        if (node.getStart(ast) > tScopeStart) {
          const key = register(target.namespace, normalized);
          replacements.push({
            start: node.getStart(ast),
            end: node.end,
            text: 't(' + JSON.stringify(key) + ')',
          });
        } else {
          replacements.push({
            start: node.getStart(ast),
            end: node.end,
            text: JSON.stringify(english),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(ast);
  source = applyReplacements(source, replacements);
  fs.writeFileSync(target.path, source);
}

fs.writeFileSync(enPath, JSON.stringify(enMessages, null, 2) + '\n');
fs.writeFileSync(esPath, JSON.stringify(esMessages, null, 2) + '\n');

console.log('Localized consolidation UI copy across', targets.length, 'TSX files.');
