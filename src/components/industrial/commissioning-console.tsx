'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  CommissioningObservabilityPanel,
  type CommissioningObservabilityData,
} from '@/components/industrial/commissioning-observability';

interface Bdfb {
  id: string;
  name: string;
}
interface Equipment {
  id: string;
  name: string;
  equipmentType: string;
  model?: string;
  serialNumber?: string;
  partNumber?: string;
  aliases?: string[];
}
interface Evidence {
  projectId: string;
  documentName: string;
  revision: string;
  reference?: string;
  projectName?: string;
  site?: string;
  client?: string;
  responsible?: string;
  documentDate?: string;
  documentStatus?: string;
}
interface Profile {
  equipmentId: string;
  role: 'GATEWAY' | 'METER';
  recordStatus: 'DECLARED' | 'FIELD_VERIFIED';
  gatewayEquipmentId?: string;
  sourceIdentity?: string;
  network?: {
    ip: string;
    mask: string;
    gateway: string;
    services: { protocol: 'MQTT' | 'MODBUS_TCP'; port?: number }[];
  };
  macAddress?: string;
  loginUsername?: string;
  credentialState?: 'NOT_DECLARED' | 'PRESENT_IN_SOURCE' | 'SECRET_REFERENCED';
  credentialRef?: string;
  gatewayNumber?: string;
  downlinkMode?: string;
  declaredSlaveCount?: number;
  meterNumber?: string;
  channelCount?: number;
  channelDescription?: string;
  hallSensorDescription?: string;
  termination120Ohm?: boolean;
  documentedRs485Status?: string;
  rs485: {
    baudRate: number;
    dataBits: 7 | 8;
    parity: 'NONE' | 'EVEN' | 'ODD';
    stopBits: 1 | 2;
    slaveId?: number;
  };
  evidence: Evidence;
  revisionNumber: number;
  updatedBy: string;
  updatedAt: string;
}
interface CredentialMetadata {
  equipmentId: string;
  hasCredential: boolean;
  revisionNumber?: number;
  updatedAt?: string;
  updatedBy?: string;
  lastRevealedAt?: string;
  lastRevealedBy?: string;
  recentEvents?: {
    id: string;
    type: 'CREATED' | 'ROTATED' | 'REVEALED' | 'DELETED';
    actorId: string;
    occurredAt: string;
    credentialRevision?: number;
  }[];
}
interface CommissioningWarning {
  code: 'DUPLICATE_DECLARED_IP' | 'DUPLICATE_DECLARED_MAC' | 'DEFAULT_GATEWAY_OUTSIDE_SUBNET';
  severity: 'FIELD_CONFIRMATION_REQUIRED';
  field: 'network.ip' | 'macAddress' | 'network.gateway';
  equipmentIds: string[];
  value?: string;
}
interface CommissioningReadiness {
  equipmentId: string;
  role: 'GATEWAY' | 'METER';
  stage:
    | 'DOCUMENTED'
    | 'NETWORK_PENDING'
    | 'MQTT_IDENTITY_PENDING'
    | 'METER_PENDING'
    | 'METER_READY'
    | 'CHANNELS_PARTIAL'
    | 'CHANNELS_CONFIRMED'
    | 'FIELD_VERIFIED';
  networkDeclared: boolean;
  mqttIdentityConfirmed: boolean;
  meterReady: boolean;
  confirmedChannels: number;
  channelCount?: number;
  fieldVerified: boolean;
}
interface Mapping {
  breakerId: string;
  sourceIdentity: string;
  rawPointId: string;
  meterEquipmentId: string;
  gatewayEquipmentId: string;
  channel: number;
  metrics: string[];
  confirmedBy: string;
  confirmedAt: string;
  evidence: Evidence;
}
interface Overview {
  device: Bdfb;
  equipment: Equipment[];
  profiles: Profile[];
  warnings: CommissioningWarning[];
  readiness: CommissioningReadiness[];
  mappings: Mapping[];
  observability?: CommissioningObservabilityData;
}
type ProfileRole = 'GATEWAY' | 'METER';
const metrics = ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'] as const;

async function jsonRequest(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error ?? 'REQUEST_FAILED'));
  return body;
}

const fieldStyle = { display: 'grid', gap: 5, fontSize: 13 } as const;
const inputStyle = {
  padding: 9,
  border: '1px solid #a5acb6',
  borderRadius: 6,
  width: '100%',
  minWidth: 0,
} as const;
const gridStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
} as const;

const readinessLabel: Record<CommissioningReadiness['stage'], string> = {
  DOCUMENTED: 'Documented',
  NETWORK_PENDING: 'Network pending',
  MQTT_IDENTITY_PENDING: 'MQTT identity pending',
  METER_PENDING: 'Meter pending',
  METER_READY: 'Meter ready',
  CHANNELS_PARTIAL: 'Channels partial',
  CHANNELS_CONFIRMED: 'Channels confirmed',
  FIELD_VERIFIED: 'Field verified',
};

const warningLabel: Record<CommissioningWarning['code'], string> = {
  DUPLICATE_DECLARED_IP: 'Duplicate declared IP',
  DUPLICATE_DECLARED_MAC: 'Duplicate declared MAC',
  DEFAULT_GATEWAY_OUTSIDE_SUBNET: 'Default gateway outside declared subnet',
};

