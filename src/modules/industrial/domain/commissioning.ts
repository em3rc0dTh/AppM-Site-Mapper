/**
 * Commissioned industrial communications are operational configuration, not a second
 * equipment inventory and not proof of physical connectivity.
 */
export type IndustrialRole = 'GATEWAY' | 'METER';
export type UplinkProtocol = 'MQTT' | 'MODBUS_TCP';
export type ElectricalMetric = 'VOLTAGE' | 'CURRENT' | 'POWER' | 'ENERGY';

export interface CommissioningEvidence {
  readonly projectId: string;
  readonly documentName: string;
  readonly revision: string;
  readonly reference?: string;
  readonly projectName?: string;
  readonly site?: string;
  readonly client?: string;
  readonly responsible?: string;
  readonly documentDate?: string;
  readonly documentStatus?: string;
}

export type CommissioningRecordStatus = 'DECLARED' | 'FIELD_VERIFIED';
export type CredentialState = 'NOT_DECLARED' | 'PRESENT_IN_SOURCE' | 'SECRET_REFERENCED';

export type CommissioningWarningCode =
  'DUPLICATE_DECLARED_IP' | 'DUPLICATE_DECLARED_MAC' | 'DEFAULT_GATEWAY_OUTSIDE_SUBNET';

export interface CommissioningWarning {
  readonly code: CommissioningWarningCode;
  readonly severity: 'FIELD_CONFIRMATION_REQUIRED';
  readonly field: 'network.ip' | 'macAddress' | 'network.gateway';
  readonly equipmentIds: readonly string[];
  readonly value?: string;
}

export type CommissioningReadinessStage =
  | 'DOCUMENTED'
  | 'NETWORK_PENDING'
  | 'MQTT_IDENTITY_PENDING'
  | 'METER_PENDING'
  | 'METER_READY'
  | 'CHANNELS_PARTIAL'
  | 'CHANNELS_CONFIRMED'
  | 'FIELD_VERIFIED';

export interface CommissioningReadiness {
  readonly equipmentId: string;
  readonly role: IndustrialRole;
  readonly stage: CommissioningReadinessStage;
  readonly networkDeclared: boolean;
  readonly mqttIdentityConfirmed: boolean;
  readonly meterReady: boolean;
  readonly confirmedChannels: number;
  readonly channelCount?: number;
  readonly fieldVerified: boolean;
}

export interface NetworkServiceConfiguration {
  readonly protocol: UplinkProtocol;
  /** Omitted when the source document does not specify the service port. */
  readonly port?: number;
}

export interface NetworkConfiguration {
  readonly ip: string;
  readonly mask: string;
  readonly gateway: string;
  readonly services: readonly NetworkServiceConfiguration[];
}

export interface Rs485Configuration {
  readonly baudRate: number;
  readonly dataBits: 7 | 8;
  readonly parity: 'NONE' | 'EVEN' | 'ODD';
  readonly stopBits: 1 | 2;
  readonly slaveId?: number;
}

export interface CommunicationProfileInput {
  readonly equipmentId: string;
  readonly role: IndustrialRole;
  readonly recordStatus: CommissioningRecordStatus;
  readonly gatewayEquipmentId?: string;
  readonly sourceIdentity?: string;
  readonly network?: NetworkConfiguration;
  readonly macAddress?: string;
  readonly loginUsername?: string;
  /** Reference to an approved secret store. Never a plaintext password. */
  readonly credentialState?: CredentialState;
  readonly credentialRef?: string;
  readonly gatewayNumber?: string;
  readonly downlinkMode?: string;
  readonly declaredSlaveCount?: number;
  readonly meterNumber?: string;
  readonly channelCount?: number;
  readonly channelDescription?: string;
  readonly hallSensorDescription?: string;
  readonly termination120Ohm?: boolean;
  /** Documentary C&P state, never treated as live connectivity. */
  readonly documentedRs485Status?: string;
  readonly rs485: Rs485Configuration;
  readonly evidence: CommissioningEvidence;
}

export interface CommunicationProfile extends CommunicationProfileInput {
  readonly bdfbDeviceId: string;
  readonly revisionNumber: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly history: readonly {
    readonly revisionNumber: number;
    readonly updatedAt: string;
    readonly updatedBy: string;
    readonly snapshot: CommunicationProfileInput;
  }[];
}

