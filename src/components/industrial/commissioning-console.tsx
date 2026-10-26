'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

interface Bdfb { id: string; name: string }
interface Equipment {
  id: string;
  name: string;
  equipmentType: string;
  model?: string;
  serialNumber?: string;
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
  alias?: string;
  partNumber?: string;
  recordStatus: 'DECLARED' | 'FIELD_VERIFIED';
  gatewayEquipmentId?: string;
  sourceIdentity?: string;
  network?: { ip: string; mask: string; gateway: string; services: { protocol: 'MQTT' | 'MODBUS_TCP'; port?: number }[] };
  macAddress?: string;
  loginUsername?: string;
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
  rs485: { baudRate: number; dataBits: 7 | 8; parity: 'NONE' | 'EVEN' | 'ODD'; stopBits: 1 | 2; slaveId?: number };
  evidence: Evidence;
  revisionNumber: number;
  updatedBy: string;
  updatedAt: string;
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
  mappings: Mapping[];
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
const inputStyle = { padding: 9, border: '1px solid #a5acb6', borderRadius: 6, width: '100%', minWidth: 0 } as const;
const gridStyle = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' } as const;

export function CommissioningConsole({
  canWrite,
  initialDeviceId,
}: {
  canWrite: boolean;
  initialDeviceId?: string;
}) {
  const [bdfbs, setBdfbs] = useState<Bdfb[]>([]);
  const [deviceId, setDeviceId] = useState(initialDeviceId ?? '');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [role, setRole] = useState<ProfileRole>('GATEWAY');
  const [equipmentId, setEquipmentId] = useState('');
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [gatewayEquipmentId, setGatewayEquipmentId] = useState('');
  const [alias, setAlias] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [recordStatus, setRecordStatus] = useState<'DECLARED' | 'FIELD_VERIFIED'>('DECLARED');
  const [sourceIdentity, setSourceIdentity] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
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

  const evidence = useMemo<Evidence>(() => ({
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
  }), [
    projectId, documentName, revision, reference, projectName, site, client,
    responsible, documentDate, documentStatus,
  ]);

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    const data = await jsonRequest('/api/industrial/commissioning?' + new URLSearchParams({ deviceId: id }));
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
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'LOAD_FAILED'); });
    return () => { active = false; };
  }, [initialDeviceId]);

  useEffect(() => {
    if (!deviceId) { setOverview(null); return; }
    let active = true;
    jsonRequest('/api/industrial/commissioning?' + new URLSearchParams({ deviceId }))
      .then((data) => { if (active) { setOverview(data as unknown as Overview); setError(''); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'LOAD_FAILED'); });
    return () => { active = false; };
  }, [deviceId]);

  const allowedEquipment = useMemo(() =>
    (overview?.equipment ?? []).filter((item) =>
      item.equipmentType !== 'PANEL' && item.equipmentType !== 'CIRCUIT_BREAKER'),
    [overview]);
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
        profile?.alias,
        profile?.partNumber,
        profile?.macAddress,
        profile?.gatewayNumber,
        profile?.meterNumber,
        profile?.loginUsername,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [allowedEquipment, equipmentSearch, profileByEquipmentId]);
  const gateways = useMemo(() => overview?.profiles.filter((profile) => profile.role === 'GATEWAY') ?? [], [overview]);
  const meters = useMemo(() => overview?.profiles.filter((profile) => profile.role === 'METER') ?? [], [overview]);
  const mappableMeters = useMemo(
    () => meters.filter((meter) =>
      gateways.some((gateway) =>
        gateway.equipmentId === meter.gatewayEquipmentId && Boolean(gateway.sourceIdentity),
      ),
    ),
    [gateways, meters],
  );
  const breakers = useMemo(() => overview?.equipment.filter((item) => item.equipmentType === 'CIRCUIT_BREAKER') ?? [], [overview]);
  const existingProfile = overview?.profiles.find((profile) => profile.equipmentId === equipmentId);
  const mappingsByMeter = useMemo(() => {
    const map = new Map<string, Map<number, Mapping>>();
    for (const mapping of overview?.mappings ?? []) {
      const channels = map.get(mapping.meterEquipmentId) ?? new Map<number, Mapping>();
      channels.set(mapping.channel, mapping);
      map.set(mapping.meterEquipmentId, channels);
    }
    return map;
  }, [overview]);
  const equipmentName = (id: string) => overview?.equipment.find((item) => item.id === id)?.name ?? id;

  function selectProfile(id: string) {
    setEquipmentId(id);
    const current = overview?.profiles.find((item) => item.equipmentId === id);
    if (!current) {
      setRole('GATEWAY');
      setGatewayEquipmentId('');
      setAlias('');
      setPartNumber('');
      setRecordStatus('DECLARED');
      setSourceIdentity('');
      setMacAddress('');
      setLoginUsername('');
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
    setAlias(current.alias ?? '');
    setPartNumber(current.partNumber ?? '');
    setRecordStatus(current.recordStatus);
    setSourceIdentity(current.sourceIdentity ?? '');
    setMacAddress(current.macAddress ?? '');
    setLoginUsername(current.loginUsername ?? '');
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

  async function mutate(action: string, input: Record<string, unknown>, expectedRevision?: number | null) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await jsonRequest('/api/industrial/commissioning', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action, input, ...(expectedRevision !== undefined ? { expectedRevision } : {}),
        }),
      });
      await refresh(deviceId);
      setPhysicallyVerified(false);
      setRetireKey(null);
      setNotice('Cambio registrado. No implica verificación de conectividad en campo.');
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
      baudRate: Number(baudRate), dataBits: Number(dataBits),
      parity, stopBits: Number(stopBits),
      ...(role === 'METER' ? { slaveId: Number(slaveId) } : {}),
    };
    const services = [
      ...(mqttEnabled
        ? [{ protocol: 'MQTT' as const, ...(mqttPort.trim() ? { port: Number(mqttPort) } : {}) }]
        : []),
      ...(modbusTcpEnabled
        ? [{
            protocol: 'MODBUS_TCP' as const,
            ...(modbusTcpPort.trim() ? { port: Number(modbusTcpPort) } : {}),
          }]
        : []),
    ];
    const input = {
      equipmentId,
      role,
      recordStatus,
      rs485,
      evidence,
      ...(alias.trim() ? { alias: alias.trim() } : {}),
      ...(partNumber.trim() ? { partNumber: partNumber.trim() } : {}),
      ...(role === 'GATEWAY' ? {
        ...(sourceIdentity.trim() ? { sourceIdentity: sourceIdentity.trim() } : {}),
        ...(macAddress.trim() ? { macAddress: macAddress.trim() } : {}),
        ...(loginUsername.trim() ? { loginUsername: loginUsername.trim() } : {}),
        ...(credentialRef.trim() ? { credentialRef: credentialRef.trim() } : {}),
        ...(gatewayNumber.trim() ? { gatewayNumber: gatewayNumber.trim() } : {}),
        ...(downlinkMode.trim() ? { downlinkMode: downlinkMode.trim() } : {}),
        ...(declaredSlaveCount.trim()
          ? { declaredSlaveCount: Number(declaredSlaveCount) }
          : {}),
        network: { ip, mask, gateway: networkGateway, services },
      } : {
        gatewayEquipmentId,
        ...(meterNumber.trim() ? { meterNumber: meterNumber.trim() } : {}),
        ...(channelCount.trim() ? { channelCount: Number(channelCount) } : {}),
        ...(channelDescription.trim()
          ? { channelDescription: channelDescription.trim() }
          : {}),
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
      meterEquipmentId: meterId, breakerId, channel: Number(channel),
      rawPointId, metrics: selectedMetrics, physicallyVerified: true, evidence,
    });
  }

  return (
    <main style={{ padding: '24px', maxWidth: 1160, margin: '0 auto', display: 'grid', gap: 24 }}>
      <header>
        <a href="/telemetry">← Telemetría</a>
        <h1 style={{ marginTop: 12 }}>Comisionamiento industrial · Acrel</h1>
        <p>Configura comunicaciones y asocia canales a breakers existentes. No crea equipos, breakers ni lecturas.</p>
      </header>

      <section style={{ display: 'grid', gap: 8 }}>
        <label style={fieldStyle}>BDFB existente
          <select style={inputStyle} value={deviceId} onChange={(event) => {
            setDeviceId(event.target.value); setEquipmentId(''); setNotice('');
          }}>
            <option value="">Seleccionar BDFB</option>
            {bdfbs.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        {!bdfbs.length && <p>No hay BDFB activos registrados. Primero créalos en la topología existente.</p>}
      </section>

      {error && <p role="alert" style={{ color: '#aa2530' }}>{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {overview && (
        <>
          <section style={{ border: '1px solid #c8ced6', borderRadius: 12, padding: 18, display: 'grid', gap: 16 }}>
            <h2>1 · Configuración de comunicaciones</h2>
            <p>Selecciona un Equipment existente. Un gateway conserva la IP y la identidad del publicador; un medidor declara su Slave ID en el bus de ese gateway.</p>
            <form onSubmit={submitProfile} style={{ display: 'grid', gap: 14 }}>
              <div style={gridStyle}>
                <label style={fieldStyle}>Buscar Equipment / alias / serial / MAC / login
                  <input
                    style={inputStyle}
                    value={equipmentSearch}
                    onChange={(event) => setEquipmentSearch(event.target.value)}
                    placeholder="Buscar..."
                  />
                </label>
                <label style={fieldStyle}>Equipment
                  <select required style={inputStyle} value={equipmentId} onChange={(event) => selectProfile(event.target.value)}>
                    <option value="">Seleccionar equipo</option>
                    {filteredEquipment.map((item) => {
                      const profile = profileByEquipmentId.get(item.id);
                      return (
                        <option key={item.id} value={item.id}>
                          {profile?.alias ? profile.alias + ' · ' : ''}{item.name} · {item.equipmentType}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label style={fieldStyle}>Función
                  <select style={inputStyle} value={role} disabled={!!existingProfile}
                    onChange={(event) => setRole(event.target.value as ProfileRole)}>
                    <option value="GATEWAY">Gateway Acrel</option>
                    <option value="METER">Medidor AMC16Z</option>
                  </select>
                </label>
              </div>
              <div style={gridStyle}>
                <label style={fieldStyle}>Alias / NE Name / TID
                  <input
                    style={inputStyle}
                    value={alias}
                    onChange={(event) => setAlias(event.target.value)}
                    placeholder="Nombre operativo para búsqueda"
                  />
                </label>
                <label style={fieldStyle}>Part Number (P/N)
                  <input
                    style={inputStyle}
                    value={partNumber}
                    onChange={(event) => setPartNumber(event.target.value)}
                    placeholder="Ej. AWT100-CEHW"
                  />
                </label>
                <label style={fieldStyle}>Estado del registro
                  <select
                    style={inputStyle}
                    value={recordStatus}
                    onChange={(event) =>
                      setRecordStatus(event.target.value as 'DECLARED' | 'FIELD_VERIFIED')
                    }
                  >
                    <option value="DECLARED">Declarado / documental</option>
                    <option value="FIELD_VERIFIED">Verificado en campo</option>
                  </select>
                </label>
                <label style={fieldStyle}>Serial canónico
                  <input
                    style={inputStyle}
                    readOnly
                    value={
                      allowedEquipment.find((item) => item.id === equipmentId)?.serialNumber ?? ''
                    }
                    placeholder="Se administra en Equipment"
                  />
                </label>
              </div>
              {role === 'GATEWAY' ? (
                <div style={gridStyle}>
                  <label style={fieldStyle}>Gateway Number
                    <input style={inputStyle} value={gatewayNumber}
                      onChange={(event) => setGatewayNumber(event.target.value)} />
                  </label>
                  <label style={fieldStyle}>MAC Ethernet
                    <input style={inputStyle} value={macAddress}
                      onChange={(event) => setMacAddress(event.target.value)}
                      placeholder="00:00:00:00:00:00" />
                  </label>
                  <label style={fieldStyle}>Login / usuario
                    <input style={inputStyle} value={loginUsername}
                      onChange={(event) => setLoginUsername(event.target.value)}
                      autoComplete="off" />
                  </label>
                  <label style={fieldStyle}>Referencia de credencial
                    <input style={inputStyle} value={credentialRef}
                      onChange={(event) => setCredentialRef(event.target.value)}
                      placeholder="Referencia a vault/secret; nunca la contraseña" />
                  </label>
                  <label style={fieldStyle}>Modo downlink
                    <input style={inputStyle} value={downlinkMode}
                      onChange={(event) => setDownlinkMode(event.target.value)}
                      placeholder="Ej. Modbus-RTU Master" />
                  </label>
                  <label style={fieldStyle}>Esclavos declarados
                    <input type="number" min="0" max="247" style={inputStyle}
                      value={declaredSlaveCount}
                      onChange={(event) => setDeclaredSlaveCount(event.target.value)} />
                  </label>
                  <label style={fieldStyle}>Identidad MQTT del publicador (cuando esté confirmada)
                    <input style={inputStyle} value={sourceIdentity} onChange={(event) => setSourceIdentity(event.target.value)} placeholder="No inventar: dejar vacío si aún no está confirmada" />
                  </label>
                  <label style={fieldStyle}>IPv4
                    <input required style={inputStyle} value={ip} onChange={(event) => setIp(event.target.value)} placeholder="192.168.x.x" />
                  </label>
                  <label style={fieldStyle}>Máscara
                    <input required style={inputStyle} value={mask} onChange={(event) => setMask(event.target.value)} />
                  </label>
                  <label style={fieldStyle}>Puerta de enlace
                    <input required style={inputStyle} value={networkGateway} onChange={(event) => setNetworkGateway(event.target.value)} />
                  </label>
                  <fieldset style={{ border: '1px solid #c8ced6', borderRadius: 8, padding: 10 }}>
                    <legend>Servicios uplink</legend>
                    <label>
                      <input type="checkbox" checked={mqttEnabled}
                        onChange={(event) => setMqttEnabled(event.target.checked)} /> MQTT
                    </label>
                    <input type="number" min="1" max="65535" style={inputStyle}
                      value={mqttPort} disabled={!mqttEnabled}
                      onChange={(event) => setMqttPort(event.target.value)}
                      placeholder="Puerto no documentado: dejar vacío" />
                    <label>
                      <input type="checkbox" checked={modbusTcpEnabled}
                        onChange={(event) => setModbusTcpEnabled(event.target.checked)} /> Modbus TCP
                    </label>
                    <input type="number" min="1" max="65535" style={inputStyle}
                      value={modbusTcpPort} disabled={!modbusTcpEnabled}
                      onChange={(event) => setModbusTcpPort(event.target.value)}
                      placeholder="Ej. 502" />
                    {!mqttEnabled && !modbusTcpEnabled ? (
                      <small role="alert">Selecciona al menos un servicio uplink.</small>
                    ) : null}
                  </fieldset>
                </div>
              ) : (
                <div style={gridStyle}>
                  <label style={fieldStyle}>Meter Number
                    <input style={inputStyle} value={meterNumber}
                      onChange={(event) => setMeterNumber(event.target.value)}
                      placeholder="Ej. A1" />
                  </label>
                  <label style={fieldStyle}>Canales activos
                    <input type="number" min="1" max="256" style={inputStyle}
                      value={channelCount}
                      onChange={(event) => setChannelCount(event.target.value)} />
                  </label>
                  <label style={fieldStyle}>Descripción de canales
                    <input style={inputStyle} value={channelDescription}
                      onChange={(event) => setChannelDescription(event.target.value)}
                      placeholder="Ej. 24 Circuitos DC (12 Bus A + 12 Bus B)" />
                  </label>
                  <label style={fieldStyle}>Sensor Hall
                    <input style={inputStyle} value={hallSensorDescription}
                      onChange={(event) => setHallSensorDescription(event.target.value)}
                      placeholder="Modelo / rango / salida" />
                  </label>
                  <label style={fieldStyle}>Terminación 120 Ω
                    <select
                      style={inputStyle}
                      value={termination120Ohm ? 'YES' : 'NO'}
                      onChange={(event) => setTermination120Ohm(event.target.value === 'YES')}
                    >
                      <option value="NO">No</option>
                      <option value="YES">Sí</option>
                    </select>
                  </label>
                  <label style={fieldStyle}>Estado RS485 documentado
                    <input style={inputStyle} value={documentedRs485Status}
                      onChange={(event) => setDocumentedRs485Status(event.target.value)}
                      placeholder="Ej. ONLINE / OK (documental)" />
                  </label>
                  <label style={fieldStyle}>Gateway en este BDFB
                    <select required style={inputStyle} value={gatewayEquipmentId} onChange={(event) => {
                      const id = event.target.value;
                      setGatewayEquipmentId(id);
                      const gateway = gateways.find((item) => item.equipmentId === id);
                      if (gateway) {
                        setBaudRate(String(gateway.rs485.baudRate));
                        setDataBits(String(gateway.rs485.dataBits) as '7' | '8');
                        setParity(gateway.rs485.parity);
                        setStopBits(String(gateway.rs485.stopBits) as '1' | '2');
                      }
                    }}>
                      <option value="">Seleccionar</option>
                      {gateways.map((item) => <option value={item.equipmentId} key={item.equipmentId}>{equipmentName(item.equipmentId)}</option>)}
                    </select>
                  </label>
                  <label style={fieldStyle}>Slave ID (1–247)
                    <input required type="number" min="1" max="247" style={inputStyle} value={slaveId} onChange={(event) => setSlaveId(event.target.value)} />
                  </label>
                </div>
              )}
              <div style={gridStyle}>
                <label style={fieldStyle}>Baud rate
                  <input required type="number" min="300" max="115200" style={inputStyle} value={baudRate} readOnly={role === 'METER'} onChange={(event) => setBaudRate(event.target.value)} />
                </label>
                <label style={fieldStyle}>Bits de datos
                  <select style={inputStyle} value={dataBits} disabled={role === 'METER'} onChange={(event) => setDataBits(event.target.value as '7' | '8')}>
                    <option value="8">8</option><option value="7">7</option>
                  </select>
                </label>
                <label style={fieldStyle}>Paridad
                  <select style={inputStyle} value={parity} disabled={role === 'METER'} onChange={(event) => setParity(event.target.value as 'NONE' | 'EVEN' | 'ODD')}>
                    <option value="NONE">Ninguna</option><option value="EVEN">Par</option><option value="ODD">Impar</option>
                  </select>
                </label>
                <label style={fieldStyle}>Bits de parada
                  <select style={inputStyle} value={stopBits} disabled={role === 'METER'} onChange={(event) => setStopBits(event.target.value as '1' | '2')}>
                    <option value="1">1</option><option value="2">2</option>
                  </select>
                </label>
              </div>

              <h3>3 · Procedencia del dato</h3>
              <div style={gridStyle}>
                <label style={fieldStyle}>Project ID
                  <input required style={inputStyle} value={projectId} onChange={(event) => setProjectId(event.target.value)} />
                </label>
                <label style={fieldStyle}>Nombre del proyecto
                  <input style={inputStyle} value={projectName} onChange={(event) => setProjectName(event.target.value)} />
                </label>
                <label style={fieldStyle}>Site / ubicación
                  <input style={inputStyle} value={site} onChange={(event) => setSite(event.target.value)} />
                </label>
                <label style={fieldStyle}>Cliente / operador
                  <input style={inputStyle} value={client} onChange={(event) => setClient(event.target.value)} />
                </label>
                <label style={fieldStyle}>Responsable
                  <input style={inputStyle} value={responsible} onChange={(event) => setResponsible(event.target.value)} />
                </label>
                <label style={fieldStyle}>Fecha del documento
                  <input style={inputStyle} value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} placeholder="YYYY-MM-DD" />
                </label>
                <label style={fieldStyle}>Estado del documento
                  <input style={inputStyle} value={documentStatus} onChange={(event) => setDocumentStatus(event.target.value)} />
                </label>
                <label style={fieldStyle}>Documento de origen
                  <input required style={inputStyle} value={documentName} onChange={(event) => setDocumentName(event.target.value)} />
                </label>
                <label style={fieldStyle}>Revisión
                  <input required style={inputStyle} value={revision} onChange={(event) => setRevision(event.target.value)} />
                </label>
                <label style={fieldStyle}>Referencia / evidencia (sin credenciales)
                  <input style={inputStyle} value={reference} onChange={(event) => setReference(event.target.value)} />
                </label>
              </div>
              <p style={{ fontSize: 12 }}>
                El usuario y la fecha de edición se obtienen de la sesión del servidor. El login
                del equipo puede registrarse; la contraseña no. Usa únicamente una referencia a
                un vault/secret manager en “Referencia de credencial”.
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
                  {existingProfile ? 'Guardar nueva revisión' : 'Registrar configuración'}
                </button>
                {existingProfile && <span style={{ marginLeft: 12 }}>Revisión {existingProfile.revisionNumber} · {existingProfile.updatedAt}</span>}
              </div>
            </form>
            {overview.profiles.length > 0 &&
              <div style={gridStyle}>{overview.profiles.map((item) =>
                <article key={item.equipmentId} style={{ border: '1px solid #c8ced6', borderRadius: 8, padding: 12 }}>
                  <strong>{item.alias ? item.alias + ' · ' : ''}{equipmentName(item.equipmentId)}</strong>
                  <div>
                    {item.role} · {item.role === 'GATEWAY'
                      ? (item.network?.services
                          .map((service) => service.protocol + (service.port ? ':' + service.port : ''))
                          .join(' + ') || 'Sin uplink')
                      : 'Slave ' + item.rs485.slaveId}
                    {item.role === 'GATEWAY'
                      ? ' · ' + (item.sourceIdentity ?? 'MQTT identity pendiente')
                      : ''}
                  </div>
                  <small>Revisión {item.revisionNumber} · {item.evidence.documentName} / {item.evidence.revision}</small>
                  <div><button type="button" onClick={() => selectProfile(item.equipmentId)}>Editar configuración</button></div>
                </article>)}</div>}
          </section>

          <section style={{ border: '1px solid #c8ced6', borderRadius: 12, padding: 18, display: 'grid', gap: 14 }}>
            <h2>2 · Mapeo físico del canal</h2>
            <p>El canal y el punto MQTT no se calculan según la posición del breaker. Debes confirmar el vínculo con evidencia de campo.</p>
            {meters.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {meters.map((meter) => {
                  const gateway = gateways.find(
                    (item) => item.equipmentId === meter.gatewayEquipmentId,
                  );
                  const channelMap = mappingsByMeter.get(meter.equipmentId) ?? new Map<number, Mapping>();
                  return (
                    <details key={meter.equipmentId}>
                      <summary>
                        {equipmentName(meter.equipmentId)} · Slave {meter.rs485.slaveId} ·{' '}
                        {channelMap.size}/{meter.channelCount ?? 24} canales confirmados
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
                              <strong>CH {String(number).padStart(2, '0')}</strong>
                              <br />
                              <small>
                                {mapping
                                  ? equipmentName(mapping.breakerId) + ' · ' + mapping.rawPointId
                                  : 'Pendiente de verificación'}
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
                <label style={fieldStyle}>Medidor comisionado
                  <select required style={inputStyle} value={meterId} onChange={(event) => setMeterId(event.target.value)}>
                    <option value="">Seleccionar</option>
                    {mappableMeters.map((item) => <option key={item.equipmentId} value={item.equipmentId}>{equipmentName(item.equipmentId)} · Slave {item.rs485.slaveId}</option>)}
                  </select>
                </label>
                {meters.length > mappableMeters.length ? (
                  <small>
                    Los medidores cuyo gateway aún no tiene identidad MQTT confirmada no pueden mapearse.
                  </small>
                ) : null}
                <label style={fieldStyle}>Canal
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
                <label style={fieldStyle}>Punto MQTT exacto
                  <input required style={inputStyle} value={rawPointId} onChange={(event) => setRawPointId(event.target.value)} placeholder="Ej. 0_1_1" />
                </label>
                <label style={fieldStyle}>Breaker existente
                  <select required style={inputStyle} value={breakerId} onChange={(event) => setBreakerId(event.target.value)}>
                    <option value="">Seleccionar</option>
                    {breakers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
                  </select>
                </label>
              </div>
              <fieldset>
                <legend>Métricas habilitadas</legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                  {metrics.map((metric) =>
                    <label key={metric}><input type="checkbox" checked={selectedMetrics.includes(metric)}
                      onChange={(event) => setSelectedMetrics((current) =>
                        event.target.checked ? [...current, metric] : current.filter((item) => item !== metric))} /> {metric}</label>)}
                </div>
              </fieldset>
              <label><input type="checkbox" checked={physicallyVerified}
                onChange={(event) => setPhysicallyVerified(event.target.checked)} />
                {' '}Confirmo haber verificado físicamente medidor, canal, punto publicado y breaker seleccionado.
              </label>
              <p style={{ fontSize: 12 }}>Usará el proyecto, documento y revisión del formulario superior. Se guardará quién confirmó y cuándo.</p>
              <div>
                <button type="submit" disabled={!canWrite || busy || !physicallyVerified || !selectedMetrics.length || !meterId || !breakerId}>
                  Confirmar y vincular telemetría
                </button>
              </div>
            </form>
          </section>

          <section style={{ border: '1px solid #c8ced6', borderRadius: 12, padding: 18, display: 'grid', gap: 12 }}>
            <h2>Asociaciones confirmadas</h2>
            {!overview.mappings.length && <p>No hay canales Acrel confirmados en este BDFB.</p>}
            {overview.mappings.map((item) => {
              const key = item.breakerId + '|' + item.sourceIdentity + '|' + item.rawPointId;
              return <article key={key} style={{ borderTop: '1px solid #d4d8de', paddingTop: 12 }}>
                <strong>{equipmentName(item.breakerId)}</strong>
                <p style={{ margin: '5px 0' }}>{equipmentName(item.gatewayEquipmentId)} → {equipmentName(item.meterEquipmentId)} → canal {item.channel} → {item.rawPointId}</p>
                <small>{item.metrics.join(', ')} · {item.evidence?.documentName} / {item.evidence?.revision} · {item.confirmedAt} · usuario {item.confirmedBy}</small>
                {canWrite && <div style={{ marginTop: 10 }}>
                  <label><input type="checkbox" checked={retireKey === key}
                    onChange={(event) => setRetireKey(event.target.checked ? key : null)} /> Confirmo retirar esta asociación sin borrar su historial.</label>
                  <button type="button" disabled={busy || retireKey !== key} style={{ marginLeft: 12 }}
                    onClick={() => void mutate('retire-channel', {
                      breakerId: item.breakerId, sourceIdentity: item.sourceIdentity,
                      rawPointId: item.rawPointId, evidence, confirmRetirement: true,
                    })}>Retirar mapeo</button>
                </div>}
              </article>;
            })}
          </section>
        </>
      )}
    </main>
  );
}