export function CommissioningConsole({
  canWrite,
  canReadCredentials,
  canWriteCredentials,
  initialDeviceId,
}: {
  canWrite: boolean;
  canReadCredentials: boolean;
  canWriteCredentials: boolean;
  initialDeviceId?: string;
}) {
  const t = useTranslations('industrialCommissioning');
  const [bdfbs, setBdfbs] = useState<Bdfb[]>([]);
  const [deviceId, setDeviceId] = useState(initialDeviceId ?? '');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialMetadata, setCredentialMetadata] = useState<CredentialMetadata | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [revealedPassword, setRevealedPassword] = useState('');

  const [role, setRole] = useState<ProfileRole>('GATEWAY');
  const [equipmentId, setEquipmentId] = useState('');
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [gatewayEquipmentId, setGatewayEquipmentId] = useState('');
  const [recordStatus, setRecordStatus] = useState<'DECLARED' | 'FIELD_VERIFIED'>('DECLARED');
  const [sourceIdentity, setSourceIdentity] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [credentialState, setCredentialState] = useState<
    'NOT_DECLARED' | 'PRESENT_IN_SOURCE' | 'SECRET_REFERENCED'
  >('NOT_DECLARED');
  const [credentialRef, setCredentialRef] = useState('');
  const [gatewayNumber, setGatewayNumber] = useState('');
  const [downlinkMode, setDownlinkMode] = useState('');
  const [declaredSlaveCount, setDeclaredSlaveCount] = useState('');
  const [meterNumber, setMeterNumber] = useState('');
  const [channelCount, setChannelCount] = useState('24');
  const [channelDescription, setChannelDescription] = useState('');
  const [hallSensorDescription, setHallSensorDescription] = useState('');
  const [termination120Ohm, setTermination120Ohm] = useState(false);
  const [documentedRs485Status, setDocumentedRs485Status] = useState('');
  const [ip, setIp] = useState('');
  const [mask, setMask] = useState('255.255.255.0');
  const [networkGateway, setNetworkGateway] = useState('');
  const [mqttEnabled, setMqttEnabled] = useState(true);
  const [mqttPort, setMqttPort] = useState('');
  const [modbusTcpEnabled, setModbusTcpEnabled] = useState(false);
  const [modbusTcpPort, setModbusTcpPort] = useState('502');
  const [baudRate, setBaudRate] = useState('9600');
  const [dataBits, setDataBits] = useState<'7' | '8'>('8');
  const [parity, setParity] = useState<'NONE' | 'EVEN' | 'ODD'>('NONE');
  const [stopBits, setStopBits] = useState<'1' | '2'>('1');
  const [slaveId, setSlaveId] = useState('');

  const [projectId, setProjectId] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [revision, setRevision] = useState('');
  const [reference, setReference] = useState('');
  const [projectName, setProjectName] = useState('');
  const [site, setSite] = useState('');
  const [client, setClient] = useState('');
  const [responsible, setResponsible] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [documentStatus, setDocumentStatus] = useState('');

  const [meterId, setMeterId] = useState('');
  const [breakerId, setBreakerId] = useState('');
  const [channel, setChannel] = useState('1');
  const [rawPointId, setRawPointId] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([...metrics]);
  const [physicallyVerified, setPhysicallyVerified] = useState(false);
  const [retireKey, setRetireKey] = useState<string | null>(null);

  const evidence = useMemo<Evidence>(
    () => ({
      projectId,
      documentName,
      revision,
      ...(reference ? { reference } : {}),
      ...(projectName ? { projectName } : {}),
      ...(site ? { site } : {}),
      ...(client ? { client } : {}),
      ...(responsible ? { responsible } : {}),
      ...(documentDate ? { documentDate } : {}),
      ...(documentStatus ? { documentStatus } : {}),
    }),
    [
      projectId,
      documentName,
      revision,
      reference,
      projectName,
      site,
      client,
      responsible,
      documentDate,
      documentStatus,
    ],
  );

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    const data = await jsonRequest(
      '/api/industrial/commissioning?' + new URLSearchParams({ deviceId: id }),
    );
    setOverview(data as unknown as Overview);
  }, []);

  useEffect(() => {
    let active = true;
    jsonRequest('/api/industrial/commissioning')
      .then((data) => {
        if (!active) return;
        const devices = data.bdfbs as Bdfb[];
        setBdfbs(devices);
        if (initialDeviceId && devices.some((item) => item.id === initialDeviceId)) {
          setDeviceId(initialDeviceId);
        } else if (devices[0]) {
          setDeviceId(devices[0].id);
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'LOAD_FAILED');
      });
    return () => {
      active = false;
    };
  }, [initialDeviceId]);

  useEffect(() => {
    if (!deviceId) return;
    let active = true;
    jsonRequest('/api/industrial/commissioning?' + new URLSearchParams({ deviceId }))
      .then((data) => {
        if (active) {
          setOverview(data as unknown as Overview);
          setError('');
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'LOAD_FAILED');
      });
    return () => {
      active = false;
    };
  }, [deviceId]);

  const allowedEquipment = useMemo(
    () =>
      (overview?.equipment ?? []).filter(
        (item) => item.equipmentType !== 'PANEL' && item.equipmentType !== 'CIRCUIT_BREAKER',
      ),
    [overview],
  );
  const profileByEquipmentId = useMemo(
    () => new Map((overview?.profiles ?? []).map((profile) => [profile.equipmentId, profile])),
    [overview],
  );
  const filteredEquipment = useMemo(() => {
    const query = equipmentSearch.trim().toLowerCase();
    if (!query) return allowedEquipment;
    return allowedEquipment.filter((item) => {
      const profile = profileByEquipmentId.get(item.id);
      return [
        item.name,
        item.model,
        item.serialNumber,
        ...(item.aliases ?? []),
        item.partNumber,
        profile?.macAddress,
        profile?.gatewayNumber,
        profile?.meterNumber,
        profile?.loginUsername,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [allowedEquipment, equipmentSearch, profileByEquipmentId]);
  const gateways = useMemo(
    () => overview?.profiles.filter((profile) => profile.role === 'GATEWAY') ?? [],
    [overview],
  );
  const meters = useMemo(
    () => overview?.profiles.filter((profile) => profile.role === 'METER') ?? [],
    [overview],
  );
  const mappableMeters = useMemo(
    () =>
      meters.filter((meter) =>
        gateways.some(
          (gateway) =>
            gateway.equipmentId === meter.gatewayEquipmentId && Boolean(gateway.sourceIdentity),
        ),
      ),
    [gateways, meters],
  );
  const breakers = useMemo(
    () => overview?.equipment.filter((item) => item.equipmentType === 'CIRCUIT_BREAKER') ?? [],
    [overview],
  );
  const existingProfile = overview?.profiles.find((profile) => profile.equipmentId === equipmentId);
  const readinessByEquipmentId = useMemo(
    () => new Map((overview?.readiness ?? []).map((item) => [item.equipmentId, item])),
    [overview],
  );
  const mappingsByMeter = useMemo(() => {
    const map = new Map<string, Map<number, Mapping>>();
    for (const mapping of overview?.mappings ?? []) {
      const channels = map.get(mapping.meterEquipmentId) ?? new Map<number, Mapping>();
      channels.set(mapping.channel, mapping);
      map.set(mapping.meterEquipmentId, channels);
    }
    return map;
  }, [overview]);
  const equipmentName = (id: string) =>
    overview?.equipment.find((item) => item.id === id)?.name ?? id;

  async function loadCredential(id: string) {
    setCredentialMetadata(null);
    setRevealedPassword('');
    if (!id || !canReadCredentials) return;
    try {
      const data = await jsonRequest(
        '/api/industrial/credentials?' + new URLSearchParams({ equipmentId: id }),
      );
      setCredentialMetadata(data as unknown as CredentialMetadata);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CREDENTIAL_LOAD_FAILED');
    }
  }

  async function credentialAction(action: 'set' | 'reveal' | 'remove') {
    if (!equipmentId || credentialBusy) return;
    setCredentialBusy(true);
    setError('');
    try {
      const data = await jsonRequest('/api/industrial/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          equipmentId,
          ...(action === 'set' ? { password: passwordInput } : {}),
        }),
      });
      if (action === 'reveal') {
        setRevealedPassword(String(data.password ?? ''));
        setCredentialMetadata(data.metadata as unknown as CredentialMetadata);
      } else {
        setCredentialMetadata(data as unknown as CredentialMetadata);
        setRevealedPassword('');
        setPasswordInput('');
      }
      setNotice(
        action === 'set'
          ? t('mk1_encrypted_password_saved_rotated')
          : action === 'remove'
            ? t('mk1_password_removed_from_encrypted_storage')
            : t('mk1_password_revealed_the_action_was_logged'),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CREDENTIAL_ACTION_FAILED');
    } finally {
      setCredentialBusy(false);
    }
  }

  function selectProfile(id: string) {
    setEquipmentId(id);
    setPasswordInput('');
    setRevealedPassword('');
    void loadCredential(id);
    const current = overview?.profiles.find((item) => item.equipmentId === id);
    if (!current) {
      setRole('GATEWAY');
      setGatewayEquipmentId('');
      setRecordStatus('DECLARED');
      setSourceIdentity('');
      setMacAddress('');
      setLoginUsername('');
      setCredentialState('NOT_DECLARED');
      setCredentialRef('');
      setGatewayNumber('');
      setDownlinkMode('');
      setDeclaredSlaveCount('');
      setMeterNumber('');
      setChannelCount('24');
      setChannelDescription('');
      setHallSensorDescription('');
      setTermination120Ohm(false);
      setDocumentedRs485Status('');
      setIp('');
      setNetworkGateway('');
      setSlaveId('');
      setMqttEnabled(true);
      setMqttPort('');
      setModbusTcpEnabled(false);
      setModbusTcpPort('502');
      return;
    }
    setRole(current.role);
    setGatewayEquipmentId(current.gatewayEquipmentId ?? '');
    setRecordStatus(current.recordStatus);
    setSourceIdentity(current.sourceIdentity ?? '');
    setMacAddress(current.macAddress ?? '');
    setLoginUsername(current.loginUsername ?? '');
    setCredentialState(current.credentialState ?? 'NOT_DECLARED');
    setCredentialRef(current.credentialRef ?? '');
    setGatewayNumber(current.gatewayNumber ?? '');
    setDownlinkMode(current.downlinkMode ?? '');
    setDeclaredSlaveCount(
      current.declaredSlaveCount === undefined ? '' : String(current.declaredSlaveCount),
    );
    setMeterNumber(current.meterNumber ?? '');
    setChannelCount(String(current.channelCount ?? 24));
    setChannelDescription(current.channelDescription ?? '');
    setHallSensorDescription(current.hallSensorDescription ?? '');
    setTermination120Ohm(current.termination120Ohm ?? false);
    setDocumentedRs485Status(current.documentedRs485Status ?? '');
    setIp(current.network?.ip ?? '');
    setMask(current.network?.mask ?? '255.255.255.0');
    setNetworkGateway(current.network?.gateway ?? '');
    const mqtt = current.network?.services.find((service) => service.protocol === 'MQTT');
    const modbus = current.network?.services.find((service) => service.protocol === 'MODBUS_TCP');
    setMqttEnabled(Boolean(mqtt));
    setMqttPort(mqtt?.port ? String(mqtt.port) : '');
    setModbusTcpEnabled(Boolean(modbus));
    setModbusTcpPort(modbus?.port ? String(modbus.port) : '502');
    setBaudRate(String(current.rs485.baudRate));
    setDataBits(String(current.rs485.dataBits) as '7' | '8');
    setParity(current.rs485.parity);
    setStopBits(String(current.rs485.stopBits) as '1' | '2');
    setSlaveId(String(current.rs485.slaveId ?? ''));
    setProjectId(current.evidence.projectId);
    setDocumentName(current.evidence.documentName);
    setRevision(current.evidence.revision);
    setReference(current.evidence.reference ?? '');
    setProjectName(current.evidence.projectName ?? '');
    setSite(current.evidence.site ?? '');
    setClient(current.evidence.client ?? '');
    setResponsible(current.evidence.responsible ?? '');
    setDocumentDate(current.evidence.documentDate ?? '');
    setDocumentStatus(current.evidence.documentStatus ?? '');
  }

  async function mutate(
    action: string,
    input: Record<string, unknown>,
    expectedRevision?: number | null,
  ) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await jsonRequest('/api/industrial/commissioning', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          input,
          ...(expectedRevision !== undefined ? { expectedRevision } : {}),
        }),
      });
      await refresh(deviceId);
      setPhysicallyVerified(false);
      setRetireKey(null);
      setNotice(t('mk1_change_recorded_this_does_not_imply_field_connectivity_verification'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SAVE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !equipmentId) return;
    const rs485 = {
      baudRate: Number(baudRate),
      dataBits: Number(dataBits),
      parity,
      stopBits: Number(stopBits),
      ...(role === 'METER' ? { slaveId: Number(slaveId) } : {}),
    };
    const services = [
      ...(mqttEnabled
        ? [{ protocol: 'MQTT' as const, ...(mqttPort.trim() ? { port: Number(mqttPort) } : {}) }]
        : []),
      ...(modbusTcpEnabled
        ? [
            {
              protocol: 'MODBUS_TCP' as const,
              ...(modbusTcpPort.trim() ? { port: Number(modbusTcpPort) } : {}),
            },
          ]
        : []),
    ];
    const input = {
      equipmentId,
      role,
      recordStatus,
      rs485,
      evidence,
      ...(role === 'GATEWAY'
        ? {
            ...(sourceIdentity.trim() ? { sourceIdentity: sourceIdentity.trim() } : {}),
            ...(macAddress.trim() ? { macAddress: macAddress.trim() } : {}),
            ...(loginUsername.trim() ? { loginUsername: loginUsername.trim() } : {}),
            credentialState,
            ...(credentialRef.trim() ? { credentialRef: credentialRef.trim() } : {}),
            ...(gatewayNumber.trim() ? { gatewayNumber: gatewayNumber.trim() } : {}),
            ...(downlinkMode.trim() ? { downlinkMode: downlinkMode.trim() } : {}),
            ...(declaredSlaveCount.trim()
              ? { declaredSlaveCount: Number(declaredSlaveCount) }
              : {}),
            network: { ip, mask, gateway: networkGateway, services },
          }
        : {
            gatewayEquipmentId,
            ...(meterNumber.trim() ? { meterNumber: meterNumber.trim() } : {}),
            ...(channelCount.trim() ? { channelCount: Number(channelCount) } : {}),
            ...(channelDescription.trim() ? { channelDescription: channelDescription.trim() } : {}),
            ...(hallSensorDescription.trim()
              ? { hallSensorDescription: hallSensorDescription.trim() }
              : {}),
            termination120Ohm,
            ...(documentedRs485Status.trim()
              ? { documentedRs485Status: documentedRs485Status.trim() }
              : {}),
          }),
    };
    void mutate('save-profile', input, existingProfile?.revisionNumber ?? null);
  }

  function submitMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !physicallyVerified) return;
    void mutate('confirm-channel', {
      meterEquipmentId: meterId,
      breakerId,
      channel: Number(channel),
      rawPointId,
      metrics: selectedMetrics,
      physicallyVerified: true,
      evidence,
    });
  }

  return (
    <main style={{ padding: '24px', maxWidth: 1160, margin: '0 auto', display: 'grid', gap: 24 }}>
      <header>
        <a href="/telemetry">{t('mk1_telemetry')}</a>
        <h1 style={{ marginTop: 12 }}>{t('mk1_industrial_commissioning_acrel')}</h1>
        <p>{t('mk1_configure_communications_and_associate_channels_with_existing_breakers_t')} </p>
      </header>

      <section style={{ display: 'grid', gap: 8 }}>
        <label style={fieldStyle}>
          {t('mk1_existing_bdfb')}{' '}
          <select
            style={inputStyle}
            value={deviceId}
            onChange={(event) => {
              setDeviceId(event.target.value);
              setOverview(null);
              setEquipmentId('');
              setNotice('');
            }}
          >
            <option value="">{t('mk1_select_bdfb')}</option>
            {bdfbs.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {!bdfbs.length && (
          <p>{t('mk1_no_active_bdfbs_are_registered_create_them_in_the_existing_topology_firs')}</p>
        )}
      </section>

      {error && (
        <p role="alert" style={{ color: '#aa2530' }}>
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}

      {overview && (
        <>
          {overview.observability ? (
            <CommissioningObservabilityPanel data={overview.observability} />
          ) : null}

          <section
            style={{
              border: '1px solid #c8ced6',
              borderRadius: 12,
              padding: 18,
              display: 'grid',
              gap: 16,
            }}
          >
            <h2>{t('mk1_1_communications_configuration')}</h2>
            <p>
              {t(
                'mk1_select_existing_equipment_a_gateway_keeps_the_ip_and_publisher_identity_',
              )}{' '}
            </p>
            {overview.warnings.length > 0 ? (
              <aside style={{ border: '1px solid #c8ced6', borderRadius: 8, padding: 12 }}>
                <strong>{t('mk1_documentary_preflight_field_confirmation_required')}</strong>
                <p style={{ margin: '6px 0', fontSize: 12 }}>
                  {t(
                    'mk1_these_warnings_do_not_block_saving_the_c_p_and_do_not_claim_the_document',
                  )}{' '}
                </p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {overview.warnings.map((warning, index) => (
                    <li key={warning.code + '|' + warning.equipmentIds.join('|') + '|' + index}>
                      {warningLabel[warning.code]}
                      {warning.value ? ' · ' + warning.value : ''} ·{' '}
                      {warning.equipmentIds.map((id) => equipmentName(id)).join(', ')}
                    </li>
                  ))}
                </ul>
              </aside>
            ) : null}
            <form onSubmit={submitProfile} style={{ display: 'grid', gap: 14 }}>
              <div style={gridStyle}>
                <label style={fieldStyle}>
                  {t('mk1_search_equipment_alias_serial_mac_login')}{' '}
                  <input
                    style={inputStyle}
                    value={equipmentSearch}
                    onChange={(event) => setEquipmentSearch(event.target.value)}
                    placeholder={t('mk1_search')}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_equipment')}{' '}
                  <select
                    required
                    style={inputStyle}
                    value={equipmentId}
                    onChange={(event) => selectProfile(event.target.value)}
                  >
                    <option value="">{t('mk1_select_equipment')}</option>
                    {filteredEquipment.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.aliases?.[0] ? item.aliases[0] + ' · ' : ''}
                        {item.name} · {item.equipmentType}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={fieldStyle}>
                  {t('mk1_role')}{' '}
                  <select
                    style={inputStyle}
                    value={role}
                    disabled={!!existingProfile}
                    onChange={(event) => setRole(event.target.value as ProfileRole)}
                  >
                    <option value="GATEWAY">{t('mk1_gateway_acrel')}</option>
                    <option value="METER">{t('mk1_amc16z_meter')}</option>
                  </select>
                </label>
              </div>
              <div style={gridStyle}>
                <label style={fieldStyle}>
                  {t('mk1_aliases_ne_name_tid_equipment')}{' '}
                  <input
                    style={inputStyle}
                    readOnly
                    value={
                      allowedEquipment
                        .find((item) => item.id === equipmentId)
                        ?.aliases?.join(', ') ?? ''
                    }
                    placeholder={t('mk1_managed_in_equipment')}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_part_number_p_n_equipment')}{' '}
                  <input
                    style={inputStyle}
                    readOnly
                    value={
                      allowedEquipment.find((item) => item.id === equipmentId)?.partNumber ?? ''
                    }
                    placeholder={t('mk1_managed_in_equipment')}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_record_status')}{' '}
                  <select
                    style={inputStyle}
                    value={recordStatus}
                    onChange={(event) =>
                      setRecordStatus(event.target.value as 'DECLARED' | 'FIELD_VERIFIED')
                    }
                  >
                    <option value="DECLARED">{t('mk1_declared_documentary')}</option>
                    <option value="FIELD_VERIFIED">{t('mk1_field_verified')}</option>
                  </select>
                </label>
                <label style={fieldStyle}>
                  {t('mk1_canonical_serial')}{' '}
                  <input
                    style={inputStyle}
                    readOnly
                    value={
                      allowedEquipment.find((item) => item.id === equipmentId)?.serialNumber ?? ''
                    }
                    placeholder={t('mk1_managed_in_equipment')}
                  />
                </label>
              </div>
              {role === 'GATEWAY' ? (
                <div style={gridStyle}>
                  <label style={fieldStyle}>
                    {t('mk1_gateway_number')}{' '}
                    <input
                      style={inputStyle}
                      value={gatewayNumber}
                      onChange={(event) => setGatewayNumber(event.target.value)}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_mac_ethernet')}{' '}
                    <input
                      style={inputStyle}
                      value={macAddress}
                      onChange={(event) => setMacAddress(event.target.value)}
                      placeholder="00:00:00:00:00:00"
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_login_username')}{' '}
                    <input
                      style={inputStyle}
                      value={loginUsername}
                      onChange={(event) => setLoginUsername(event.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  <fieldset style={{ border: '1px solid #c8ced6', borderRadius: 8, padding: 10 }}>
                    <legend>{t('mk1_equipment_password')}</legend>
                    <small>
                      {credentialMetadata?.hasCredential
                        ? `Guardada cifrada · rev. ${credentialMetadata.revisionNumber ?? '—'}`
                        : t('mk1_no_encrypted_password_stored')}
                    </small>
                    {canWriteCredentials ? (
                      <>
                        <input
                          type="password"
                          maxLength={512}
                          style={inputStyle}
                          value={passwordInput}
                          autoComplete="new-password"
                          onChange={(event) => setPasswordInput(event.target.value)}
                          placeholder={t('mk1_new_password_rotation')}
                        />
                        <button
                          type="button"
                          disabled={credentialBusy || !passwordInput}
                          onClick={() => void credentialAction('set')}
                        >
                          {credentialMetadata?.hasCredential
                            ? t('mk1_rotate_password')
                            : t('mk1_save_password')}
                        </button>
                      </>
                    ) : null}
                    {canReadCredentials && credentialMetadata?.hasCredential ? (
                      <button
                        type="button"
                        disabled={credentialBusy}
                        onClick={() =>
                          revealedPassword
                            ? setRevealedPassword('')
                            : void credentialAction('reveal')
                        }
                      >
                        {revealedPassword ? t('mk1_hide_password') : t('mk1_show_password')}
                      </button>
                    ) : null}
                    {revealedPassword ? (
                      <input
                        style={inputStyle}
                        readOnly
                        value={revealedPassword}
                        aria-label={t('mk1_revealed_password')}
                      />
                    ) : null}
                    {canWriteCredentials && credentialMetadata?.hasCredential ? (
                      <button
                        type="button"
                        disabled={credentialBusy}
                        onClick={() => void credentialAction('remove')}
                      >
                        {t('mk1_delete_stored_password')}{' '}
                      </button>
                    ) : null}
                    {credentialMetadata?.lastRevealedAt ? (
                      <small>
                        {t('mk1_last_reveal')} {credentialMetadata.lastRevealedAt} {t('mk1_user')}{' '}
                        {credentialMetadata.lastRevealedBy ?? '—'}
                      </small>
                    ) : null}
                    {credentialMetadata?.recentEvents?.length ? (
                      <details>
                        <summary>
                          {t('mk1_credential_audit')}
                          {credentialMetadata.recentEvents.length})
                        </summary>
                        <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12 }}>
                          {credentialMetadata.recentEvents.map((event) => (
                            <li key={event.id}>
                              {event.type} · {event.occurredAt} {t('mk1_user')} {event.actorId}
                              {event.credentialRevision !== undefined
                                ? ' · rev. ' + event.credentialRevision
                                : ''}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </fieldset>
                  <label style={fieldStyle}>
                    {t('mk1_documentary_external_credential_status')}{' '}
                    <select
                      style={inputStyle}
                      value={credentialState}
                      onChange={(event) => {
                        const value = event.target.value as
                          'NOT_DECLARED' | 'PRESENT_IN_SOURCE' | 'SECRET_REFERENCED';
                        setCredentialState(value);
                        if (value !== 'SECRET_REFERENCED') setCredentialRef('');
                      }}
                    >
                      <option value="NOT_DECLARED">{t('mk1_not_declared')}</option>
                      <option value="PRESENT_IN_SOURCE">
                        {t('mk1_present_in_source_document')}
                      </option>
                      <option value="SECRET_REFERENCED">
                        {t('mk1_external_reference_vault_secret_manager')}{' '}
                      </option>
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_external_credential_reference')}{' '}
                    <input
                      style={inputStyle}
                      value={credentialRef}
                      disabled={credentialState !== 'SECRET_REFERENCED'}
                      onChange={(event) => setCredentialRef(event.target.value)}
                      placeholder={t('mk1_vault_secret_env')}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_downlink_mode')}{' '}
                    <input
                      style={inputStyle}
                      value={downlinkMode}
                      onChange={(event) => setDownlinkMode(event.target.value)}
                      placeholder={t('mk1_e_g_modbus_rtu_master')}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_declared_slaves')}{' '}
                    <input
                      type="number"
                      min="0"
                      max="247"
                      style={inputStyle}
                      value={declaredSlaveCount}
                      onChange={(event) => setDeclaredSlaveCount(event.target.value)}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_mqtt_publisher_identity_when_confirmed')}{' '}
                    <input
                      style={inputStyle}
                      value={sourceIdentity}
                      onChange={(event) => setSourceIdentity(event.target.value)}
                      placeholder={t('mk1_do_not_invent_leave_blank_until_confirmed')}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_ipv4')}{' '}
                    <input
                      required
                      style={inputStyle}
                      value={ip}
                      onChange={(event) => setIp(event.target.value)}
                      placeholder={t('mk1_192_168_x_x')}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_mask')}{' '}
                    <input
                      required
                      style={inputStyle}
                      value={mask}
                      onChange={(event) => setMask(event.target.value)}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_default_gateway')}{' '}
                    <input
                      required
                      style={inputStyle}
                      value={networkGateway}
                      onChange={(event) => setNetworkGateway(event.target.value)}
                    />
                  </label>
                  <fieldset style={{ border: '1px solid #c8ced6', borderRadius: 8, padding: 10 }}>
                    <legend>{t('mk1_uplink_services')}</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={mqttEnabled}
                        onChange={(event) => setMqttEnabled(event.target.checked)}
                      />{' '}
                      {t('mk1_mqtt')}{' '}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      style={inputStyle}
                      value={mqttPort}
                      disabled={!mqttEnabled}
                      onChange={(event) => setMqttPort(event.target.value)}
                      placeholder={t('mk1_undocumented_port_leave_blank')}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={modbusTcpEnabled}
                        onChange={(event) => setModbusTcpEnabled(event.target.checked)}
                      />{' '}
                      {t('mk1_modbus_tcp')}{' '}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      style={inputStyle}
                      value={modbusTcpPort}
                      disabled={!modbusTcpEnabled}
                      onChange={(event) => setModbusTcpPort(event.target.value)}
                      placeholder={t('mk1_e_g_502')}
                    />
                    {!mqttEnabled && !modbusTcpEnabled ? (
                      <small role="alert">{t('mk1_select_at_least_one_uplink_service')}</small>
                    ) : null}
                  </fieldset>
                </div>
              ) : (
                <div style={gridStyle}>
                  <label style={fieldStyle}>
                    {t('mk1_meter_number')}{' '}
                    <input
                      style={inputStyle}
                      value={meterNumber}
                      onChange={(event) => setMeterNumber(event.target.value)}
                      placeholder={t('mk1_e_g_a1')}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_active_channels')}{' '}
                    <input
                      type="number"
                      min="1"
                      max="256"
                      style={inputStyle}
                      value={channelCount}
                      onChange={(event) => setChannelCount(event.target.value)}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_channel_description')}{' '}
                    <input
                      style={inputStyle}
                      value={channelDescription}
                      onChange={(event) => setChannelDescription(event.target.value)}
                      placeholder={t('mk1_e_g_24_dc_circuits_12_bus_a_12_bus_b')}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_sensor_hall')}{' '}
                    <input
                      style={inputStyle}
                      value={hallSensorDescription}
                      onChange={(event) => setHallSensorDescription(event.target.value)}
                      placeholder={t('mk1_model_range_output')}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_120_termination')}{' '}
                    <select
                      style={inputStyle}
                      value={termination120Ohm ? 'YES' : 'NO'}
                      onChange={(event) => setTermination120Ohm(event.target.value === 'YES')}
                    >
                      <option value="NO">{t('mk1_no')}</option>
                      <option value="YES">{t('mk1_yes')}</option>
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_documented_rs485_status')}{' '}
                    <input
                      style={inputStyle}
                      value={documentedRs485Status}
                      onChange={(event) => setDocumentedRs485Status(event.target.value)}
                      placeholder={t('mk1_e_g_online_ok_documentary')}
                    />
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_gateway_in_this_bdfb')}{' '}
                    <select
                      required
                      style={inputStyle}
                      value={gatewayEquipmentId}
                      onChange={(event) => {
                        const id = event.target.value;
                        setGatewayEquipmentId(id);
                        const gateway = gateways.find((item) => item.equipmentId === id);
                        if (gateway) {
                          setBaudRate(String(gateway.rs485.baudRate));
                          setDataBits(String(gateway.rs485.dataBits) as '7' | '8');
                          setParity(gateway.rs485.parity);
                          setStopBits(String(gateway.rs485.stopBits) as '1' | '2');
                        }
                      }}
                    >
                      <option value="">{t('mk1_select')}</option>
                      {gateways.map((item) => (
                        <option value={item.equipmentId} key={item.equipmentId}>
                          {equipmentName(item.equipmentId)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    {t('mk1_slave_id_1_247')}{' '}
                    <input
                      required
                      type="number"
                      min="1"
                      max="247"
                      style={inputStyle}
                      value={slaveId}
                      onChange={(event) => setSlaveId(event.target.value)}
                    />
                  </label>
                </div>
              )}
              <div style={gridStyle}>
                <label style={fieldStyle}>
                  {t('mk1_baud_rate')}{' '}
                  <input
                    required
                    type="number"
                    min="300"
                    max="115200"
                    style={inputStyle}
                    value={baudRate}
                    readOnly={role === 'METER'}
                    onChange={(event) => setBaudRate(event.target.value)}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_data_bits')}{' '}
                  <select
                    style={inputStyle}
                    value={dataBits}
                    disabled={role === 'METER'}
                    onChange={(event) => setDataBits(event.target.value as '7' | '8')}
                  >
                    <option value="8">8</option>
                    <option value="7">7</option>
                  </select>
                </label>
                <label style={fieldStyle}>
                  {t('mk1_parity')}{' '}
                  <select
                    style={inputStyle}
                    value={parity}
                    disabled={role === 'METER'}
                    onChange={(event) => setParity(event.target.value as 'NONE' | 'EVEN' | 'ODD')}
                  >
                    <option value="NONE">{t('mk1_none')}</option>
                    <option value="EVEN">{t('mk1_even')}</option>
                    <option value="ODD">{t('mk1_odd')}</option>
                  </select>
                </label>
                <label style={fieldStyle}>
                  {t('mk1_stop_bits')}{' '}
                  <select
                    style={inputStyle}
                    value={stopBits}
                    disabled={role === 'METER'}
                    onChange={(event) => setStopBits(event.target.value as '1' | '2')}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                  </select>
                </label>
              </div>

              <h3>{t('mk1_3_data_provenance')}</h3>
              <div style={gridStyle}>
                <label style={fieldStyle}>
                  {t('mk1_project_id')}{' '}
                  <input
                    required
                    style={inputStyle}
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_project_name')}{' '}
                  <input
                    style={inputStyle}
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_site_location')}{' '}
                  <input
                    style={inputStyle}
                    value={site}
                    onChange={(event) => setSite(event.target.value)}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_client_operator')}{' '}
                  <input
                    style={inputStyle}
                    value={client}
                    onChange={(event) => setClient(event.target.value)}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_responsible_person')}{' '}
                  <input
                    style={inputStyle}
                    value={responsible}
                    onChange={(event) => setResponsible(event.target.value)}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_document_date')}{' '}
                  <input
                    style={inputStyle}
                    value={documentDate}
                    onChange={(event) => setDocumentDate(event.target.value)}
                    placeholder={t('mk1_yyyy_mm_dd')}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_document_status')}{' '}
                  <input
                    style={inputStyle}
                    value={documentStatus}
                    onChange={(event) => setDocumentStatus(event.target.value)}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_source_document')}{' '}
                  <input
                    required
                    style={inputStyle}
                    value={documentName}
                    onChange={(event) => setDocumentName(event.target.value)}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_revision')}{' '}
                  <input
                    required
                    style={inputStyle}
                    value={revision}
                    onChange={(event) => setRevision(event.target.value)}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_reference_evidence_no_credentials')}{' '}
                  <input
                    style={inputStyle}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </label>
              </div>
              <p style={{ fontSize: 12 }}>
                {t(
                  'mk1_the_user_and_edit_date_come_from_the_server_session_the_equipment_login_',
                )}{' '}
              </p>
              <div>
                <button
                  type="submit"
                  disabled={
                    !canWrite ||
                    busy ||
                    !equipmentId ||
                    (role === 'GATEWAY' && !mqttEnabled && !modbusTcpEnabled)
                  }
                  style={{ padding: '10px 18px' }}
                >
                  {existingProfile ? t('mk1_save_new_revision') : t('mk1_register_configuration')}
                </button>
                {existingProfile && (
                  <span style={{ marginLeft: 12 }}>
                    {t('mk1_revision')} {existingProfile.revisionNumber} ·{' '}
                    {existingProfile.updatedAt}
                  </span>
                )}
              </div>
            </form>
            {overview.profiles.length > 0 && (
              <div style={gridStyle}>
                {overview.profiles.map((item) => (
                  <article
                    key={item.equipmentId}
                    style={{ border: '1px solid #c8ced6', borderRadius: 8, padding: 12 }}
                  >
                    <strong>
                      {overview.equipment.find((equipment) => equipment.id === item.equipmentId)
                        ?.aliases?.[0]
                        ? overview.equipment.find((equipment) => equipment.id === item.equipmentId)!
                            .aliases![0] + ' · '
                        : ''}
                      {equipmentName(item.equipmentId)}
                    </strong>
                    <div>
                      {item.role} ·{' '}
                      {item.role === 'GATEWAY'
                        ? item.network?.services
                            .map(
                              (service) =>
                                service.protocol + (service.port ? ':' + service.port : ''),
                            )
                            .join(' + ') || 'Sin uplink'
                        : 'Slave ' + item.rs485.slaveId}
                      {item.role === 'GATEWAY'
                        ? ' · ' + (item.sourceIdentity ?? 'MQTT identity pendiente')
                        : ''}
                    </div>
                    {(() => {
                      const readiness = readinessByEquipmentId.get(item.equipmentId);
                      return readiness ? (
                        <div style={{ margin: '6px 0', fontSize: 12 }}>
                          <strong>{readinessLabel[readiness.stage]}</strong>
                          {' · red '}
                          {readiness.networkDeclared ? '✓' : '—'}
                          {' · MQTT '}
                          {readiness.mqttIdentityConfirmed ? '✓' : '—'}
                          {' · meter '}
                          {readiness.meterReady ? '✓' : '—'}
                          {readiness.channelCount !== undefined
                            ? ` · canales ${readiness.confirmedChannels}/${readiness.channelCount}`
                            : ''}
                        </div>
                      ) : null;
                    })()}
                    <small>
                      {item.recordStatus} ·{' '}
                      {overview.equipment.find((equipment) => equipment.id === item.equipmentId)
                        ?.partNumber ?? 'P/N —'}
                      {item.role === 'GATEWAY' && item.macAddress ? ' · ' + item.macAddress : ''}
                      {item.role === 'GATEWAY' && item.loginUsername
                        ? ' · login ' + item.loginUsername
                        : ''}
                      {item.role === 'METER' && item.hallSensorDescription
                        ? ' · ' + item.hallSensorDescription
                        : ''}
                    </small>
                    <br />
                    <small>
                      {t('mk1_revision')} {item.revisionNumber} · {item.evidence.documentName} /{' '}
                      {item.evidence.revision}
                    </small>
                    <div>
                      <button type="button" onClick={() => selectProfile(item.equipmentId)}>
                        {t('mk1_edit_configuration')}{' '}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            style={{
              border: '1px solid #c8ced6',
              borderRadius: 12,
              padding: 18,
              display: 'grid',
              gap: 14,
            }}
          >
            <h2>{t('mk1_2_physical_channel_mapping')}</h2>
            <p>
              {t(
                'mk1_the_channel_and_mqtt_point_are_not_calculated_from_the_breaker_position_',
              )}{' '}
            </p>
            {meters.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {meters.map((meter) => {
                  const gateway = gateways.find(
                    (item) => item.equipmentId === meter.gatewayEquipmentId,
                  );
                  const channelMap =
                    mappingsByMeter.get(meter.equipmentId) ?? new Map<number, Mapping>();
                  return (
                    <details key={meter.equipmentId}>
                      <summary>
                        {equipmentName(meter.equipmentId)} {t('mk1_slave')} {meter.rs485.slaveId} ·{' '}
                        {channelMap.size}/{meter.channelCount ?? 24} {t('mk1_confirmed_channels')}{' '}
                        {!gateway?.sourceIdentity ? ' · MQTT identity pendiente' : ''}
                      </summary>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                          gap: 6,
                          paddingTop: 8,
                        }}
                      >
                        {Array.from(
                          { length: meter.channelCount ?? 24 },
                          (_, index) => index + 1,
                        ).map((number) => {
                          const mapping = channelMap.get(number);
                          return (
                            <button
                              type="button"
                              key={number}
                              disabled={!gateway?.sourceIdentity}
                              onClick={() => {
                                setMeterId(meter.equipmentId);
                                setChannel(String(number));
                                if (mapping) {
                                  setBreakerId(mapping.breakerId);
                                  setRawPointId(mapping.rawPointId);
                                  setSelectedMetrics([...mapping.metrics]);
                                } else {
                                  setBreakerId('');
                                  setRawPointId('');
                                  setSelectedMetrics([...metrics]);
                                }
                                setPhysicallyVerified(false);
                              }}
                              style={{
                                textAlign: 'left',
                                padding: 8,
                                border: '1px solid #c8ced6',
                                borderRadius: 6,
                              }}
                            >
                              <strong>
                                {t('mk1_ch')} {String(number).padStart(2, '0')}
                              </strong>
                              <br />
                              <small>
                                {mapping
                                  ? equipmentName(mapping.breakerId) + ' · ' + mapping.rawPointId
                                  : t('mk1_pending_verification')}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : null}
            <form onSubmit={submitMapping} style={{ display: 'grid', gap: 12 }}>
              <div style={gridStyle}>
                <label style={fieldStyle}>
                  {t('mk1_commissioned_meter')}{' '}
                  <select
                    required
                    style={inputStyle}
                    value={meterId}
                    onChange={(event) => setMeterId(event.target.value)}
                  >
                    <option value="">{t('mk1_select')}</option>
                    {mappableMeters.map((item) => (
                      <option key={item.equipmentId} value={item.equipmentId}>
                        {equipmentName(item.equipmentId)} {t('mk1_slave')} {item.rs485.slaveId}
                      </option>
                    ))}
                  </select>
                </label>
                {meters.length > mappableMeters.length ? (
                  <small>
                    {t(
                      'mk1_meters_whose_gateway_does_not_yet_have_a_confirmed_mqtt_identity_cannot_',
                    )}{' '}
                  </small>
                ) : null}
                <label style={fieldStyle}>
                  {t('mk1_channel')}{' '}
                  <input
                    required
                    type="number"
                    min="1"
                    max={meters.find((item) => item.equipmentId === meterId)?.channelCount ?? 24}
                    style={inputStyle}
                    value={channel}
                    onChange={(event) => setChannel(event.target.value)}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_exact_mqtt_point')}{' '}
                  <input
                    required
                    style={inputStyle}
                    value={rawPointId}
                    onChange={(event) => setRawPointId(event.target.value)}
                    placeholder={t('mk1_e_g_0_1_1')}
                  />
                </label>
                <label style={fieldStyle}>
                  {t('mk1_existing_breaker')}{' '}
                  <select
                    required
                    style={inputStyle}
                    value={breakerId}
                    onChange={(event) => setBreakerId(event.target.value)}
                  >
                    <option value="">{t('mk1_select')}</option>
                    {breakers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset>
                <legend>{t('mk1_enabled_metrics')}</legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                  {metrics.map((metric) => (
                    <label key={metric}>
                      <input
                        type="checkbox"
                        checked={selectedMetrics.includes(metric)}
                        onChange={(event) =>
                          setSelectedMetrics((current) =>
                            event.target.checked
                              ? [...current, metric]
                              : current.filter((item) => item !== metric),
                          )
                        }
                      />{' '}
                      {metric}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                <input
                  type="checkbox"
                  checked={physicallyVerified}
                  onChange={(event) => setPhysicallyVerified(event.target.checked)}
                />{' '}
                {t(
                  'mk1_i_confirm_that_i_physically_verified_the_meter_channel_published_point_a',
                )}{' '}
              </label>
              <p style={{ fontSize: 12 }}>
                {t(
                  'mk1_this_will_use_the_project_document_and_revision_from_the_form_above_the_',
                )}{' '}
              </p>
              <div>
                <button
                  type="submit"
                  disabled={
                    !canWrite ||
                    busy ||
                    !physicallyVerified ||
                    !selectedMetrics.length ||
                    !meterId ||
                    !breakerId
                  }
                >
                  {t('mk1_confirm_and_link_telemetry')}{' '}
                </button>
              </div>
            </form>
          </section>

          <section
            style={{
              border: '1px solid #c8ced6',
              borderRadius: 12,
              padding: 18,
              display: 'grid',
              gap: 12,
            }}
          >
            <h2>{t('mk1_confirmed_associations')}</h2>
            {!overview.mappings.length && (
              <p>{t('mk1_no_acrel_channels_are_confirmed_for_this_bdfb')}</p>
            )}
            {overview.mappings.map((item) => {
              const key = item.breakerId + '|' + item.sourceIdentity + '|' + item.rawPointId;
              return (
                <article key={key} style={{ borderTop: '1px solid #d4d8de', paddingTop: 12 }}>
                  <strong>{equipmentName(item.breakerId)}</strong>
                  <p style={{ margin: '5px 0' }}>
                    {equipmentName(item.gatewayEquipmentId)} →{' '}
                    {equipmentName(item.meterEquipmentId)} {t('mk1_channel_2')} {item.channel} →{' '}
                    {item.rawPointId}
                  </p>
                  <small>
                    {item.metrics.join(', ')} · {item.evidence?.documentName} /{' '}
                    {item.evidence?.revision} · {item.confirmedAt} {t('mk1_user')}{' '}
                    {item.confirmedBy}
                  </small>
                  {canWrite && (
                    <div style={{ marginTop: 10 }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={retireKey === key}
                          onChange={(event) => setRetireKey(event.target.checked ? key : null)}
                        />{' '}
                        {t(
                          'mk1_i_confirm_removing_this_association_without_deleting_its_history',
                        )}{' '}
                      </label>
                      <button
                        type="button"
                        disabled={busy || retireKey !== key}
                        style={{ marginLeft: 12 }}
                        onClick={() =>
                          void mutate('retire-channel', {
                            breakerId: item.breakerId,
                            sourceIdentity: item.sourceIdentity,
                            rawPointId: item.rawPointId,
                            evidence,
                            confirmRetirement: true,
                          })
                        }
                      >
                        {t('mk1_remove_mapping')}{' '}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