export interface ConfirmChannelInput {
  readonly meterEquipmentId: string;
  readonly breakerId: string;
  readonly channel: number;
  readonly rawPointId: string;
  readonly metrics: readonly ElectricalMetric[];
  readonly evidence: CommissioningEvidence;
  readonly physicallyVerified: true;
}

export interface RetireChannelInput {
  readonly breakerId: string;
  readonly sourceIdentity: string;
  readonly rawPointId: string;
  readonly evidence: CommissioningEvidence;
  readonly confirmRetirement: true;
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const only = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function ipv4(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return false;
  return value.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
}

function netmask(value: unknown): value is string {
  if (!ipv4(value)) return false;
  const bits = value
    .split('.')
    .map(Number)
    .map((octet) => octet.toString(2).padStart(8, '0'))
    .join('');
  return !bits.includes('01');
}

export function parseEvidence(raw: unknown): CommissioningEvidence | null {
  if (
    !object(raw) ||
    !only(raw, [
      'projectId',
      'documentName',
      'revision',
      'reference',
      'projectName',
      'site',
      'client',
      'responsible',
      'documentDate',
      'documentStatus',
    ])
  )
    return null;
  if (!text(raw.projectId, 100) || !text(raw.documentName, 160) || !text(raw.revision, 60))
    return null;
  for (const key of [
    'reference',
    'projectName',
    'site',
    'client',
    'responsible',
    'documentDate',
    'documentStatus',
  ] as const) {
    if (raw[key] !== undefined && !text(raw[key], key === 'reference' ? 240 : 160)) return null;
  }
  return {
    projectId: raw.projectId.trim(),
    documentName: raw.documentName.trim(),
    revision: raw.revision.trim(),
    ...(typeof raw.reference === 'string' ? { reference: raw.reference.trim() } : {}),
    ...(typeof raw.projectName === 'string' ? { projectName: raw.projectName.trim() } : {}),
    ...(typeof raw.site === 'string' ? { site: raw.site.trim() } : {}),
    ...(typeof raw.client === 'string' ? { client: raw.client.trim() } : {}),
    ...(typeof raw.responsible === 'string' ? { responsible: raw.responsible.trim() } : {}),
    ...(typeof raw.documentDate === 'string' ? { documentDate: raw.documentDate.trim() } : {}),
    ...(typeof raw.documentStatus === 'string'
      ? { documentStatus: raw.documentStatus.trim() }
      : {}),
  };
}

export function parseProfileInput(raw: unknown): CommunicationProfileInput | null {
  if (
    !object(raw) ||
    !only(raw, [
      'equipmentId',
      'role',
      'recordStatus',
      'gatewayEquipmentId',
      'sourceIdentity',
      'network',
      'macAddress',
      'loginUsername',
      'credentialState',
      'credentialRef',
      'gatewayNumber',
      'downlinkMode',
      'declaredSlaveCount',
      'meterNumber',
      'channelCount',
      'channelDescription',
      'hallSensorDescription',
      'termination120Ohm',
      'documentedRs485Status',
      'rs485',
      'evidence',
    ])
  )
    return null;
  if (
    !text(raw.equipmentId, 160) ||
    (raw.role !== 'GATEWAY' && raw.role !== 'METER') ||
    (raw.recordStatus !== 'DECLARED' && raw.recordStatus !== 'FIELD_VERIFIED')
  )
    return null;
  for (const [key, max] of [
    ['loginUsername', 120],
    ['credentialRef', 240],
    ['gatewayNumber', 80],
    ['downlinkMode', 120],
    ['meterNumber', 80],
    ['channelDescription', 180],
    ['hallSensorDescription', 180],
    ['documentedRs485Status', 120],
  ] as const) {
    if (raw[key] !== undefined && !text(raw[key], max)) return null;
  }
  if (
    raw.macAddress !== undefined &&
    (typeof raw.macAddress !== 'string' ||
      !/^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(raw.macAddress.trim()))
  )
    return null;
  if (
    raw.credentialState !== undefined &&
    !['NOT_DECLARED', 'PRESENT_IN_SOURCE', 'SECRET_REFERENCED'].includes(
      String(raw.credentialState),
    )
  )
    return null;
  if (
    raw.credentialRef !== undefined &&
    (typeof raw.credentialRef !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+$/.test(raw.credentialRef.trim()))
  )
    return null;
  if (raw.credentialState === 'SECRET_REFERENCED' && typeof raw.credentialRef !== 'string')
    return null;
  const evidence = parseEvidence(raw.evidence);
  if (
    !evidence ||
    !object(raw.rs485) ||
    !only(raw.rs485, ['baudRate', 'dataBits', 'parity', 'stopBits', 'slaveId'])
  )
    return null;
  const serial = raw.rs485;
  if (
    !Number.isInteger(serial.baudRate) ||
    Number(serial.baudRate) < 300 ||
    Number(serial.baudRate) > 115200 ||
    (serial.dataBits !== 7 && serial.dataBits !== 8) ||
    !['NONE', 'EVEN', 'ODD'].includes(String(serial.parity)) ||
    (serial.stopBits !== 1 && serial.stopBits !== 2)
  )
    return null;
  const rs485: Rs485Configuration = {
    baudRate: Number(serial.baudRate),
    dataBits: serial.dataBits,
    parity: serial.parity as Rs485Configuration['parity'],
    stopBits: serial.stopBits,
  };
  if (raw.role === 'GATEWAY') {
    if (
      raw.gatewayEquipmentId !== undefined ||
      serial.slaveId !== undefined ||
      (raw.sourceIdentity !== undefined &&
        (!text(raw.sourceIdentity, 120) ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(raw.sourceIdentity))) ||
      !object(raw.network) ||
      !only(raw.network, ['ip', 'mask', 'gateway', 'services']) ||
      !ipv4(raw.network.ip) ||
      !netmask(raw.network.mask) ||
      !ipv4(raw.network.gateway) ||
      !Array.isArray(raw.network.services) ||
      raw.network.services.length < 1 ||
      raw.network.services.length > 2
    )
      return null;
    const services: NetworkServiceConfiguration[] = [];
    const protocols = new Set<string>();
    for (const rawService of raw.network.services) {
      if (
        !object(rawService) ||
        !only(rawService, ['protocol', 'port']) ||
        !['MQTT', 'MODBUS_TCP'].includes(String(rawService.protocol)) ||
        protocols.has(String(rawService.protocol)) ||
        (rawService.port !== undefined &&
          (!Number.isInteger(rawService.port) ||
            Number(rawService.port) < 1 ||
            Number(rawService.port) > 65535))
      )
        return null;
      protocols.add(String(rawService.protocol));
      services.push({
        protocol: rawService.protocol as UplinkProtocol,
        ...(rawService.port !== undefined ? { port: Number(rawService.port) } : {}),
      });
    }
    if (
      raw.meterNumber !== undefined ||
      raw.channelCount !== undefined ||
      raw.channelDescription !== undefined ||
      raw.hallSensorDescription !== undefined ||
      raw.termination120Ohm !== undefined ||
      raw.documentedRs485Status !== undefined ||
      (raw.declaredSlaveCount !== undefined &&
        (!Number.isInteger(raw.declaredSlaveCount) ||
          Number(raw.declaredSlaveCount) < 0 ||
          Number(raw.declaredSlaveCount) > 247))
    )
      return null;
    return {
      equipmentId: raw.equipmentId.trim(),
      role: 'GATEWAY',
      recordStatus: raw.recordStatus,
      ...(typeof raw.sourceIdentity === 'string'
        ? { sourceIdentity: raw.sourceIdentity.trim() }
        : {}),
      ...(typeof raw.macAddress === 'string'
        ? { macAddress: raw.macAddress.trim().toUpperCase() }
        : {}),
      ...(typeof raw.loginUsername === 'string' ? { loginUsername: raw.loginUsername.trim() } : {}),
      ...(typeof raw.credentialState === 'string'
        ? { credentialState: raw.credentialState as CredentialState }
        : {}),
      ...(typeof raw.credentialRef === 'string' ? { credentialRef: raw.credentialRef.trim() } : {}),
      ...(typeof raw.gatewayNumber === 'string' ? { gatewayNumber: raw.gatewayNumber.trim() } : {}),
      ...(typeof raw.downlinkMode === 'string' ? { downlinkMode: raw.downlinkMode.trim() } : {}),
      ...(typeof raw.declaredSlaveCount === 'number'
        ? { declaredSlaveCount: raw.declaredSlaveCount }
        : {}),
      network: {
        ip: raw.network.ip,
        mask: raw.network.mask,
        gateway: raw.network.gateway,
        services,
      },
      rs485,
      evidence,
    };
  }
  if (
    !text(raw.gatewayEquipmentId, 160) ||
    raw.gatewayEquipmentId === raw.equipmentId ||
    raw.sourceIdentity !== undefined ||
    raw.network !== undefined ||
    raw.macAddress !== undefined ||
    raw.loginUsername !== undefined ||
    raw.credentialState !== undefined ||
    raw.credentialRef !== undefined ||
    raw.gatewayNumber !== undefined ||
    raw.downlinkMode !== undefined ||
    raw.declaredSlaveCount !== undefined ||
    !Number.isInteger(serial.slaveId) ||
    Number(serial.slaveId) < 1 ||
    Number(serial.slaveId) > 247 ||
    (raw.channelCount !== undefined &&
      (!Number.isInteger(raw.channelCount) ||
        Number(raw.channelCount) < 1 ||
        Number(raw.channelCount) > 256)) ||
    (raw.termination120Ohm !== undefined && typeof raw.termination120Ohm !== 'boolean')
  )
    return null;
  return {
    equipmentId: raw.equipmentId.trim(),
    role: 'METER',
    recordStatus: raw.recordStatus,
    gatewayEquipmentId: raw.gatewayEquipmentId.trim(),
    ...(typeof raw.meterNumber === 'string' ? { meterNumber: raw.meterNumber.trim() } : {}),
    ...(typeof raw.channelCount === 'number' ? { channelCount: raw.channelCount } : {}),
    ...(typeof raw.channelDescription === 'string'
      ? { channelDescription: raw.channelDescription.trim() }
      : {}),
    ...(typeof raw.hallSensorDescription === 'string'
      ? { hallSensorDescription: raw.hallSensorDescription.trim() }
      : {}),
    ...(typeof raw.termination120Ohm === 'boolean'
      ? { termination120Ohm: raw.termination120Ohm }
      : {}),
    ...(typeof raw.documentedRs485Status === 'string'
      ? { documentedRs485Status: raw.documentedRs485Status.trim() }
      : {}),
    rs485: { ...rs485, slaveId: Number(serial.slaveId) },
    evidence,
  };
}

export function parseConfirmChannel(raw: unknown): ConfirmChannelInput | null {
  if (
    !object(raw) ||
    !only(raw, [
      'meterEquipmentId',
      'breakerId',
      'channel',
      'rawPointId',
      'metrics',
      'evidence',
      'physicallyVerified',
    ])
  )
    return null;
  const evidence = parseEvidence(raw.evidence);
  const allowed = ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'];
  if (
    !evidence ||
    !text(raw.meterEquipmentId, 160) ||
    !text(raw.breakerId, 160) ||
    !Number.isInteger(raw.channel) ||
    Number(raw.channel) < 1 ||
    Number(raw.channel) > 256 ||
    !text(raw.rawPointId, 80) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(raw.rawPointId) ||
    !Array.isArray(raw.metrics) ||
    raw.metrics.length === 0 ||
    raw.metrics.length > 4 ||
    raw.metrics.some((metric) => !allowed.includes(String(metric))) ||
    new Set(raw.metrics).size !== raw.metrics.length ||
    raw.physicallyVerified !== true
  )
    return null;
  return {
    meterEquipmentId: raw.meterEquipmentId.trim(),
    breakerId: raw.breakerId.trim(),
    channel: Number(raw.channel),
    rawPointId: raw.rawPointId.trim(),
    metrics: raw.metrics as ElectricalMetric[],
    evidence,
    physicallyVerified: true,
  };
}

export function parseRetireChannel(raw: unknown): RetireChannelInput | null {
  if (
    !object(raw) ||
    !only(raw, ['breakerId', 'sourceIdentity', 'rawPointId', 'evidence', 'confirmRetirement'])
  )
    return null;
  const evidence = parseEvidence(raw.evidence);
  if (
    !evidence ||
    !text(raw.breakerId, 160) ||
    !text(raw.sourceIdentity, 120) ||
    !text(raw.rawPointId, 80) ||
    raw.confirmRetirement !== true
  )
    return null;
  return {
    breakerId: raw.breakerId.trim(),
    sourceIdentity: raw.sourceIdentity.trim(),
    rawPointId: raw.rawPointId.trim(),
    evidence,
    confirmRetirement: true,
  };
}
